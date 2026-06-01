pub mod archives;
pub mod auth;
pub mod documents;
pub mod folders;
pub mod health;
pub mod meili;
pub mod ollama;
pub mod pages;
pub mod picker;
pub mod qbittorrent;
pub mod settings;
pub mod update;
pub mod vault;

use axum::Router;

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .merge(archives::routes())
        .merge(auth::routes())
        .merge(health::routes())
        .merge(pages::routes())
        .merge(settings::routes())
        .merge(meili::routes())
        .merge(folders::routes())
        .merge(documents::routes())
        .merge(vault::routes())
        .merge(ollama::routes())
        .merge(qbittorrent::routes())
        .merge(picker::routes())
        .merge(update::routes())
        .with_state(state)
}
