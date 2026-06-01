//! This crate provides a pure-rust library for reading ZIM files.
//!
//! ZIM files are a format used primarily to store wikis (such as Wikipedia and others based on
//! MediaWiki).
//!
//! For more into, see the [OpenZIM website](http://www.openzim.org/wiki/OpenZIM)
//!

// Vendored, lightly-patched third-party crate (see Cargo.toml). Silence its
// lints: path-dependency lints aren't capped the way registry-dependency lints
// are, so without this the crate's pre-existing warnings would trip our
// `-D warnings` CI gate.
#![allow(warnings, clippy::all)]

mod cluster;
mod directory_entry;
mod directory_iterator;
mod errors;
mod mime_type;
mod namespace;
mod target;
mod uuid;
mod zim;

pub use crate::cluster::Cluster;
pub use crate::directory_entry::DirectoryEntry;
pub use crate::errors::{Error, Result};
pub use crate::mime_type::MimeType;
pub use crate::namespace::Namespace;
pub use crate::target::Target;
pub use crate::uuid::Uuid;
pub use crate::zim::Zim;
