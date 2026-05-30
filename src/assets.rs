//! Compile-time asset embedding.
//!
//! Release builds bake `templates/` and `static/` into the binary — one
//! file ships, no sibling dirs required. Debug builds skip the embed and
//! read from disk so template/JS/CSS edits are live without `cargo build`.
//!
//! `thumbnails/` is runtime-generated (see `services::thumbnail`), so we
//! exclude it from the embed — nothing is gained by snapshotting the dir
//! at build time, and serving them goes through the authenticated
//! `/api/thumbnail/{id}` handler anyway.

use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/templates"]
pub struct TemplatesDir;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/static"]
#[exclude = "thumbnails/*"]
pub struct StaticDir;
