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

export default db;
export { DB_PATH };
