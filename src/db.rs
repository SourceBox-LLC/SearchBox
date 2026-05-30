use std::path::Path;

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

const SCHEMA: &str = include_str!("../schema.sql");

pub async fn connect(db_path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).context("create db parent dir")?;
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await
        .context("open sqlite pool")?;

    Ok(pool)
}

/// Apply the schema. All `CREATE TABLE` statements are `IF NOT EXISTS`, so
/// this is idempotent on startup. No migrations — when the schema changes,
/// wipe `searchbox.db` and restart.
pub async fn init_schema(pool: &SqlitePool) -> Result<()> {
    // `execute` on a multi-statement string with sqlx-sqlite batches them.
    sqlx::raw_sql(SCHEMA)
        .execute(pool)
        .await
        .context("apply schema")?;
    Ok(())
}
