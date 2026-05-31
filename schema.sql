-- SearchBox schema. Single-tenant, local-first. Applied on boot via
-- CREATE TABLE IF NOT EXISTS — when you change it, wipe the DB rather
-- than writing a migration.

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    name            TEXT,
    role            TEXT    NOT NULL DEFAULT 'owner',
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_login      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS settings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    NOT NULL UNIQUE,
    value       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

CREATE TABLE IF NOT EXISTS indexed_folders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_path  TEXT    NOT NULL UNIQUE,
    folder_name  TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_synced  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_indexed_folders_path ON indexed_folders(folder_path);

CREATE TABLE IF NOT EXISTS vault_config (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    salt        BLOB    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS encrypted_files (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id              TEXT    NOT NULL UNIQUE,
    wrapped_dek         BLOB    NOT NULL,
    encrypted_filename  TEXT    NOT NULL,
    original_filename   TEXT    NOT NULL,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_encrypted_files_doc_id ON encrypted_files(doc_id);

CREATE TABLE IF NOT EXISTS qb_torrents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    torrent_hash   TEXT    NOT NULL UNIQUE,
    torrent_name   TEXT    NOT NULL,
    save_path      TEXT    NOT NULL,
    files_indexed  INTEGER NOT NULL DEFAULT 0,
    indexed_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_qb_torrents_hash ON qb_torrents(torrent_hash);

CREATE TABLE IF NOT EXISTS bookmarks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slot        INTEGER NOT NULL UNIQUE,
    doc_id      TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    file_type   TEXT    NOT NULL,
    file_path   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_slot ON bookmarks(slot);
CREATE INDEX IF NOT EXISTS idx_bookmarks_doc_id ON bookmarks(doc_id);

CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT    PRIMARY KEY,
    status      TEXT    NOT NULL DEFAULT 'running',
    total       INTEGER NOT NULL DEFAULT 0,
    processed   INTEGER NOT NULL DEFAULT 0,
    indexed     INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    errors      TEXT    NOT NULL DEFAULT '[]',
    folder      TEXT,
    started_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recovery_key (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    wrapped_recovery_dek BLOB    NOT NULL,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
