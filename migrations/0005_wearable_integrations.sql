CREATE TABLE IF NOT EXISTS wearable_connections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('strava')),
  provider_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_sync_at TEXT,
  PRIMARY KEY(user_id,provider),
  UNIQUE(provider,provider_account_id)
);

CREATE TABLE IF NOT EXISTS wearable_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('strava')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wearable_oauth_states_created ON wearable_oauth_states(created_at);

CREATE TABLE IF NOT EXISTS device_activities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('strava')),
  provider_activity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sport_type TEXT NOT NULL DEFAULT 'Workout',
  started_at TEXT NOT NULL,
  duration_seconds INTEGER,
  distance_meters REAL,
  average_heart_rate REAL,
  max_heart_rate REAL,
  calories REAL,
  linked_workout_id TEXT REFERENCES workouts(id) ON DELETE SET NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id,provider,provider_activity_id)
);
CREATE INDEX IF NOT EXISTS idx_device_activities_user_started ON device_activities(user_id,started_at DESC);
