use std::path::Path;

use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct IndexedFolder {
    pub id: i64,
    pub folder_path: String,
    pub folder_name: String,
    pub created_at: String,
    pub last_synced: Option<String>,
    pub is_active: i64,
}

impl IndexedFolder {
    pub async fn paths(pool: &SqlitePool) -> Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT folder_path FROM indexed_folders WHERE is_active = 1 ORDER BY id",
        )
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|(p,)| p).collect())
    }

    pub async fn add(pool: &SqlitePool, folder_path: &str) -> Result<Self> {
        let folder_name = Path::new(folder_path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(folder_path)
            .to_string();

        let row: Self = sqlx::query_as(
            "INSERT INTO indexed_folders (folder_path, folder_name) VALUES (?, ?) \
             ON CONFLICT(folder_path) DO UPDATE SET is_active = 1 \
             RETURNING *",
        )
        .bind(folder_path)
        .bind(&folder_name)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn remove(pool: &SqlitePool, folder_path: &str) -> Result<()> {
        sqlx::query("UPDATE indexed_folders SET is_active = 0 WHERE folder_path = ?")
            .bind(folder_path)
            .execute(pool)
            .await?;
        Ok(())
    }
}
