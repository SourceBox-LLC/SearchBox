use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Settings {
    pub id: i64,
    pub key: String,
    pub value: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Settings {
    pub async fn get(pool: &SqlitePool, key: &str) -> Result<Option<String>> {
        let row: Option<(Option<String>,)> =
            sqlx::query_as("SELECT value FROM settings WHERE key = ?")
                .bind(key)
                .fetch_optional(pool)
                .await?;
        Ok(row.and_then(|(v,)| v))
    }

    pub async fn get_or(pool: &SqlitePool, key: &str, default: &str) -> Result<String> {
        Ok(Self::get(pool, key)
            .await?
            .unwrap_or_else(|| default.to_string()))
    }

    pub async fn set(pool: &SqlitePool, key: &str, value: Option<&str>) -> Result<()> {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?, ?) \
             ON CONFLICT(key) DO UPDATE SET \
             value = excluded.value, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        )
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn get_json<T: serde::de::DeserializeOwned>(
        pool: &SqlitePool,
        key: &str,
    ) -> Result<Option<T>> {
        match Self::get(pool, key).await? {
            Some(raw) => Ok(serde_json::from_str(&raw).ok()),
            None => Ok(None),
        }
    }

    pub async fn set_json<T: serde::Serialize>(
        pool: &SqlitePool,
        key: &str,
        value: &T,
    ) -> Result<()> {
        let s = serde_json::to_string(value)?;
        Self::set(pool, key, Some(&s)).await
    }
}
