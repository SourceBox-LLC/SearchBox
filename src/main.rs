// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 SourceBox LLC

// Release builds on Windows: no console. When launched from the MSI's
// Start Menu shortcut, a black terminal is jarring; server output goes
// to a rotating log file under `<base_dir>/log/` instead. Debug builds
// keep the console attached so `cargo run` works the obvious way.
#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

mod assets;
mod auth;
mod config;
mod db;
mod error;
mod jobs;
mod models;
mod routes;
mod services;
mod state;
mod templates;
mod vault;

#[cfg(test)]
mod integration_tests;

use std::sync::Arc;

use anyhow::{Context, Result};
use axum::body::Bytes;
use axum::extract::Path as AxumPath;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use time::Duration;
use tokio::net::TcpListener;
use tokio::sync::Notify;
use tower_http::trace::TraceLayer;
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::SqliteStore;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::assets::StaticDir;
use crate::config::Config;
use crate::services::meili_process::MeiliSupervisor;
use crate::state::AppState;
use crate::templates::Templates;

fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    // Load config first so we know where to write log files. Bootstrap
    // errors before this point go to stderr via eprintln!.
    let config = Config::from_env().unwrap_or_else(|e| {
        eprintln!("config error: {e:#}");
        std::process::exit(1);
    });

    std::fs::create_dir_all(&config.vault_dir).context("ensure vault dir")?;
    std::fs::create_dir_all(&config.meili_data_dir).context("ensure meili dir")?;
    std::fs::create_dir_all(&config.thumbnails_dir).context("ensure thumbnails dir")?;
    std::fs::create_dir_all(&config.log_dir).context("ensure log dir")?;

    // WebView2 (the Windows desktop window) stores its profile/cache in a
    // "user data folder". Its default is next to the .exe, which is read-only
    // when installed under Program Files (the MSI) — WebView2 then fails with
    // 0x80070005 (access denied) and the window never opens. Redirect it to a
    // per-user writable dir. Must be set before the WebView is created and
    // before we spawn any threads.
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        let wv_dir = config.base_dir.join("webview2");
        let _ = std::fs::create_dir_all(&wv_dir);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &wv_dir);
    }

    // Rotating daily log file at <base_dir>/log/searchbox.log. The
    // `_log_guard` binding MUST outlive main() — dropping it flushes
    // buffered writes, so we hold it here for the process lifetime.
    let file_appender = tracing_appender::rolling::daily(&config.log_dir, "searchbox.log");
    let (file_writer, _log_guard) = tracing_appender::non_blocking(file_appender);

    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn"));
    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer()) // stdout — no-op when console is hidden
        .with(fmt::layer().with_ansi(false).with_writer(file_writer))
        .init();

    tracing::info!(db = %config.db_path().display(), log_dir = %config.log_dir.display(), "config loaded");

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("create tokio runtime")?;

    // Bind the listening socket up front — synchronously, before we open
    // the window or start the runtime workers. This is how we detect "user
    // launched a second instance": the second process loses the bind race
    // and exits cleanly (the first instance already owns the window), so we
    // never end up with two windows fighting over the same port.
    let addr = format!("{}:{}", config.host, config.port);
    let listener = match runtime.block_on(TcpListener::bind(&addr)) {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            tracing::warn!(%addr, "port already in use; another SearchBox instance is already running — exiting");
            return Ok(());
        }
        Err(e) => return Err(e).with_context(|| format!("bind {addr}")),
    };
    tracing::info!(%addr, "searchbox listening");

    let shutdown = Arc::new(Notify::new());
    let meili_proc = Arc::new(MeiliSupervisor::default());

    let server_handle = {
        let shutdown = shutdown.clone();
        let meili = meili_proc.clone();
        let cfg = config.clone();
        runtime.spawn(async move { run_server(cfg, listener, meili, shutdown).await })
    };

    // Windows release: the WebView window owns the main thread until the
    // user closes it. Everywhere else (dev `cargo run`, Linux, macOS, the
    // Docker/server build) just block on Ctrl-C. Same shutdown plumbing in
    // both branches.
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        let host = if config.host == "0.0.0.0" {
            "localhost".to_string()
        } else {
            config.host.clone()
        };
        let url = format!("http://{host}:{}", config.port);
        // Wait until the in-process server actually answers before pointing
        // the WebView at it, so a slow first boot (DB open + session migrate)
        // doesn't flash a connection error in the window.
        wait_for_server(&runtime, &url);
        run_webview(&url, shutdown.clone());
    }

    #[cfg(not(all(target_os = "windows", not(debug_assertions))))]
    {
        runtime.block_on(async {
            let _ = tokio::signal::ctrl_c().await;
        });
        shutdown.notify_one();
    }

    // Graceful drain: wait for axum to finish (it observes `shutdown` via
    // `with_graceful_shutdown`), then stop the Meilisearch sidecar so we
    // don't leave it orphaned.
    runtime.block_on(async {
        if let Err(e) = server_handle.await {
            tracing::warn!("server task join error: {e}");
        }
        if let Err(e) = meili_proc.stop().await {
            tracing::warn!("meili stop error: {e}");
        }
    });

    tracing::info!("searchbox exited");
    Ok(())
}

