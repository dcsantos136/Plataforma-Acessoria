CREATE TABLE IF NOT EXISTS workout_coach_replies (
  feedback_id TEXT PRIMARY KEY NOT NULL REFERENCES workout_feedback(id) ON DELETE CASCADE,
  trainer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 3 AND 1200),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_coach_replies_trainer ON workout_coach_replies(trainer_id,updated_at DESC);
