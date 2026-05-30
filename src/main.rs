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

    // Bind the listening socket up front — synchronously, before we ever
    // spawn the tray or start the runtime workers. This is how we detect
    // "user double-clicked the shortcut twice": the second process loses
    // the bind race, opens the browser at the existing instance's URL,
    // and exits cleanly. Doing it here (rather than inside the axum task)
    // means the second process never creates a duplicate tray icon.
    let addr = format!("{}:{}", config.host, config.port);
    let listener = match runtime.block_on(TcpListener::bind(&addr)) {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            tracing::warn!(%addr, "port already in use; opening browser at existing instance and exiting");
            #[cfg(all(target_os = "windows", not(debug_assertions)))]
            open_browser(&config);
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

    // Windows release: tray icon owns the main thread until the user
    // picks "Quit". Everywhere else (dev `cargo run`, Linux, macOS) just
    // block on Ctrl-C. Same shutdown plumbing in both branches.
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        let host = if config.host == "0.0.0.0" {
            "localhost".to_string()
        } else {
            config.host.clone()
        };
        let url = format!("http://{host}:{}", config.port);
        run_tray(&url, shutdown.clone());
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

    // On a Windows release build (i.e. launched from the MSI's Start Menu
    // shortcut with no console attached) we're the user's only surface
    // into the app — pop the browser at their local URL. Dev builds skip
    // this so `cargo run` doesn't open a tab every code change.
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    open_browser(&config);

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

#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn open_browser(config: &Config) {
    let host = if config.host == "0.0.0.0" {
        "localhost"
    } else {
        config.host.as_str()
    };
    let url = format!("http://{host}:{}", config.port);
    tracing::info!(%url, "opening browser");
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn();
}

// System tray on the main thread. On Windows the shell-notify-icon API
// requires a message-pump on the thread that created the icon, so we
// can't push this onto a tokio worker — tao gives us the pump.
//
// The event loop blocks until the user picks "Quit"; at that point we
// flip the shutdown Notify, which axum's `with_graceful_shutdown` is
// awaiting on. Then we return and `main` drains the runtime.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn run_tray(url: &str, shutdown: Arc<Notify>) {
    use tao::event::Event;
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tao::platform::run_return::EventLoopExtRunReturn;
    use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
    use tray_icon::{Icon, TrayIconBuilder};

    #[derive(Debug)]
    enum UserEvent {
        Menu(tray_icon::menu::MenuId),
    }

    let mut event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

    let menu = Menu::new();
    let open_item = MenuItem::new("Open SearchBox", true, None);
    let separator = PredefinedMenuItem::separator();
    let quit_item = MenuItem::new("Quit SearchBox", true, None);
    if let Err(e) = menu.append(&open_item) {
        tracing::warn!("tray: append open: {e}");
    }
    if let Err(e) = menu.append(&separator) {
        tracing::warn!("tray: append separator: {e}");
    }
    if let Err(e) = menu.append(&quit_item) {
        tracing::warn!("tray: append quit: {e}");
    }

    let open_id = open_item.id().clone();
    let quit_id = quit_item.id().clone();

    // Pull the icon from the binary's own Windows resource section
    // (winresource embeds wix\assets\searchbox.ico as resource id 1 via
    // build.rs — see `set_icon` in winresource). If for some reason the
    // resource isn't present, fall back to a tray with no icon rather
    // than crashing — the menu still works.
    let icon = Icon::from_resource(1, None).ok();

    let mut builder = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip(format!("SearchBox · {url}"));
    if let Some(icon) = icon {
        builder = builder.with_icon(icon);
    }
    let tray = match builder.build() {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("tray build failed: {e}; shutting down");
            shutdown.notify_one();
            return;
        }
    };

    // Bridge tray-icon's static menu-event channel into the tao loop so
    // we can react to clicks without polling.
    let proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let _ = proxy.send_event(UserEvent::Menu(event.id));
    }));

    let url_owned = url.to_string();
    event_loop.run_return(move |event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::UserEvent(UserEvent::Menu(id)) = event {
            if id == open_id {
                let _ = std::process::Command::new("cmd")
                    .args(["/C", "start", "", &url_owned])
                    .spawn();
            } else if id == quit_id {
                tracing::info!("tray: quit selected");
                shutdown.notify_one();
                *control_flow = ControlFlow::Exit;
            }
        }
    });

    // Tray icon's Drop removes the shell-notify-icon entry — keep `tray`
    // alive until run_return returns, then drop it explicitly so the
    // icon disappears immediately rather than waiting for the function's
    // stack unwind during process teardown.
    drop(tray);
}
