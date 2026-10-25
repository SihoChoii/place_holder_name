-- Star Tagger initial schema (spec §7). Times are UTC Unix milliseconds; ids are UUIDv4 text.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 50),
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE star_claims (
  id                  TEXT PRIMARY KEY,
  hyg_id              INTEGER NOT NULL UNIQUE,
  user_id             TEXT NOT NULL REFERENCES users(id),
  claimed_at          INTEGER NOT NULL,
  request_key         TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  UNIQUE (user_id, request_key)
);
CREATE INDEX star_claims_user_time ON star_claims (user_id, claimed_at);

CREATE TABLE tags (
  id                  TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL REFERENCES star_claims(id),
  hyg_id              INTEGER NOT NULL,
  user_id             TEXT NOT NULL REFERENCES users(id),
  note                TEXT,
  moderation_status   TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  moderation_result   TEXT,
  moderated_at        INTEGER,
  created_at          INTEGER NOT NULL,
  deleted_at          INTEGER,
  request_key         TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  UNIQUE (user_id, request_key)
);
CREATE INDEX tags_star_time   ON tags (hyg_id, created_at, id);
CREATE INDEX tags_user_time   ON tags (user_id, created_at, id);
CREATE INDEX tags_status_time ON tags (moderation_status, created_at, id);
CREATE INDEX tags_claim       ON tags (claim_id);

CREATE TABLE media (
  id                TEXT PRIMARY KEY,
  tag_id            TEXT NOT NULL REFERENCES tags(id),
  position          INTEGER NOT NULL CHECK (position BETWEEN 0 AND 3),
  kind              TEXT NOT NULL CHECK (kind IN ('image','link')),
  file_name         TEXT UNIQUE,
  mime              TEXT,
  width             INTEGER,
  height            INTEGER,
  byte_size         INTEGER,
  original_sha256   TEXT,
  url               TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  moderation_result TEXT,
  created_at        INTEGER NOT NULL,
  UNIQUE (tag_id, position),
  CHECK (
    (kind = 'image' AND file_name IS NOT NULL AND mime IS NOT NULL AND width > 0 AND height > 0
       AND original_sha256 IS NOT NULL AND url IS NULL)
    OR
    (kind = 'link' AND url IS NOT NULL AND file_name IS NULL AND mime IS NULL AND width IS NULL
       AND height IS NULL AND original_sha256 IS NULL)
  )
);
CREATE INDEX media_tag ON media (tag_id, position);

CREATE TABLE comments (
  id                  TEXT PRIMARY KEY,
  tag_id              TEXT NOT NULL REFERENCES tags(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  media_id            TEXT REFERENCES media(id),
  body                TEXT NOT NULL CHECK (length(body) >= 1),
  moderation_status   TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  moderation_result   TEXT,
  moderated_at        INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  deleted_at          INTEGER,
  request_key         TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  UNIQUE (user_id, request_key)
);
CREATE INDEX comments_tag_status_time ON comments (tag_id, moderation_status, created_at, id);
CREATE INDEX comments_user ON comments (user_id);

CREATE TABLE reactions (
  tag_id     TEXT NOT NULL REFERENCES tags(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  emoji      TEXT NOT NULL CHECK (emoji IN ('❤️','✨','🚀','🤩','👍')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tag_id, user_id, emoji)
) WITHOUT ROWID;

CREATE TABLE moderation_jobs (
  id              TEXT PRIMARY KEY,
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('tag','comment')),
  target_id       TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error      TEXT,
  failed_at       INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE (target_kind, target_id)
);
CREATE INDEX moderation_jobs_due ON moderation_jobs (failed_at, next_attempt_at, created_at);
