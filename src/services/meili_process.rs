//! Start / stop the Meilisearch binary as a child process.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{anyhow, Context, Result};
use sqlx::SqlitePool;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::config::Config;
use crate::models::Settings;

#[derive(Default)]
pub struct MeiliSupervisor {
    child: Mutex<Option<Child>>,
}

impl MeiliSupervisor {
    pub async fn start(&self, app_cfg: &Config, db: &SqlitePool) -> Result<()> {
        let mut guard = self.child.lock().await;
        // If a Meilisearch we started is still alive, nothing to do. If it
        // exited (e.g. crashed on startup), drop the stale handle so we can
        // respawn — otherwise the Settings "Start" button is a no-op forever.
        if let Some(child) = guard.as_mut() {
            if matches!(child.try_wait(), Ok(None)) {
                return Ok(());
            }
        }
        *guard = None;
        let bin = match Settings::get(db, "meilisearch_path").await? {
            Some(b) if !b.is_empty() => b,
            _ => detect_sibling_meilisearch()
                .ok_or_else(|| anyhow!("meilisearch_path not configured"))?,
        };
        if !Path::new(&bin).is_file() {
            return Err(anyhow!("meilisearch binary not found at {bin}"));
        }
        let master = Settings::get(db, "master_key")
            .await?
            .unwrap_or_else(|| "aSampleMasterKey".into());
        let port = Settings::get(db, "meilisearch_port")
            .await?
            .unwrap_or_else(|| "7700".into());
        let data_path = Settings::get(db, "data_path")
            .await?
            .map(PathBuf::from)
            .unwrap_or_else(|| app_cfg.meili_data_dir.clone());

        std::fs::create_dir_all(&data_path).context("create meili data dir")?;

        let child = Command::new(&bin)
            .args([
                "--http-addr",
                &format!("0.0.0.0:{port}"),
                "--master-key",
                &master,
                "--db-path",
            ])
            .arg(&data_path)
            .args(["--no-analytics"])
            // Run with a writable working directory. A child inherits
            // searchbox's cwd, which under a Program Files (MSI) install is
            // read-only — Meilisearch then fails at startup creating its
            // relative dump/snapshot dirs with "Access is denied (os error 5)"
            // and exits immediately. Point cwd at the (writable) data dir.
            .current_dir(&data_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("spawn meilisearch")?;
        *guard = Some(child);
        tracing::info!(port = %port, "started meilisearch");
        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
            tracing::info!("stopped meilisearch");
        }
        Ok(())
    }
}

/// Look for a `meilisearch` (or `meilisearch.exe`) binary next to the running
/// `searchbox` executable. Lets the Windows MSI bundle Meilisearch into the
/// same install directory and have it picked up on first launch without the
/// user filling out a setting.
fn detect_sibling_meilisearch() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let candidate = if cfg!(windows) {
        dir.join("meilisearch.exe")
    } else {
        dir.join("meilisearch")
    };
    if candidate.is_file() {
        candidate.to_str().map(|s| s.to_string())
    } else {
        None
    }
}
