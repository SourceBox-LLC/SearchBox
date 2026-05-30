use std::sync::Arc;

use anyhow::{Context, Result};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use minijinja::{Environment, Value};

use crate::assets::TemplatesDir;

/// Thin wrapper around a MiniJinja `Environment` that registers the
/// `url_for` function and `tojson` filter the HTML templates use. The
/// `csrf_token` value is passed per-request via the template context (see
/// `routes::pages`), not registered here.
#[derive(Clone)]
pub struct Templates {
    env: Arc<Environment<'static>>,
}

impl Templates {
    pub fn new() -> Result<Self> {
        let mut env = Environment::new();
        // Load templates from the embedded archive. In debug builds
        // rust-embed reads from disk on every call so edits are live.
        env.set_loader(|name| match TemplatesDir::get(name) {
            Some(file) => match std::str::from_utf8(file.data.as_ref()) {
                Ok(s) => Ok(Some(s.to_string())),
                Err(e) => Err(minijinja::Error::new(
                    minijinja::ErrorKind::InvalidOperation,
                    format!("template {name} is not utf-8: {e}"),
                )),
            },
            None => Ok(None),
        });

        // Templates reference these helpers; we supply them.
        // `url_for('static', filename='x')` → `/static/x`; other endpoints
        // fall back to `/<name>`.
        env.add_function("url_for", url_for);
        // `tojson` filter — not in MiniJinja by default.
        env.add_filter("tojson", tojson_filter);

        Ok(Self { env: Arc::new(env) })
    }

    pub fn render(&self, name: &str, ctx: Value) -> Result<String> {
        let tmpl = self
            .env
            .get_template(name)
            .with_context(|| format!("load template '{name}'"))?;
        tmpl.render(ctx)
            .with_context(|| format!("render template '{name}'"))
    }

    /// Render to an `axum::response::Response` with `Content-Type: text/html`.
    pub fn render_response(&self, name: &str, ctx: Value) -> Response {
        match self.render(name, ctx) {
            Ok(body) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                body,
            )
                .into_response(),
            Err(e) => {
                tracing::error!(error = format!("{e:#}"), "template render");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
                    format!("template error: {e}"),
                )
                    .into_response()
            }
        }
    }
}

fn url_for(endpoint: &str, kwargs: minijinja::value::Kwargs) -> String {
    if endpoint == "static" {
        let filename: Option<String> = kwargs.get("filename").ok();
        if let Some(f) = filename {
            return format!("/static/{f}");
        }
    }
    format!("/{endpoint}")
}

fn tojson_filter(value: minijinja::Value) -> Result<minijinja::Value, minijinja::Error> {
    let s = serde_json::to_string(&value).map_err(|e| {
        minijinja::Error::new(
            minijinja::ErrorKind::InvalidOperation,
            format!("tojson: {e}"),
        )
    })?;
    Ok(minijinja::Value::from_safe_string(s))
}
