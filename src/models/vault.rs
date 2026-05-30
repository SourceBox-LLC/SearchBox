use anyhow::Result;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow)]
#[allow(dead_code)]
pub struct VaultConfig {
    pub id: i64,
    pub salt: Vec<u8>,
    pub created_at: String,
    pub updated_at: String,
}

impl VaultConfig {
    pub async fn get(pool: &SqlitePool) -> Result<Option<Self>> {
        let row = sqlx::query_as::<_, Self>("SELECT * FROM vault_config LIMIT 1")
            .fetch_optional(pool)
            .await?;
        Ok(row)
    }

    pub async fn clear(pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM vault_config")
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Insert the single per-install salt row if `vault_config` is empty.
    /// Returns the row (newly created or pre-existing). The salt is stable
    /// for the life of the install — changing it invalidates every wrapped
    /// DEK in `encrypted_files`.
    pub async fn ensure(pool: &SqlitePool, salt: &[u8]) -> Result<Self> {
        if let Some(cfg) = Self::get(pool).await? {
            return Ok(cfg);
        }
        let row: Self = sqlx::query_as("INSERT INTO vault_config (salt) VALUES (?) RETURNING *")
            .bind(salt)
            .fetch_one(pool)
            .await?;
        Ok(row)
    }
}

#[derive(Debug, Clone, FromRow)]
#[allow(dead_code)]
pub struct EncryptedFile {
    pub id: i64,
    pub doc_id: String,
    pub wrapped_dek: Vec<u8>,
    pub encrypted_filename: String,
    pub original_filename: String,
    pub created_at: String,
}

impl EncryptedFile {
    pub async fn get(pool: &SqlitePool, doc_id: &str) -> Result<Option<Self>> {
        let row = sqlx::query_as::<_, Self>("SELECT * FROM encrypted_files WHERE doc_id = ?")
            .bind(doc_id)
            .fetch_optional(pool)
            .await?;
        Ok(row)
    }

    pub async fn create(
        pool: &SqlitePool,
        doc_id: &str,
        wrapped_dek: &[u8],
        encrypted_filename: &str,
        original_filename: &str,
    ) -> Result<Self> {
        let row: Self = sqlx::query_as(
            "INSERT INTO encrypted_files \
               (doc_id, wrapped_dek, encrypted_filename, original_filename) \
             VALUES (?, ?, ?, ?) RETURNING *",
        )
        .bind(doc_id)
        .bind(wrapped_dek)
        .bind(encrypted_filename)
        .bind(original_filename)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn delete(pool: &SqlitePool, doc_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM encrypted_files WHERE doc_id = ?")
            .bind(doc_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn count(pool: &SqlitePool) -> Result<i64> {
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM encrypted_files")
            .fetch_one(pool)
            .await?;
        Ok(n)
    }

    pub async fn all(pool: &SqlitePool) -> Result<Vec<Self>> {
        let rows = sqlx::query_as::<_, Self>("SELECT * FROM encrypted_files")
            .fetch_all(pool)
            .await?;
        Ok(rows)
    }

    pub async fn clear_all(pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM encrypted_files")
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_wrapped_dek(
        pool: &SqlitePool,
        doc_id: &str,
        wrapped_dek: &[u8],
    ) -> Result<()> {
        sqlx::query("UPDATE encrypted_files SET wrapped_dek = ? WHERE doc_id = ?")
            .bind(wrapped_dek)
            .bind(doc_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
