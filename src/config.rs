use std::env;
use std::path::PathBuf;

use anyhow::{Context, Result};

/// Runtime configuration. Env-driven; anything that should be tweakable at
/// runtime (Meilisearch path/port, Ollama URL, qBittorrent creds, …) lives
/// in the `settings` table and is loaded on demand by the services that
/// need it.
#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,

    /// Root for the writable runtime dirs (vault/, meili_data/, log/, webview2/).
    /// Only read on Windows release builds (to site the WebView2 data folder).
    #[allow(dead_code)]
    pub base_dir: PathBuf,
    pub db_dir: PathBuf,
    pub vault_dir: PathBuf,
    pub meili_data_dir: PathBuf,
    pub thumbnails_dir: PathBuf,
    pub log_dir: PathBuf,

    /// Maximum upload size in bytes (default: 100MB)
    pub max_upload_size: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        // Templates and static assets are embedded in the binary, so the
        // only filesystem paths we still need to resolve are the writable
        // runtime dirs (DB, vault, Meili data, thumbnails).
        //
        // Resolution order for `base_dir`:
        //   1. `SEARCHBOX_BASE_DIR` env var              — explicit wins
        //   2. OS user-data dir IF the exe lives in a    — polished install
        //      system install location (Program Files,     (MSI, /usr/…)
        //      /usr/*, /opt/*)
        //   3. current working directory                 — dev checkout
        let base_dir = if let Ok(d) = env::var("SEARCHBOX_BASE_DIR") {
            PathBuf::from(d)
        } else if let Some(dir) = user_data_dir_if_system_installed() {
            std::fs::create_dir_all(&dir)
                .with_context(|| format!("create user data dir {}", dir.display()))?;
            dir
        } else {
            env::current_dir().context("resolve current dir")?
        };

        let db_dir = env::var("SEARCHBOX_DB_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| base_dir.clone());

        let vault_dir = base_dir.join("vault");
        let meili_data_dir = base_dir.join("meili_data");
        let thumbnails_dir = base_dir.join("static").join("thumbnails");
        let log_dir = base_dir.join("log");

        Ok(Self {
            // Local-first by default: bind loopback only, so the UI + API (and the
            // file contents they expose) aren't reachable from the LAN. Opt into
            // network access explicitly with SEARCHBOX_HOST=0.0.0.0.
            host: env::var("SEARCHBOX_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: env::var("SEARCHBOX_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8080),
            base_dir,
            db_dir,
            vault_dir,
            meili_data_dir,
            thumbnails_dir,
            log_dir,
            max_upload_size: env::var("SEARCHBOX_MAX_UPLOAD_SIZE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(100 * 1024 * 1024), // 100MB default
        })
    }

    pub fn db_path(&self) -> PathBuf {
        self.db_dir.join("searchbox.db")
    }
}

/// Returns `Some(dir)` when the running binary sits in a system-owned
/// install prefix (Program Files, /usr/*, /opt/*) — in that case we fall
/// back to the per-user writable data dir so runtime state doesn't try to
/// write into a location only admin has permission for. Returns `None`
/// when the binary is in an arbitrary directory (dev checkout, `cargo
/// run`, `~/bin`, …), so we keep the old cwd-based default there.
fn user_data_dir_if_system_installed() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let path = exe.to_string_lossy().to_ascii_lowercase();

    #[cfg(windows)]
    {
        let is_system = path.contains("\\program files\\")
            || path.contains("\\program files (x86)\\")
            || path.contains("\\programdata\\");
        if !is_system {
            return None;
        }
        // %LocalAppData%\SearchBox — per-user, roams only with the user, not
        // the machine; right for a single-user local-first app.
        let local = env::var("LOCALAPPDATA").ok()?;
        Some(PathBuf::from(local).join("SearchBox"))
    }

    #[cfg(unix)]
    {
        let is_system =
            path.starts_with("/usr/") || path.starts_with("/opt/") || path.starts_with("/snap/");
        if !is_system {
            return None;
        }
        // XDG_DATA_HOME if set, else ~/.local/share. SearchBox is local-first
        // so we don't bother with the system-wide /var/lib path.
        let dir = env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .ok()
            .or_else(|| {
                env::var("HOME")
                    .ok()
                    .map(|h| PathBuf::from(h).join(".local/share"))
            })?;
        Some(dir.join("searchbox"))
    }

    #[cfg(not(any(windows, unix)))]
    {
        None
    }
}
