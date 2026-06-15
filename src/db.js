import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = process.env.PANSOPHIA_DATA_DIR
  ?? join(homedir(), '.local', 'share', 'pansophia');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = join(DATA_DIR, 'pansophia.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS observer (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE TABLE IF NOT EXISTS expression (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  -- Thought: the event of an observer encountering an expression
  CREATE TABLE IF NOT EXISTS thought (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    observer_id   INTEGER NOT NULL REFERENCES observer(id),
    expression_id INTEGER NOT NULL REFERENCES expression(id),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  -- Meaning: an observer's interpretation of an expression
  CREATE TABLE IF NOT EXISTS meaning (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    observer_id   INTEGER NOT NULL REFERENCES observer(id),
    expression_id INTEGER NOT NULL REFERENCES expression(id),
    text          TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  -- Connection: an observer linking two expressions
  CREATE TABLE IF NOT EXISTS connection (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    observer_id         INTEGER NOT NULL REFERENCES observer(id),
    from_expression_id  INTEGER NOT NULL REFERENCES expression(id),
    to_expression_id    INTEGER NOT NULL REFERENCES expression(id),
    relation            TEXT,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );
`);

// --- Provenance migration ---
// session_id records which Claude Code session produced a row (stamped by the
// Stop-hook distiller, capture-session.js). Additive and nullable: rows written
// before this column existed simply carry NULL. Idempotent — safe to run on an
// existing DB on every startup.
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
for (const table of ['thought', 'meaning', 'connection']) {
  ensureColumn(table, 'session_id', 'TEXT');
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_thought_session    ON thought(session_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_meaning_session    ON meaning(session_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_connection_session ON connection(session_id);`);

export default db;
export { DB_PATH };
