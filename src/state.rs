use std::sync::Arc;

use sqlx::SqlitePool;

use crate::auth::throttle::LoginThrottle;
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
    /// In-memory login throttle — slows online password guessing.
    pub login_throttle: Arc<LoginThrottle>,
    /// Process-ephemeral key that seals vault KEKs before they're written into
    /// the (on-disk) session store. Regenerated each start, so a copied data
    /// directory never yields a usable KEK and the vault re-locks on restart.
    pub vault_seal_key: Arc<[u8; 32]>,
}
