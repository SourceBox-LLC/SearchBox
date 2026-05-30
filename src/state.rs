use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::Config;
use crate::jobs::JobRegistry;
use crate::services::meili_process::MeiliSupervisor;
use crate::templates::Templates;

/// Application state threaded into every handler.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: SqlitePool,
    pub templates: Templates,
    pub jobs: Arc<JobRegistry>,
    pub meili_proc: Arc<MeiliSupervisor>,
}
