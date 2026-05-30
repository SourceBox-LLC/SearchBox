use axum::extract::{Path, State};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use minijinja::context;
use tower_sessions::Session;

use crate::auth::{get_or_create_csrf_token, SessionUser, SESSION_USER_KEY};
use crate::error::AppResult;
use crate::models::User;
use crate::services::meili::client_config;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(index))
        .route("/login", get(login))
        .route("/setup", get(setup))
        .route("/settings", get(settings))
        .route("/explore", get(explore))
        .route("/images", get(images))
        .route("/view/{doc_id}", get(view_document))
}

async fn session_user(session: &Session) -> Option<SessionUser> {
    session.get(SESSION_USER_KEY).await.ok().flatten()
}

async fn index(State(state): State<AppState>, session: Session) -> AppResult<Response> {
    if User::count(&state.db).await? == 0 {
        return Ok(Redirect::to("/setup").into_response());
    }
    let Some(user) = session_user(&session).await else {
        return Ok(Redirect::to("/login").into_response());
    };
    let meili = client_config(&state.db).await?;
    let csrf_token = get_or_create_csrf_token(&session).await;
    Ok(state.templates.render_response(
        "index.html",
        context!(user => user, meili => meili, csrf_token => csrf_token),
    ))
}

async fn login(State(state): State<AppState>, session: Session) -> Response {
    if session_user(&session).await.is_some() {
        return Redirect::to("/").into_response();
    }
    let csrf_token = get_or_create_csrf_token(&session).await;
    state
        .templates
        .render_response("login.html", context!(csrf_token => csrf_token))
}

async fn setup(State(state): State<AppState>, session: Session) -> AppResult<Response> {
    if User::count(&state.db).await? > 0 {
        return Ok(Redirect::to(if session_user(&session).await.is_some() {
            "/"
        } else {
            "/login"
        })
        .into_response());
    }
    let csrf_token = get_or_create_csrf_token(&session).await;
    Ok(state
        .templates
        .render_response("setup.html", context!(csrf_token => csrf_token)))
}

async fn settings(State(state): State<AppState>, session: Session) -> AppResult<Response> {
    let Some(user) = session_user(&session).await else {
        return Ok(Redirect::to("/login").into_response());
    };
    let csrf_token = get_or_create_csrf_token(&session).await;
    Ok(state.templates.render_response(
        "settings.html",
        context!(user => user, csrf_token => csrf_token),
    ))
}

async fn explore(State(state): State<AppState>, session: Session) -> AppResult<Response> {
    let Some(user) = session_user(&session).await else {
        return Ok(Redirect::to("/login").into_response());
    };
    let meili = client_config(&state.db).await?;
    let csrf_token = get_or_create_csrf_token(&session).await;
    Ok(state.templates.render_response(
        "explore.html",
        context!(user => user, meili => meili, csrf_token => csrf_token),
    ))
}

async fn images(State(state): State<AppState>, session: Session) -> AppResult<Response> {
    let Some(user) = session_user(&session).await else {
        return Ok(Redirect::to("/login").into_response());
    };
    let meili = client_config(&state.db).await?;
    let csrf_token = get_or_create_csrf_token(&session).await;
    Ok(state.templates.render_response(
        "images.html",
        context!(user => user, meili => meili, csrf_token => csrf_token),
    ))
}

async fn view_document(
    State(state): State<AppState>,
    session: Session,
    Path(doc_id): Path<String>,
) -> AppResult<Response> {
    let Some(user) = session_user(&session).await else {
        return Ok(Redirect::to("/login").into_response());
    };
    let csrf_token = get_or_create_csrf_token(&session).await;
    Ok(state.templates.render_response(
        "view.html",
        context!(user => user, doc_id => doc_id, csrf_token => csrf_token),
    ))
}
