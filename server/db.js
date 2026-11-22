// SQLite database (better-sqlite3): opens server/otonari.db, creates the tables from
// CLAUDE.md section 5, and holds a few small helpers shared by the routes.
//
// Golden rule: never store translated text. A message is a phrase_key + params (keys and raw
// values); the client renders it in each viewer's own language.

import path from 'node:path';
import Database from 'better-sqlite3';

export const db = new Database(path.join(import.meta.dirname, 'otonari.db'));

// SQLite only enforces REFERENCES (foreign keys) when this is switched on.
db.pragma('foreign_keys = ON');

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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      item_key TEXT NOT NULL,             -- key from catalog.js, e.g. 'futon_dryer'
      max_days INTEGER NOT NULL DEFAULT 3,
      spot TEXT NOT NULL,                 -- key from SPOTS, e.g. 'entrance'
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

// Start from empty tables: drop them all and create them again (used by seed.js).
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

// Create one message for a loan. Every message gets the same params object, so any phrase
// can use any placeholder. {name} is always the OTHER person, seen from the recipient's side:
// the borrower sees the lender's nickname, the lender sees the borrower's.
// fromUserId is null for system messages (reminders). Returns the new message id.
export function createMessage(loan, fromUserId, toUserId, phraseKey) {
  const item = db.prepare('SELECT item_key, spot FROM items WHERE id = ?').get(loan.item_id);
  const otherId = toUserId === loan.borrower_id ? loan.lender_id : loan.borrower_id;
  const other = db.prepare('SELECT nickname FROM users WHERE id = ?').get(otherId);

  const params = {
    item: item.item_key,
    spot: item.spot,
    start: loan.start_at,
    end: loan.end_at,
    name: other.nickname,
  };
  const result = db
    .prepare(
      'INSERT INTO messages (loan_id, from_user_id, to_user_id, phrase_key, params) VALUES (?, ?, ?, ?, ?)'
    )
    .run(loan.id, fromUserId, toUserId, phraseKey, JSON.stringify(params));
  return result.lastInsertRowid;
}

// What the client may see about a user: everything except the token.
export function publicUser(user) {
  return {
    id: user.id,
    group_id: user.group_id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: user.elder_mode === 1,
  };
}

// "Me" as the client sees it: { user, group }. Used by /api/me, /api/join and the demo login.
export function getMe(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(user.group_id);
  return { user: publicUser(user), group };
}
