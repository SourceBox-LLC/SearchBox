use anyhow::Result;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow)]
pub struct RecoveryKey {
    #[allow(dead_code)]
    pub id: i64,
    pub wrapped_recovery_dek: Vec<u8>,
    #[allow(dead_code)]
    pub created_at: String,
    #[allow(dead_code)]
    pub updated_at: String,
}

impl RecoveryKey {
    pub async fn get(pool: &SqlitePool) -> Result<Option<Self>> {
        let row = sqlx::query_as::<_, Self>("SELECT * FROM recovery_key LIMIT 1")
            .fetch_optional(pool)
            .await?;
        Ok(row)
    }

    pub async fn create(pool: &SqlitePool, wrapped_recovery_dek: &[u8]) -> Result<Self> {
        let row: Self = sqlx::query_as(
            "INSERT INTO recovery_key (wrapped_recovery_dek) VALUES (?) RETURNING *",
        )
        .bind(wrapped_recovery_dek)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn update(pool: &SqlitePool, wrapped_recovery_dek: &[u8]) -> Result<Self> {
        let row: Self = sqlx::query_as(
            "UPDATE recovery_key SET wrapped_recovery_dek = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT id FROM recovery_key LIMIT 1) RETURNING *",
        )
        .bind(wrapped_recovery_dek)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn upsert(pool: &SqlitePool, wrapped_recovery_dek: &[u8]) -> Result<Self> {
        if Self::get(pool).await?.is_some() {
            Self::update(pool, wrapped_recovery_dek).await
        } else {
            Self::create(pool, wrapped_recovery_dek).await
        }
    }

    #[allow(dead_code)]
    pub async fn delete(pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM recovery_key")
            .execute(pool)
            .await?;
        Ok(())
    }
}
