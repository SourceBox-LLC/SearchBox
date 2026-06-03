//! Integration tests for the data layer and the vault crypto stack, wired
//! together against a real (in-memory) SQLite database with the production
//! schema applied.
//!
//! These complement the per-module unit tests: where `vault::crypto` and
//! `auth::password` unit-test pure functions in isolation, these exercise the
//! model CRUD methods against the actual `schema.sql` and prove the full vault
//! path — derive KEK → encrypt → wrap DEK → store → retrieve → unwrap →
//! decrypt — end to end. Run with `cargo test`.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use time::Duration;
use tokio::net::TcpListener;
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::SqliteStore;

use crate::config::Config;
use crate::models::{
    Bookmark, EncryptedFile, IndexedFolder, NewUser, QbTorrent, RecoveryKey, Settings, User,
    VaultConfig,
};
use crate::services::meili_process::MeiliSupervisor;
use crate::state::AppState;
use crate::templates::Templates;
use crate::vault::crypto;

/// A fresh, isolated in-memory database with the schema applied.
///
/// `max_connections(1)` keeps the single `sqlite::memory:` connection alive for
/// the pool's lifetime — each `:memory:` connection is otherwise its own
/// private database, so a multi-connection pool would see an empty schema on
/// the second checkout.
async fn mem_pool() -> SqlitePool {
    use std::str::FromStr;
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .expect("parse sqlite::memory: url")
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .expect("open in-memory sqlite");
    crate::db::init_schema(&pool).await.expect("apply schema");
    pool
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

#[tokio::test]
async fn users_create_lookup_and_update() {
    let pool = mem_pool().await;
    assert_eq!(User::count(&pool).await.unwrap(), 0);

    let created = User::create(
        &pool,
        NewUser {
            email: "Owner@Example.COM",
            password_hash: "hash-1",
            name: Some("Owner"),
            role: "owner",
        },
    )
    .await
    .unwrap();
    assert_eq!(
        created.email, "owner@example.com",
        "email is lowercased on insert"
    );
    assert_eq!(created.role, "owner");
    assert_eq!(created.is_active, 1, "is_active defaults to 1");
    assert!(created.last_login.is_none());
    assert_eq!(User::count(&pool).await.unwrap(), 1);

    // Lookups by id and by (case-insensitive) email find the same row.
    let by_id = User::get_by_id(&pool, created.id).await.unwrap().unwrap();
    assert_eq!(by_id.email, created.email);
    let by_email = User::get_by_email(&pool, "OWNER@example.com")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(by_email.id, created.id);

    // Missing rows are `None`, not errors.
    assert!(User::get_by_id(&pool, 9999).await.unwrap().is_none());
    assert!(User::get_by_email(&pool, "nobody@example.com")
        .await
        .unwrap()
        .is_none());

    // update_last_login stamps a timestamp; update_password_hash swaps the hash.
    User::update_last_login(&pool, created.id).await.unwrap();
    assert!(User::get_by_id(&pool, created.id)
        .await
        .unwrap()
        .unwrap()
        .last_login
        .is_some());
    User::update_password_hash(&pool, created.id, "hash-2")
        .await
        .unwrap();
    assert_eq!(
        User::get_by_id(&pool, created.id)
            .await
            .unwrap()
            .unwrap()
            .password_hash,
        "hash-2"
    );
}

#[tokio::test]
async fn users_duplicate_email_rejected() {
    let pool = mem_pool().await;
    User::create(
        &pool,
        NewUser {
            email: "dup@example.com",
            password_hash: "h",
            name: None,
            role: "owner",
        },
    )
    .await
    .unwrap();
    let second = User::create(
        &pool,
        NewUser {
            email: "dup@example.com",
            password_hash: "h2",
            name: None,
            role: "owner",
        },
    )
    .await;
    assert!(second.is_err(), "UNIQUE(email) blocks a second row");
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

#[tokio::test]
async fn settings_get_set_overwrite_and_json() {
    let pool = mem_pool().await;
    assert!(Settings::get(&pool, "missing").await.unwrap().is_none());
    assert_eq!(
        Settings::get_or(&pool, "missing", "fallback")
            .await
            .unwrap(),
        "fallback"
    );

    Settings::set(&pool, "meili_port", Some("7700"))
        .await
        .unwrap();
    assert_eq!(
        Settings::get(&pool, "meili_port").await.unwrap().as_deref(),
        Some("7700")
    );

    // A second set on the same key upserts (does not insert a duplicate).
    Settings::set(&pool, "meili_port", Some("7701"))
        .await
        .unwrap();
    assert_eq!(
        Settings::get(&pool, "meili_port").await.unwrap().as_deref(),
        Some("7701")
    );

    // An explicit NULL value reads back as None.
    Settings::set(&pool, "meili_port", None).await.unwrap();
    assert!(Settings::get(&pool, "meili_port").await.unwrap().is_none());

    // JSON helpers round-trip structured values.
    let list = vec!["a".to_string(), "b".to_string()];
    Settings::set_json(&pool, "exts", &list).await.unwrap();
    let back: Vec<String> = Settings::get_json(&pool, "exts").await.unwrap().unwrap();
    assert_eq!(back, list);
}

// ---------------------------------------------------------------------------
// indexed_folders
// ---------------------------------------------------------------------------

#[tokio::test]
async fn indexed_folders_add_remove_reactivate() {
    let pool = mem_pool().await;
    assert!(IndexedFolder::paths(&pool).await.unwrap().is_empty());

    let added = IndexedFolder::add(&pool, "/data/Documents").await.unwrap();
    assert_eq!(
        added.folder_name, "Documents",
        "name is derived from the path tail"
    );
    assert_eq!(added.is_active, 1);
    assert_eq!(
        IndexedFolder::paths(&pool).await.unwrap(),
        vec!["/data/Documents".to_string()]
    );

    // remove is a soft delete (is_active = 0) → excluded from paths().
    IndexedFolder::remove(&pool, "/data/Documents")
        .await
        .unwrap();
    assert!(IndexedFolder::paths(&pool).await.unwrap().is_empty());

    // Re-adding reactivates the same row rather than duplicating it.
    let re = IndexedFolder::add(&pool, "/data/Documents").await.unwrap();
    assert_eq!(re.id, added.id, "same row reactivated, not duplicated");
    assert_eq!(IndexedFolder::paths(&pool).await.unwrap().len(), 1);
}

// ---------------------------------------------------------------------------
// bookmarks
// ---------------------------------------------------------------------------

#[tokio::test]
async fn bookmarks_upsert_lookup_delete() {
    let pool = mem_pool().await;
    assert!(Bookmark::all(&pool).await.unwrap().is_empty());

    let b = Bookmark::upsert(
        &pool,
        1,
        "doc-1",
        "Title One",
        "pdf",
        Some("/files/one.pdf"),
    )
    .await
    .unwrap();
    assert_eq!(b.slot, 1);
    assert_eq!(b.doc_id, "doc-1");
    assert_eq!(Bookmark::all(&pool).await.unwrap().len(), 1);
    assert_eq!(
        Bookmark::get_by_slot(&pool, 1)
            .await
            .unwrap()
            .unwrap()
            .doc_id,
        "doc-1"
    );
    assert_eq!(
        Bookmark::get_by_doc_id(&pool, "doc-1")
            .await
            .unwrap()
            .unwrap()
            .slot,
        1
    );

    // Upserting the same slot with a new doc replaces what's in that slot.
    let replaced = Bookmark::upsert(&pool, 1, "doc-2", "Title Two", "txt", None)
        .await
        .unwrap();
    assert_eq!(replaced.doc_id, "doc-2");
    assert_eq!(
        Bookmark::all(&pool).await.unwrap().len(),
        1,
        "still a single row in slot 1"
    );
    assert!(Bookmark::get_by_doc_id(&pool, "doc-1")
        .await
        .unwrap()
        .is_none());

    Bookmark::delete_by_slot(&pool, 1).await.unwrap();
    assert!(Bookmark::all(&pool).await.unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// qb_torrents
// ---------------------------------------------------------------------------

#[tokio::test]
async fn qb_torrents_add_dedupe_remove() {
    let pool = mem_pool().await;
    QbTorrent::add(&pool, "hashA", "Ubuntu ISO", "/dl/ubuntu", 3)
        .await
        .unwrap();
    assert!(QbTorrent::indexed_hashes(&pool)
        .await
        .unwrap()
        .contains("hashA"));
    assert_eq!(
        QbTorrent::get(&pool, "hashA")
            .await
            .unwrap()
            .unwrap()
            .files_indexed,
        3
    );

    // The same hash upserts: no duplicate row, fields refreshed.
    QbTorrent::add(&pool, "hashA", "Ubuntu ISO v2", "/dl/ubuntu2", 5)
        .await
        .unwrap();
    assert_eq!(
        QbTorrent::all(&pool).await.unwrap().len(),
        1,
        "ON CONFLICT(torrent_hash) dedupes"
    );
    let updated = QbTorrent::get(&pool, "hashA").await.unwrap().unwrap();
    assert_eq!(updated.files_indexed, 5);
    assert_eq!(updated.torrent_name, "Ubuntu ISO v2");

    QbTorrent::remove(&pool, "hashA").await.unwrap();
    assert!(QbTorrent::all(&pool).await.unwrap().is_empty());
    assert!(QbTorrent::indexed_hashes(&pool).await.unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// vault_config + encrypted_files (model layer)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn vault_config_ensure_is_idempotent() {
    let pool = mem_pool().await;
    assert!(VaultConfig::get(&pool).await.unwrap().is_none());

    let salt = crypto::generate_salt();
    let first = VaultConfig::ensure(&pool, &salt).await.unwrap();
    assert_eq!(first.salt, salt.to_vec());

    // ensure() must never re-randomise the salt of an existing install —
    // doing so would invalidate every wrapped DEK.
    let second = VaultConfig::ensure(&pool, &crypto::generate_salt())
        .await
        .unwrap();
    assert_eq!(second.salt, first.salt, "stored salt is preserved");

    VaultConfig::clear(&pool).await.unwrap();
    assert!(VaultConfig::get(&pool).await.unwrap().is_none());
}

#[tokio::test]
async fn encrypted_files_crud() {
    let pool = mem_pool().await;
    assert_eq!(EncryptedFile::count(&pool).await.unwrap(), 0);

    EncryptedFile::create(&pool, "doc-1", &[1, 2, 3], "enc-1.bin", "report.pdf")
        .await
        .unwrap();
    assert_eq!(EncryptedFile::count(&pool).await.unwrap(), 1);
    let got = EncryptedFile::get(&pool, "doc-1").await.unwrap().unwrap();
    assert_eq!(got.original_filename, "report.pdf");
    assert_eq!(got.wrapped_dek, vec![1, 2, 3]);
    assert_eq!(EncryptedFile::all(&pool).await.unwrap().len(), 1);

    EncryptedFile::delete(&pool, "doc-1").await.unwrap();
    assert!(EncryptedFile::get(&pool, "doc-1").await.unwrap().is_none());

    // clear_all wipes the table.
    EncryptedFile::create(&pool, "d2", &[9], "e2", "f2")
        .await
        .unwrap();
    EncryptedFile::create(&pool, "d3", &[9], "e3", "f3")
        .await
        .unwrap();
    EncryptedFile::clear_all(&pool).await.unwrap();
    assert_eq!(EncryptedFile::count(&pool).await.unwrap(), 0);
}

#[tokio::test]
async fn recovery_key_upsert_keeps_single_row() {
    let pool = mem_pool().await;
    assert!(RecoveryKey::get(&pool).await.unwrap().is_none());

    RecoveryKey::upsert(&pool, &[1, 1, 1]).await.unwrap();
    assert_eq!(
        RecoveryKey::get(&pool)
            .await
            .unwrap()
            .unwrap()
            .wrapped_recovery_dek,
        vec![1, 1, 1]
    );

    // A second upsert updates the existing row in place.
    RecoveryKey::upsert(&pool, &[2, 2]).await.unwrap();
    assert_eq!(
        RecoveryKey::get(&pool)
            .await
            .unwrap()
            .unwrap()
            .wrapped_recovery_dek,
        vec![2, 2]
    );
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM recovery_key")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1, "recovery_key holds at most one row");
}

// ---------------------------------------------------------------------------
// vault end-to-end (crypto + models)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn vault_end_to_end_encrypt_store_retrieve_decrypt() {
    let pool = mem_pool().await;
    let password = "correct horse battery staple";
    let plaintext = b"The secret contents of a vaulted file.";

    // 1. Per-install salt, persisted once.
    let salt = crypto::generate_salt();
    VaultConfig::ensure(&pool, &salt).await.unwrap();

    // 2. Derive the KEK from password + stored salt; 3. per-file DEK encrypts
    //    the content; the DEK is wrapped under the KEK.
    let cfg = VaultConfig::get(&pool).await.unwrap().unwrap();
    let kek = crypto::derive_kek(password, &cfg.salt);
    let dek = crypto::generate_dek();
    let ciphertext = crypto::encrypt_bytes(&dek, plaintext).unwrap();
    assert_ne!(ciphertext, plaintext.to_vec(), "stored bytes are encrypted");
    let wrapped = crypto::wrap_dek(&kek, &dek).unwrap();

    // 4. Persist the wrapped DEK (the ciphertext itself would live under vault/).
    EncryptedFile::create(
        &pool,
        "doc-secret",
        &wrapped,
        "doc-secret.enc",
        "secret.txt",
    )
    .await
    .unwrap();

    // 5. Later: re-derive the KEK from the password, unwrap the DEK, decrypt.
    let row = EncryptedFile::get(&pool, "doc-secret")
        .await
        .unwrap()
        .unwrap();
    let kek2 = crypto::derive_kek(password, &cfg.salt);
    let dek2 = crypto::unwrap_dek(&kek2, &row.wrapped_dek).unwrap();
    let decrypted = crypto::decrypt_bytes(&dek2, &ciphertext).unwrap();
    assert_eq!(
        decrypted,
        plaintext.to_vec(),
        "round-trips back to the original plaintext"
    );
}

#[tokio::test]
async fn vault_wrong_password_cannot_unwrap_dek() {
    let pool = mem_pool().await;
    let salt = crypto::generate_salt();
    VaultConfig::ensure(&pool, &salt).await.unwrap();

    let kek = crypto::derive_kek("right-password", &salt);
    let dek = crypto::generate_dek();
    let wrapped = crypto::wrap_dek(&kek, &dek).unwrap();
    EncryptedFile::create(&pool, "doc", &wrapped, "doc.enc", "f.txt")
        .await
        .unwrap();

    // A wrong password derives a different KEK; AES-GCM authentication then
    // fails, so the DEK can't be unwrapped.
    let wrong_kek = crypto::derive_kek("wrong-password", &salt);
    let row = EncryptedFile::get(&pool, "doc").await.unwrap().unwrap();
    assert!(
        crypto::unwrap_dek(&wrong_kek, &row.wrapped_dek).is_err(),
        "wrong password must not unwrap the DEK"
    );
}

#[tokio::test]
async fn recovery_key_round_trip_unwraps_dek() {
    let pool = mem_pool().await;

    // The recovery key is a 32-byte secret the user saves out-of-band. It wraps
    // the DEK independently of the password, so a forgotten password still
    // leaves a path back to the data.
    let recovery = crypto::generate_recovery_key();
    let hex = crypto::recovery_key_to_hex(&recovery);
    assert_eq!(
        crypto::recovery_key_from_hex(&hex).unwrap(),
        recovery,
        "hex encoding round-trips"
    );

    let dek = crypto::generate_dek();
    let wrapped = crypto::wrap_dek(&recovery, &dek).unwrap();
    RecoveryKey::upsert(&pool, &wrapped).await.unwrap();

    // Recover: read the wrapped DEK back and unwrap it with the saved key.
    let stored = RecoveryKey::get(&pool).await.unwrap().unwrap();
    let recovered = crypto::unwrap_dek(&recovery, &stored.wrapped_recovery_dek).unwrap();
    assert_eq!(recovered, dek, "the saved recovery key unwraps the DEK");

    // A different recovery key must fail.
    let other = crypto::generate_recovery_key();
    assert!(crypto::unwrap_dek(&other, &stored.wrapped_recovery_dek).is_err());
}

// ---------------------------------------------------------------------------
// HTTP integration — boots the real Axum app (router + session layer) on an
// ephemeral localhost port and drives it with a cookie-aware reqwest client,
// so sessions and CSRF tokens carry across requests exactly as in a browser.
// ---------------------------------------------------------------------------

static DB_SEQ: AtomicU64 = AtomicU64::new(0);

/// A `Config` pointing at a unique temp dir. None of the exercised routes write
/// to these paths; the struct just satisfies `AppState`.
fn temp_config() -> Config {
    let n = DB_SEQ.fetch_add(1, Ordering::SeqCst);
    let base = std::env::temp_dir().join(format!("searchbox-it-{}-{}", std::process::id(), n));
    Config {
        host: "127.0.0.1".to_string(),
        port: 0,
        base_dir: base.clone(),
        db_dir: base.clone(),
        vault_dir: base.join("vault"),
        meili_data_dir: base.join("meili"),
        thumbnails_dir: base.join("thumbnails"),
        log_dir: base.join("log"),
        max_upload_size: 100 * 1024 * 1024,
    }
}

/// Boot the full app on a temp-file DB bound to an ephemeral port and return the
/// base URL. Binding before `spawn` means the OS accepts connections into the
/// backlog immediately, so the client never races server startup. The server
/// task is detached and stops when the test runtime is torn down.
async fn spawn_app() -> String {
    let cfg = temp_config();
    let pool = crate::db::connect(&cfg.db_path())
        .await
        .expect("connect db");
    crate::db::init_schema(&pool).await.expect("apply schema");

    let session_store = SqliteStore::new(pool.clone());
    session_store
        .migrate()
        .await
        .expect("session-store migrate");
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(Duration::days(30)));

    let state = AppState {
        config: Arc::new(cfg),
        db: pool,
        templates: Templates::new().expect("load templates"),
        jobs: Arc::new(crate::jobs::JobRegistry::default()),
        meili_proc: Arc::new(MeiliSupervisor::default()),
        login_throttle: Arc::new(crate::auth::throttle::LoginThrottle::default()),
        vault_seal_key: Arc::new(crate::vault::crypto::generate_seal_key()),
    };

    let app = crate::routes::router(state).layer(session_layer);
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("local addr");
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    format!("http://{addr}")
}

/// A client that stores cookies (so the session persists) and does NOT follow
/// redirects (so we can assert on the 3xx + Location of login/setup flows).
fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("build reqwest client")
}

/// Pull the CSRF token out of a rendered `setup.html` / `login.html` form.
fn extract_csrf(html: &str) -> String {
    let marker = "name=\"csrf_token\" value=\"";
    let start = html.find(marker).expect("csrf hidden input present") + marker.len();
    let rest = &html[start..];
    let end = rest.find('"').expect("closing quote on csrf value");
    rest[..end].to_string()
}

#[tokio::test]
async fn http_health_reports_ok() {
    let base = spawn_app().await;
    let resp = client()
        .get(format!("{base}/api/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["db"], true, "health touches the DB");
}

#[tokio::test]
async fn http_status_reports_setup_required_on_fresh_db() {
    let base = spawn_app().await;
    let body: serde_json::Value = client()
        .get(format!("{base}/api/auth/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["setup_required"], true);
    assert_eq!(body["authenticated"], false);
}

#[tokio::test]
async fn http_protected_api_requires_auth() {
    let base = spawn_app().await;
    let resp = client()
        .get(format!("{base}/api/version"))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status().as_u16(),
        401,
        "an unauthenticated /api/ route is rejected with 401"
    );
}

#[tokio::test]
async fn http_logout_without_csrf_is_forbidden() {
    let base = spawn_app().await;
    let resp = client()
        .post(format!("{base}/logout"))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status().as_u16(),
        403,
        "a destructive endpoint rejects a missing CSRF token"
    );
}

#[tokio::test]
async fn http_setup_flow_creates_owner_and_authenticates() {
    let base = spawn_app().await;
    let http = client();

    // 1. The setup page mints a CSRF token (saved in the session cookie).
    let setup_html = http
        .get(format!("{base}/setup"))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    let csrf = extract_csrf(&setup_html);

    // 2. Submitting the form creates the owner and logs the session in,
    //    redirecting to /settings with the one-time recovery key.
    let resp = http
        .post(format!("{base}/setup"))
        .form(&[
            ("email", "owner@example.com"),
            ("password", "password123"),
            ("name", "Owner"),
            ("csrf_token", &csrf),
        ])
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().is_redirection(),
        "setup redirects on success, got {}",
        resp.status()
    );
    let location = resp
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    assert!(
        location.starts_with("/settings"),
        "redirect target was {location}"
    );

    // 3. The session is now authenticated and setup is no longer required.
    let status: serde_json::Value = http
        .get(format!("{base}/api/auth/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["authenticated"], true);
    assert_eq!(status["setup_required"], false);
    assert_eq!(status["user"]["email"], "owner@example.com");

    // 4. A route that returned 401 above now succeeds for the logged-in session.
    let ver = http
        .get(format!("{base}/api/version"))
        .send()
        .await
        .unwrap();
    assert_eq!(ver.status().as_u16(), 200);
    let ver_body: serde_json::Value = ver.json().await.unwrap();
    assert!(
        ver_body["version"].is_string(),
        "version endpoint returns a version"
    );
}
