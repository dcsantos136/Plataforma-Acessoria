ALTER TABLE athlete_profiles ADD COLUMN weight_kg REAL;
ALTER TABLE athlete_profiles ADD COLUMN height_cm REAL;
ALTER TABLE athlete_profiles ADD COLUMN health_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE athlete_profiles ADD COLUMN health_data_consent_at TEXT;
ALTER TABLE athlete_profiles ADD COLUMN profile_completed_at TEXT;
CREATE TABLE IF NOT EXISTS athlete_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_athlete_invitations_trainer ON athlete_invitations(trainer_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_athlete_invitations_pending_email ON athlete_invitations(trainer_id,email_normalized) WHERE status='pending';
