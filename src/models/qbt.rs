use std::collections::HashSet;

use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct QbTorrent {
    pub id: i64,
    pub torrent_hash: String,
    pub torrent_name: String,
    pub save_path: String,
    pub files_indexed: i64,
    pub indexed_at: String,
}

impl QbTorrent {
    pub async fn all(pool: &SqlitePool) -> Result<Vec<Self>> {
        let rows = sqlx::query_as::<_, Self>("SELECT * FROM qb_torrents ORDER BY indexed_at DESC")
            .fetch_all(pool)
            .await?;
        Ok(rows)
    }

    pub async fn indexed_hashes(pool: &SqlitePool) -> Result<HashSet<String>> {
        let rows: Vec<(String,)> = sqlx::query_as("SELECT torrent_hash FROM qb_torrents")
            .fetch_all(pool)
            .await?;
        Ok(rows.into_iter().map(|(h,)| h).collect())
    }

    pub async fn add(
        pool: &SqlitePool,
        torrent_hash: &str,
        torrent_name: &str,
        save_path: &str,
        files_indexed: i64,
    ) -> Result<Self> {
        let row: Self = sqlx::query_as(
            "INSERT INTO qb_torrents (torrent_hash, torrent_name, save_path, files_indexed) \
             VALUES (?, ?, ?, ?) \
             ON CONFLICT(torrent_hash) DO UPDATE SET \
               torrent_name = excluded.torrent_name, \
               save_path = excluded.save_path, \
               files_indexed = excluded.files_indexed, \
               indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             RETURNING *",
        )
        .bind(torrent_hash)
        .bind(torrent_name)
        .bind(save_path)
        .bind(files_indexed)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn remove(pool: &SqlitePool, torrent_hash: &str) -> Result<()> {
        sqlx::query("DELETE FROM qb_torrents WHERE torrent_hash = ?")
            .bind(torrent_hash)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get(pool: &SqlitePool, torrent_hash: &str) -> Result<Option<Self>> {
        let row = sqlx::query_as::<_, Self>("SELECT * FROM qb_torrents WHERE torrent_hash = ?")
            .bind(torrent_hash)
            .fetch_optional(pool)
            .await?;
        Ok(row)
    }
}
