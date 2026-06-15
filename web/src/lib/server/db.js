import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Mirror the path resolution in ../../../../src/db.js so the explorer reads the
// exact same store the MCP server writes to. Override with PANSOPHIA_DATA_DIR.
const DATA_DIR =
  process.env.PANSOPHIA_DATA_DIR ?? join(homedir(), '.local', 'share', 'pansophia');

export const DB_PATH = join(DATA_DIR, 'pansophia.db');

// Read-only by design: this is an explorer. Opening readonly also makes the SQL
// console safe by construction — any write statement throws at the SQLite layer.
// Live agent sessions write in WAL mode; readonly readers coexist with them.
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma('busy_timeout = 5000');

export default db;
