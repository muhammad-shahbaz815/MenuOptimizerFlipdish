-- Example migration: add a simple user preference table.
-- Run with: npm run db:migrate (local) or npm run db:migrate:prod (remote).

CREATE TABLE IF NOT EXISTS UserPreference (
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updatedAt TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (userId, key),
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_preference_user ON UserPreference(userId);
