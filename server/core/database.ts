// PostgreSQL: the connections, transactions, and tables for accounts, groups, loans, S3 photos,
// Group Admin, Super Admin, global catalog, and append-only audit logs.

import './env.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

// The default is the database of `npm run db` (docker-compose.dev.yml), for development.
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://otonari:otonari@localhost:5433/otonari';

// Times come back as ISO 8601 text, like everywhere else in the app (and not as Date objects).
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (text) => new Date(text).toISOString());

const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.on('error', (error) => console.error('Database connection lost:', error.message));

const currentTransaction = new AsyncLocalStorage<pg.PoolClient>();

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connection = currentTransaction.getStore() ?? pool;
  const result = await connection.query<T>(sql, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

const WRITE_LOCK = 2611;

export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  if (currentTransaction.getStore()) return work();

  const connection = await pool.connect();
  let broken: Error | undefined;
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK]);
    const result = await currentTransaction.run(connection, work);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK').catch((failure: Error) => (broken = failure));
    throw error;
  } finally {
    connection.release(broken);
  }
}

export function found<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value, but there is none');
  return value;
}

export async function createTables() {
  // A database from before there were accounts can't be used anymore: nobody in it has an email.
  const old = await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'token'");
  if (old.length > 0) {
    throw new Error('This database is from an older version. Reset it: npm run seed (Docker: docker compose down -v)');
  }
  await query(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('building','block')),
      city TEXT NOT NULL,
      image TEXT, -- the group's icon, like users.avatar; NULL = none
      join_policy TEXT NOT NULL DEFAULT 'open'
        CHECK (join_policy IN ('open','approval_required','locked')),
      lifecycle_status TEXT NOT NULL DEFAULT 'active'
        CHECK (lifecycle_status IN ('active','read_only','suspended','archived')),
      invite_code_version INTEGER NOT NULL DEFAULT 1,
      suspended_at TIMESTAMPTZ,
      suspension_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      google_only BOOLEAN NOT NULL DEFAULT false,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin','group_admin','user')),
      group_id INTEGER REFERENCES groups(id),
      joined_at TIMESTAMPTZ,
      nickname TEXT NOT NULL DEFAULT '',
      avatar TEXT, -- profile photo, like handover_photo; NULL = none
      lang TEXT NOT NULL CHECK (lang IN ('en','ja','ja-easy','bn')),
      elder_mode BOOLEAN NOT NULL DEFAULT false,
      is_demo BOOLEAN NOT NULL DEFAULT false,
      deactivated_at TIMESTAMPTZ,
      member_status TEXT NOT NULL DEFAULT 'active'
        CHECK (member_status IN ('pending','active','borrow_muted','suspended')),
      muted_until TIMESTAMPTZ,
      trust_override TEXT CHECK (trust_override IN ('granted','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CHECK (role <> 'group_admin' OR group_id IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      ticket_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      item_key TEXT NOT NULL,
      max_days INTEGER NOT NULL DEFAULT 3,
      spot TEXT NOT NULL,
      trusted_only BOOLEAN NOT NULL DEFAULT false,
      photo TEXT, -- the owner's photo of it, like users.avatar; NULL = none
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      removed_at TIMESTAMPTZ,
      hidden_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id),
      borrower_id INTEGER NOT NULL REFERENCES users(id),
      lender_id INTEGER NOT NULL REFERENCES users(id),
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','declined','cancelled','active','returned')),
      handover_photo TEXT,
      return_photo TEXT,
      returned_at TIMESTAMPTZ,
      reminded_soon_at TIMESTAMPTZ,
      reminded_overdue_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loans(id),
      from_user_id INTEGER REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      phrase_key TEXT NOT NULL,
      params JSONB NOT NULL DEFAULT '{}',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS group_announcements (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      author_id INTEGER REFERENCES users(id),
      phrase_key TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS loan_disputes (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      loan_id INTEGER NOT NULL REFERENCES loans(id),
      raised_by_user_id INTEGER REFERENCES users(id),
      reason_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      escalated_to_super_admin BOOLEAN NOT NULL DEFAULT false,
      escalation_notice_sent BOOLEAN NOT NULL DEFAULT false,
      resolution_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      resolved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id),
      actor_label TEXT NOT NULL,
      actor_role TEXT NOT NULL CHECK (actor_role IN ('super_admin','group_admin','system')),
      scope_group_id INTEGER REFERENCES groups(id),
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      detail TEXT NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      item_key TEXT PRIMARY KEY,
      emoji TEXT NOT NULL,
      category TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      label_en TEXT NOT NULL,
      label_ja TEXT NOT NULL,
      label_ja_easy TEXT NOT NULL,
      label_bn TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS catalog_categories (
      category_key TEXT PRIMARY KEY,
      icon_key TEXT NOT NULL DEFAULT 'default',
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 100,
      label_en TEXT NOT NULL,
      label_ja TEXT NOT NULL,
      label_ja_easy TEXT NOT NULL,
      label_bn TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
  `);
}

// Zero-downtime additive migrations for already-deployed production databases.
export async function addNewColumns() {
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_only BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS member_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_override TEXT;

    ALTER TABLE groups ADD COLUMN IF NOT EXISTS image TEXT;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'open';
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_code_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

    ALTER TABLE items ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo TEXT;

    -- There are no co-admins anymore: they become equal group admins, before the roles are limited to three.
    -- (One statement list = one transaction, so nobody can be made a co-admin in between.)
    UPDATE users SET role = CASE WHEN group_id IS NULL THEN 'user' ELSE 'group_admin' END WHERE role = 'co_admin';
    UPDATE audit_logs SET actor_role = 'group_admin' WHERE actor_role = 'co_admin';
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin','group_admin','user'));
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
    ALTER TABLE users ADD CONSTRAINT users_check CHECK (role <> 'group_admin' OR group_id IS NOT NULL);
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_role_check;
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_role_check
      CHECK (actor_role IN ('super_admin','group_admin','system'));

    CREATE INDEX IF NOT EXISTS idx_audit_logs_scope_created ON audit_logs (scope_group_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_loan_disputes_group_status ON loan_disputes (group_id, status);
    CREATE INDEX IF NOT EXISTS idx_group_announcements_active ON group_announcements (group_id) WHERE is_active;
  `);
}

export async function resetDatabase() {
  await query(
    'DROP TABLE IF EXISTS audit_logs, loan_disputes, group_announcements, catalog_items, catalog_categories, messages, loans, items, sessions, email_codes, registrations, users, groups'
  );
  await createTables();
}

export async function waitForDatabase() {
  for (let attemptsLeft = 30; ; attemptsLeft -= 1) {
    try {
      await query('SELECT 1');
      return;
    } catch (error) {
      if (attemptsLeft === 1) throw error;
      if (attemptsLeft === 30) console.log('Waiting for the database (for development: npm run db) ...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function closeDatabase() {
  await pool.end();
}
