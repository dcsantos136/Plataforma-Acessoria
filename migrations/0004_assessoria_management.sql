CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_assessments_owner ON assessments(owner_user_id);

CREATE TABLE IF NOT EXISTS assessment_trainers (
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  trainer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'trainer' CHECK(member_role IN ('owner','admin','trainer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(assessment_id,trainer_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_trainers_member ON assessment_trainers(trainer_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_trainers_one_active_team
  ON assessment_trainers(trainer_id) WHERE status='active';
