import type { Database } from "bun:sqlite";

/**
 * The full database schema as idempotent DDL. Re-running it is safe — every
 * statement uses IF NOT EXISTS — so it doubles as the migration on every boot.
 *
 * Conventions: ids are TEXT, timestamps are epoch milliseconds (INTEGER),
 * booleans are INTEGER 0/1, and structured values are stored as JSON TEXT.
 */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id           TEXT PRIMARY KEY,
  watched_vc_ids     TEXT NOT NULL DEFAULT '[]',   -- JSON array of channel ids
  summary_channel_id TEXT,
  updated_at         INTEGER NOT NULL
);

-- Per-user spoken-language setting, scoped to a guild (set via /scribe lang).
-- Applied as the ASR language hint for that user's chunks; 'auto' means detect.
CREATE TABLE IF NOT EXISTS user_language (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  language   TEXT NOT NULL,                        -- ISO 639-1 code or 'auto'
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'ended'
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_guild ON sessions (guild_id);

CREATE TABLE IF NOT EXISTS participants (
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  left_at    INTEGER,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS captions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  username       TEXT NOT NULL,
  text           TEXT NOT NULL,
  ts_start       INTEGER NOT NULL,                  -- ms from session start
  ts_end         INTEGER NOT NULL,
  is_final       INTEGER NOT NULL DEFAULT 0,        -- 0 partial, 1 final
  lang           TEXT,                              -- detected source language (ISO 639-1)
  translated_text TEXT,                             -- English translation (non-English turns)
  translated_to  TEXT                               -- target of translated_text (e.g. 'en')
);
CREATE INDEX IF NOT EXISTS idx_captions_session ON captions (session_id);

CREATE TABLE IF NOT EXISTS transcripts (
  session_id    TEXT PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
  full_text     TEXT NOT NULL,
  per_user_json TEXT NOT NULL DEFAULT '{}'          -- JSON: { userId: text }
);

CREATE TABLE IF NOT EXISTS summaries (
  session_id        TEXT PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
  structured_json   TEXT NOT NULL,                  -- JSON: structured summary
  posted_to_discord INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drive_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                         -- 'audio' | 'transcript' | 'summary'
  url        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drive_links_session ON drive_links (session_id);
`;

/**
 * Add a column to a table when it's missing. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, so we check `PRAGMA table_info` first. Idempotent —
 * lets an existing database gain columns added after its table first shipped.
 */
function addColumnIfMissing(db: Database, table: string, column: string, ddl: string): void {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/** Apply the schema. Idempotent — safe to call on every boot. */
export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  // Translation columns added to captions in Phase 7 (backfill existing DBs).
  addColumnIfMissing(db, "captions", "lang", "lang TEXT");
  addColumnIfMissing(db, "captions", "translated_text", "translated_text TEXT");
  addColumnIfMissing(db, "captions", "translated_to", "translated_to TEXT");
}
