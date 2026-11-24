// SQLite database (better-sqlite3): opens server/otonari.db and creates the tables from CLAUDE.md section 5.
// The queries are in the model of each module.

import path from 'node:path';
import Database from 'better-sqlite3';

export const db: Database.Database = new Database(path.join(import.meta.dirname, '..', 'otonari.db'));

// SQLite only enforces REFERENCES (foreign keys) when this is switched on.
db.pragma('foreign_keys = ON');

// For values that must exist (e.g. the item of a loan): TypeScript can't know that a query finds a row.
export function found<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value, but there is none');
  return value;
}

// The schema, exactly as in CLAUDE.md section 5.
// "IF NOT EXISTS" keeps the existing data when the server restarts.
export function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,          -- join code, e.g. 'SAKURA-2611'
      name TEXT NOT NULL,                 -- shown as-is (proper noun)
      type TEXT NOT NULL CHECK (type IN ('building','block')),
      city TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      nickname TEXT NOT NULL,             -- max 20 chars
      lang TEXT NOT NULL CHECK (lang IN ('en','ja','ja-easy','bn')),
      elder_mode INTEGER NOT NULL DEFAULT 0,
      token TEXT UNIQUE NOT NULL,         -- crypto.randomUUID()
      is_demo INTEGER NOT NULL DEFAULT 0, -- 1 = seeded demo neighbor: anyone may "continue as" them in demo mode
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      left_at TEXT                        -- set when they leave (their token stops working); NULL = member
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      item_key TEXT NOT NULL,             -- key from catalog.ts, e.g. 'futon_dryer'
      max_days INTEGER NOT NULL DEFAULT 3,
      spot TEXT NOT NULL,                 -- key from SPOTS, e.g. 'entrance'
      trusted_only INTEGER NOT NULL DEFAULT 0,  -- 1 = only for people with an on-time return
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      removed_at TEXT                     -- set when the owner removes it (soft delete); NULL = on the shelf
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id),
      borrower_id INTEGER NOT NULL REFERENCES users(id),
      lender_id INTEGER NOT NULL REFERENCES users(id),
      start_at TEXT NOT NULL,             -- ISO 8601
      end_at TEXT NOT NULL,               -- ISO 8601
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','declined','cancelled','active','returned')),
      handover_photo TEXT,                -- '/uploads/xxx.jpg'
      return_photo TEXT,
      returned_at TEXT,                   -- ISO 8601, when the borrower sent the return photo
      reminded_soon_at TEXT,
      reminded_overdue_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loans(id),
      from_user_id INTEGER REFERENCES users(id),   -- NULL = system message (reminders)
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      phrase_key TEXT NOT NULL,           -- e.g. 'request', 'accept', 'sys.dueSoon'
      params TEXT NOT NULL DEFAULT '{}',  -- JSON: { item, start, end, spot, name }
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

createTables();

// Databases created before these columns existed get them added here
// (`npm run seed` would also fix it, because it recreates all tables).
function addMissingColumn(table: string, column: string, type: string) {
  const info = db.pragma(`table_info(${table})`) as { name: string }[];
  const columns = info.map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

addMissingColumn('users', 'left_at', 'TEXT');
addMissingColumn('users', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
addMissingColumn('items', 'removed_at', 'TEXT');
addMissingColumn('items', 'trusted_only', 'INTEGER NOT NULL DEFAULT 0');
addMissingColumn('loans', 'returned_at', 'TEXT');

// Start from empty tables: drop them all and create them again (used by seed.ts).
// Children go first, because of the foreign keys.
export function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS loans;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS groups;
  `);
  createTables();
}
