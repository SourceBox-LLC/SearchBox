//! Background job tracker for folder indexing.
//! Jobs are persisted to the `jobs` SQLite table so they survive restarts.

use dashmap::DashMap;
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize)]
pub struct JobStatus {
    pub job_id: String,
    pub status: String, // "running" | "completed" | "failed" | "timeout"
    pub total: u64,
    pub processed: u64,
    pub indexed: u64,
    pub failed: u64,
    pub errors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

impl JobStatus {
    pub fn new(job_id: String) -> Self {
        Self {
            job_id,
            status: "running".into(),
            total: 0,
            processed: 0,
            indexed: 0,
            failed: 0,
            errors: Vec::new(),
            folder: None,
            started_at: chrono::Utc::now(),
        }
    }
}

#[derive(Default)]
pub struct JobRegistry {
    inner: DashMap<String, JobStatus>,
}

impl JobRegistry {
    pub fn insert(&self, job: JobStatus) {
        self.inner.insert(job.job_id.clone(), job);
    }

    pub fn get(&self, id: &str) -> Option<JobStatus> {
        self.inner.get(id).map(|j| j.clone())
    }

    pub fn update<F: FnOnce(&mut JobStatus)>(&self, id: &str, f: F) {
        if let Some(mut entry) = self.inner.get_mut(id) {
            f(&mut entry);
        }
    }

    pub fn new_id() -> String {
        uuid::Uuid::new_v4().to_string()[..8].to_string()
    }

    /// Check for and mark timed-out jobs (default timeout: 30 minutes)
    pub fn check_timeouts(&self, timeout_secs: u64) {
        let now = chrono::Utc::now();
        for mut entry in self.inner.iter_mut() {
            let elapsed = (now - entry.started_at).num_seconds() as u64;
            if entry.status == "running" && elapsed > timeout_secs {
                entry.status = "timeout".into();
                entry
                    .errors
                    .push(format!("job timed out after {} seconds", elapsed));
            }
        }
    }

    /// Persist all in-memory jobs to the database
    pub async fn persist(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        // Clear existing rows and rewrite from memory
        sqlx::query("DELETE FROM jobs").execute(pool).await?;
        for entry in self.inner.iter() {
            let errors_json = serde_json::to_string(&entry.errors)?;
            sqlx::query(
                "INSERT INTO jobs (id, status, total, processed, indexed, failed, errors, folder, started_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&entry.job_id)
            .bind(&entry.status)
            .bind(entry.total as i64)
            .bind(entry.processed as i64)
            .bind(entry.indexed as i64)
            .bind(entry.failed as i64)
            .bind(&errors_json)
            .bind(&entry.folder)
            .bind(entry.started_at.to_rfc3339())
            .execute(pool)
            .await?;
        }
        Ok(())
    }

    /// Load persisted jobs from the database into memory
    #[allow(clippy::type_complexity)]
    pub async fn load_from_db(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        let rows: Vec<(String, String, i64, i64, i64, i64, String, Option<String>, String)> =
            sqlx::query_as(
                "SELECT id, status, total, processed, indexed, failed, errors, folder, started_at FROM jobs",
            )
            .fetch_all(pool)
            .await?;

        for (id, status, total, processed, indexed, failed, errors_json, folder, started_at) in rows
        {
            let errors: Vec<String> = serde_json::from_str(&errors_json).unwrap_or_default();
            let started_at = chrono::DateTime::parse_from_rfc3339(&started_at)
                .unwrap_or_else(|_| chrono::Utc::now().into())
                .to_utc();
            self.inner.insert(
                id.clone(),
                JobStatus {
                    job_id: id,
                    status,
                    total: total as u64,
                    processed: processed as u64,
                    indexed: indexed as u64,
                    failed: failed as u64,
                    errors,
                    folder,
                    started_at,
                },
            );
        }
        Ok(())
    }

    /// Clean up completed/failed jobs older than the given duration
    pub fn cleanup_old_jobs(&self, max_age_secs: u64) {
        let now = chrono::Utc::now();
        let keys_to_remove: Vec<String> = self
            .inner
            .iter()
            .filter(|entry| {
                if entry.status == "running" {
                    return false;
                }
                let elapsed = (now - entry.started_at).num_seconds() as u64;
                elapsed > max_age_secs
            })
            .map(|entry| entry.job_id.clone())
            .collect();

        for key in keys_to_remove {
            self.inner.remove(&key);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_get() {
        let reg = JobRegistry::default();
        let job = JobStatus::new("abc".into());
        reg.insert(job);
        let found = reg.get("abc").unwrap();
        assert_eq!(found.job_id, "abc");
        assert_eq!(found.status, "running");
    }

    #[test]
    fn get_missing_returns_none() {
        let reg = JobRegistry::default();
        assert!(reg.get("nope").is_none());
    }

    #[test]
    fn update_status() {
        let reg = JobRegistry::default();
        let mut job = JobStatus::new("xyz".into());
        job.total = 10;
        reg.insert(job);
        reg.update("xyz", |j| {
            j.status = "completed".into();
            j.processed = 10;
        });
        let found = reg.get("xyz").unwrap();
        assert_eq!(found.status, "completed");
        assert_eq!(found.processed, 10);
    }

    #[test]
    fn new_id_unique() {
        let ids: Vec<String> = (0..100).map(|_| JobRegistry::new_id()).collect();
        let unique: std::collections::HashSet<String> = ids.into_iter().collect();
        assert_eq!(unique.len(), 100);
    }

    #[test]
    fn cleanup_removes_old_finished() {
        let reg = JobRegistry::default();
        let mut job = JobStatus::new("old".into());
        job.status = "completed".into();
        job.started_at = chrono::Utc::now() - chrono::Duration::seconds(7200);
        reg.insert(job);
        let mut job2 = JobStatus::new("fresh".into());
        job2.status = "completed".into();
        reg.insert(job2);
        reg.cleanup_old_jobs(3600);
        assert!(reg.get("old").is_none());
        assert!(reg.get("fresh").is_some());
    }
}