async fn run_server(
    config: Config,
    listener: TcpListener,
    meili_proc: Arc<MeiliSupervisor>,
    shutdown: Arc<Notify>,
) -> Result<()> {
    let db = db::connect(&config.db_path()).await?;
    db::init_schema(&db).await?;
    tracing::info!("db connected, schema applied");

    // Session store shares the app DB. Its own `tower_sessions` table is
    // created in-migrate on first use — separate from our CREATE TABLE IF
    // NOT EXISTS schema.
    let session_store = SqliteStore::new(db.clone());
    session_store
        .migrate()
        .await
        .context("tower-sessions migrate")?;
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false) // dev over HTTP; flip in prod behind TLS
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(Duration::days(30)));

    let templates = Templates::new()?;

    let state = AppState {
        config: Arc::new(config.clone()),
        db,
        templates,
        jobs: Arc::new(jobs::JobRegistry::default()),
        meili_proc: meili_proc.clone(),
    };

    // Restore persisted jobs from DB
    if let Err(e) = state.jobs.load_from_db(&state.db).await {
        tracing::warn!("failed to load persisted jobs: {e}");
    }

    // Spawn periodic task: persist jobs + check timeouts every 60s
    {
        let jobs = state.jobs.clone();
        let db = state.db.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                interval.tick().await;
                jobs.check_timeouts(1800); // 30-minute timeout
                jobs.cleanup_old_jobs(3600); // remove finished jobs > 1h old
                if let Err(e) = jobs.persist(&db).await {
                    tracing::warn!("failed to persist jobs: {e}");
                }
            }
        });
    }

    // Clone the bits we need for the auto-start Meilisearch task BEFORE
    // handing `state` off to `routes::router`, which takes ownership.
    let meili_for_boot = meili_proc.clone();
    let db_for_boot = state.db.clone();
    let cfg_for_boot = state.config.clone();

    let app = routes::router(state)
        .route("/static/{*path}", get(serve_static))
        .layer(session_layer)
        .layer(TraceLayer::new_for_http());

    // Auto-start the Meilisearch sidecar when the user hasn't explicitly
    // opted out (`auto_start=false` in settings). First-boot default is
    // on — the MSI drops meilisearch.exe next to our binary and the
    // sibling-autodetect in MeiliSupervisor picks it up. Errors are
    // logged, not fatal: the app still boots, and the Settings UI can
    // be used to surface / fix the configuration.
    {
        let meili_proc = meili_for_boot;
        let db = db_for_boot;
        let app_cfg = cfg_for_boot;
        tokio::spawn(async move {
            let auto_start = crate::models::Settings::get(&db, "auto_start")
                .await
                .ok()
                .flatten()
                .map(|v| !matches!(v.to_ascii_lowercase().as_str(), "false" | "0" | "no"))
                .unwrap_or(true);
            if !auto_start {
                tracing::info!("meili auto_start disabled; skipping");
                return;
            }
            match meili_proc.start(&app_cfg, &db).await {
                Ok(()) => tracing::info!("meili auto-start initiated"),
                Err(e) => tracing::warn!("meili auto-start failed: {e}"),
            }
        });
    }

    let shutdown_signal = shutdown.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal.notified().await;
            tracing::info!("graceful shutdown initiated");
        })
        .await
        .context("axum serve")?;

    Ok(())
}

/// Serve a file out of the embedded `static/` archive. In debug builds
/// rust-embed reads from disk, so CSS/JS edits don't need a rebuild.
/// 404 for anything not in the archive — notably `thumbnails/*` is
/// excluded (they're runtime-generated and served authed via
/// `/api/thumbnail/{id}`).
async fn serve_static(AxumPath(path): AxumPath<String>) -> Response {
    match StaticDir::get(&path) {
        Some(file) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime.as_ref())],
                Bytes::from(file.data.into_owned()),
            )
                .into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Block until the in-process server answers `/api/health`, or ~10s elapse.
/// Lets the WebView load a server that's actually serving rather than
/// racing the DB-open / session-migrate that run before `axum::serve`.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn wait_for_server(runtime: &tokio::runtime::Runtime, url: &str) {
    let health = format!("{url}/api/health");
    runtime.block_on(async {
        let client = reqwest::Client::new();
        for _ in 0..100 {
            if let Ok(resp) = client.get(&health).send().await {
                if resp.status().is_success() {
                    return;
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        tracing::warn!("server not ready after timeout; opening window anyway");
    });
}

// Native desktop window on the main thread. wry renders the existing web UI
// (served by our own axum server on localhost) inside a WebView2 window, so
// SearchBox is a real app rather than a browser tab. tao supplies the event
// loop + window; wry attaches the WebView via raw-window-handle.
//
// Closing the window flips the shutdown Notify (which axum's
// `with_graceful_shutdown` awaits) and exits the loop; `main` then drains
// the runtime and stops Meilisearch — no lingering background process.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn run_webview(url: &str, shutdown: Arc<Notify>) {
    use tao::dpi::LogicalSize;
    use tao::event::{Event, WindowEvent};
    use tao::event_loop::{ControlFlow, EventLoop};
    use tao::platform::run_return::EventLoopExtRunReturn;
    use tao::window::WindowBuilder;
    use wry::WebViewBuilder;

    let mut event_loop = EventLoop::new();
    let window = match WindowBuilder::new()
        .with_title("SearchBox")
        .with_inner_size(LogicalSize::new(1280.0, 820.0))
        .build(&event_loop)
    {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("failed to create window: {e}; shutting down");
            shutdown.notify_one();
            return;
        }
    };

    // Keep the WebView bound for the lifetime of the loop — dropping it
    // would tear down the rendered page.
    let _webview = match WebViewBuilder::new().with_url(url).build(&window) {
        Ok(wv) => wv,
        Err(e) => {
            tracing::error!("failed to create webview: {e}; shutting down");
            shutdown.notify_one();
            return;
        }
    };

    event_loop.run_return(move |event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            tracing::info!("window closed; quitting searchbox");
            shutdown.notify_one();
            *control_flow = ControlFlow::Exit;
        }
    });
}
