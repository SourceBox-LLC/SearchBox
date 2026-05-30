use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: i64,
    pub email: String,
    #[serde(skip)]
    pub password_hash: String,
    pub name: Option<String>,
    pub role: String,
    pub created_at: String,
    pub last_login: Option<String>,
    pub is_active: i64,
}

pub struct NewUser<'a> {
    pub email: &'a str,
    pub password_hash: &'a str,
    pub name: Option<&'a str>,
    pub role: &'a str,
}

impl User {
    pub async fn count(pool: &SqlitePool) -> Result<i64> {
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(pool)
            .await?;
        Ok(n)
    }

    pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Self>> {
        let user = sqlx::query_as::<_, Self>("SELECT * FROM users WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(user)
    }

    pub async fn get_by_email(pool: &SqlitePool, email: &str) -> Result<Option<Self>> {
        let user = sqlx::query_as::<_, Self>("SELECT * FROM users WHERE email = ?")
            .bind(email.to_ascii_lowercase())
            .fetch_optional(pool)
            .await?;
        Ok(user)
    }

    pub async fn create(pool: &SqlitePool, new: NewUser<'_>) -> Result<Self> {
        let email = new.email.to_ascii_lowercase();
        let row: Self = sqlx::query_as(
            "INSERT INTO users (email, password_hash, name, role) \
             VALUES (?, ?, ?, ?) RETURNING *",
        )
        .bind(&email)
        .bind(new.password_hash)
        .bind(new.name)
        .bind(new.role)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    pub async fn update_last_login(pool: &SqlitePool, id: i64) -> Result<()> {
        sqlx::query(
            "UPDATE users SET last_login = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_password_hash(pool: &SqlitePool, id: i64, hash: &str) -> Result<()> {
        sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
            .bind(hash)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
