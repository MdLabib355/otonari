// Idempotent PostgreSQL schema DDL and indexes.

import { query } from './pool.js';

export async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS managers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_managers_email_lower ON managers (LOWER(email));

    CREATE TABLE IF NOT EXISTS manager_sessions (
      token TEXT PRIMARY KEY,
      manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
    );
    CREATE INDEX IF NOT EXISTS idx_manager_sessions_manager ON manager_sessions (manager_id);

    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('building', 'block')),
      city TEXT NOT NULL,
      manager_id INTEGER REFERENCES managers(id),
      require_approval BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      nickname TEXT NOT NULL,
      lang TEXT NOT NULL CHECK (lang IN ('en', 'ja', 'ja-easy', 'bn')),
      elder_mode BOOLEAN NOT NULL DEFAULT FALSE,
      token TEXT UNIQUE NOT NULL,
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
      manager_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS transfer_codes (
      code TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rotate_token BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      item_key TEXT NOT NULL,
      max_days INTEGER NOT NULL DEFAULT 3 CHECK (max_days IN (1, 2, 3, 7)),
      spot TEXT NOT NULL,
      trusted_only BOOLEAN NOT NULL DEFAULT FALSE,
      paused BOOLEAN NOT NULL DEFAULT FALSE,
      photo_url TEXT,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'lent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS loans (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id),
      borrower_id INTEGER NOT NULL REFERENCES users(id),
      lender_id INTEGER NOT NULL REFERENCES users(id),
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'active', 'returned')),
      handover_photo TEXT,
      return_photo TEXT,
      issue_photo TEXT,
      returned_at TIMESTAMPTZ,
      reminded_soon_at TIMESTAMPTZ,
      reminded_overdue_at TIMESTAMPTZ,
      last_pinged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loans(id),
      from_user_id INTEGER REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      phrase_key TEXT NOT NULL,
      params JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

    ALTER TABLE groups ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES managers(id);
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_note TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE loans ADD COLUMN IF NOT EXISTS last_pinged_at TIMESTAMPTZ;
    ALTER TABLE loans ADD COLUMN IF NOT EXISTS issue_photo TEXT;

    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
    ALTER TABLE users ADD CONSTRAINT users_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));

    ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
    ALTER TABLE loans ADD CONSTRAINT loans_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'active', 'returned'));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_nickname
      ON users (group_id, LOWER(BTRIM(nickname))) WHERE left_at IS NULL AND status <> 'rejected';
    CREATE INDEX IF NOT EXISTS idx_items_group_active ON items(group_id) WHERE removed_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_items_owner_active ON items(owner_id) WHERE removed_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_loans_item_status ON loans(item_id, status);
    CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id);
    CREATE INDEX IF NOT EXISTS idx_loans_lender ON loans(lender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_loan ON messages(loan_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_user_id) WHERE read_at IS NULL;
  `);
}

export async function resetDatabase() {
  await query(`
    DROP TABLE IF EXISTS push_subscriptions CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS loans CASCADE;
    DROP TABLE IF EXISTS items CASCADE;
    DROP TABLE IF EXISTS transfer_codes CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS groups CASCADE;
    DROP TABLE IF EXISTS manager_sessions CASCADE;
    DROP TABLE IF EXISTS managers CASCADE;
  `);
  await initDatabase();
}
