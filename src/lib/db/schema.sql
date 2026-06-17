PRAGMA foreign_keys = ON;

-- NextAuth adapter tables. User email is stored in User.email.
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  emailVerified TEXT,
  image TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
  UNIQUE (provider, providerAccountId)
);

CREATE TABLE IF NOT EXISTS Session (
  id TEXT PRIMARY KEY,
  sessionToken TEXT UNIQUE NOT NULL,
  userId TEXT NOT NULL,
  expires TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS VerificationToken (
  identifier TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE INDEX IF NOT EXISTS idx_account_user_provider ON Account(userId, provider);

-- Tracks applied migrations (run schema.sql first, then db:migrate).
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compare_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  submitted INTEGER NOT NULL DEFAULT 0,
  menu_a TEXT,
  menu_b TEXT,
  portal_url TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES compare_sessions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  item_id TEXT,
  menu_slot TEXT,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reviewer / compare session tables
CREATE TABLE IF NOT EXISTS compare_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  submitted INTEGER NOT NULL DEFAULT 0,
  menu_a TEXT,
  menu_b TEXT,
  portal_url TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES compare_sessions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  item_id TEXT,
  menu_slot TEXT,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
