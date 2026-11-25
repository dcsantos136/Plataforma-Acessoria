CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google','apple')),
  nonce TEXT NOT NULL,
  code_verifier TEXT,
  role TEXT NOT NULL CHECK(role IN ('treinador(a)','atleta')),
  intent TEXT NOT NULL CHECK(intent IN ('login','signup')),
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states(created_at);
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL CHECK(provider IN ('google','apple')),
  provider_subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(provider,provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);
CREATE TABLE IF NOT EXISTS auth_rate_limits (key_hash TEXT PRIMARY KEY NOT NULL, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trainer_athletes (
  trainer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','inactive')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(trainer_id,athlete_id),
  CHECK(trainer_id <> athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_trainer_athletes_athlete ON trainer_athletes(athlete_id);
CREATE TABLE IF NOT EXISTS training_plans (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','released','completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_plans_trainer ON training_plans(trainer_id,status,start_date);
CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT REFERENCES training_plans(id) ON DELETE SET NULL,
  trainer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_date TEXT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'Corrida',
  title TEXT NOT NULL,
  prescription TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER,
  distance_km REAL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','released','completed','missed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_trainer_date ON workouts(trainer_id,workout_date);
CREATE INDEX IF NOT EXISTS idx_workouts_athlete_date ON workouts(athlete_id,workout_date);
CREATE TABLE IF NOT EXISTS workout_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  effort INTEGER CHECK(effort BETWEEN 1 AND 10),
  coach_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_trainer_review ON workout_feedback(coach_seen_at,created_at);
