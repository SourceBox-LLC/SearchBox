use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Bookmark {
    pub id: i64,
    pub slot: i64,
    pub doc_id: String,
    pub title: String,
    pub file_type: String,
    pub file_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Bookmark {
    #[allow(dead_code)]
    pub async fn get_by_slot(pool: &SqlitePool, slot: i64) -> Result<Option<Self>> {
        let row = sqlx::query_as::<_, Self>("SELECT * FROM bookmarks WHERE slot = ?")
            .bind(slot)
            .fetch_optional(pool)
            .await?;
        Ok(row)
    }

    pub async fn all(pool: &SqlitePool) -> Result<Vec<Self>> {
        let rows = sqlx::query_as::<_, Self>("SELECT * FROM bookmarks ORDER BY slot")
            .fetch_all(pool)
            .await?;
        Ok(rows)
    }

    pub async fn get_by_doc_id(pool: &SqlitePool, doc_id: &str) -> Result<Option<Self>> {
        let row = sqlx::query_as::<_, Self>("SELECT * FROM bookmarks WHERE doc_id = ?")
            .bind(doc_id)
            .fetch_optional(pool)
            .await?;
        Ok(row)
    }

    pub async fn upsert(
        pool: &SqlitePool,
        slot: i64,
        doc_id: &str,
        title: &str,
        file_type: &str,
        file_path: Option<&str>,
    ) -> Result<Self> {
        // `ON CONFLICT(slot)` handles slot reassignment; doc_id uniqueness is
        // validated separately by the caller (two different slots can't share
        // a doc_id, but upserting the same slot with a new doc is fine).
        let row: Self = sqlx::query_as(
            "INSERT INTO bookmarks (slot, doc_id, title, file_type, file_path) \
             VALUES (?, ?, ?, ?, ?) \
             ON CONFLICT(slot) DO UPDATE SET \
               doc_id = excluded.doc_id, \
               title = excluded.title, \
               file_type = excluded.file_type, \
               file_path = excluded.file_path, \
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             RETURNING *",
        )
        .bind(slot)
        .bind(doc_id)
        .bind(title)
        .bind(file_type)
        .bind(file_path)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn delete_by_slot(pool: &SqlitePool, slot: i64) -> Result<()> {
        sqlx::query("DELETE FROM bookmarks WHERE slot = ?")
            .bind(slot)
            .execute(pool)
            .await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn delete_by_doc_id(pool: &SqlitePool, doc_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM bookmarks WHERE doc_id = ?")
            .bind(doc_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
