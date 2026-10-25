CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  summary TEXT,
  turns INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  summary_hyg_ids TEXT,
  UNIQUE (user_id, scope)
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  referenced_hyg_ids TEXT
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  units TEXT NOT NULL DEFAULT 'ly' CHECK (units IN ('ly', 'pc')),
  speed_c REAL NOT NULL DEFAULT 0.9 CHECK (speed_c > 0 AND speed_c < 1),
  language TEXT NOT NULL DEFAULT 'en',
  voice TEXT NOT NULL DEFAULT 'eve',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_recent_stars (
  user_id TEXT NOT NULL,
  hyg_id INTEGER NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, hyg_id)
);

CREATE TABLE IF NOT EXISTS star_knowledge (
  hyg_id INTEGER PRIMARY KEY,
  facts_json TEXT NOT NULL,
  wiki_title TEXT,
  wiki_summary TEXT,
  wiki_fetched_at INTEGER
);

CREATE TABLE IF NOT EXISTS star_blurbs (
  hyg_id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  speech_script TEXT,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS speech_scripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  hyg_id INTEGER,
  text TEXT NOT NULL CHECK (length(text) <= 600),
  text_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS community_digest (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);
