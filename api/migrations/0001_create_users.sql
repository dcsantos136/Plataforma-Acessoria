CREATE TABLE IF NOT EXISTS users (
id TEXT PRIMARY KEY NOT NULL,
name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
email TEXT NOT NULL,
email_normalized TEXT NOT NULL UNIQUE,
role TEXT NOT NULL CHECK(role IN ('treinador(a)','atleta')),
password_salt TEXT NOT NULL,
password_hash TEXT NOT NULL,
password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256-600000',
terms_accepted_at TEXT NOT NULL,
created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);