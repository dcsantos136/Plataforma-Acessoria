CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  organization TEXT,
  specialty TEXT,
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS athlete_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT,
  training_group TEXT,
  primary_modality TEXT,
  birth_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO coach_profiles (user_id) SELECT id FROM users WHERE role='treinador(a)';
INSERT OR IGNORE INTO athlete_profiles (user_id) SELECT id FROM users WHERE role='atleta';
CREATE TRIGGER IF NOT EXISTS users_create_role_profile
AFTER INSERT ON users
BEGIN
  INSERT OR IGNORE INTO coach_profiles (user_id) SELECT NEW.id WHERE NEW.role='treinador(a)';
  INSERT OR IGNORE INTO athlete_profiles (user_id) SELECT NEW.id WHERE NEW.role='atleta';
END;
