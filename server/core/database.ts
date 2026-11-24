// PostgreSQL: the connections, transactions, and the tables from CLAUDE.md section 5.
// The queries are in the model of each module.

import './env.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

// The default is the database of `npm run db` (docker-compose.dev.yml), for development.
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://otonari:otonari@localhost:5433/otonari';

// Times come back as ISO 8601 text, like everywhere else in the app (and not as Date objects).
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (text) => new Date(text).toISOString());

const pool = new pg.Pool({ connectionString: DATABASE_URL });
// E.g. the database restarts: the pool opens new connections by itself, so just write it down.
pool.on('error', (error) => console.error('Database connection lost:', error.message));

// The connection of the transaction we are in, if any. (AsyncLocalStorage keeps it for everything that is
// called inside transaction(), so the models don't have to pass it around.)
const currentTransaction = new AsyncLocalStorage<pg.PoolClient>();

// Runs one SQL statement; $1, $2, ... are the params. Returns the rows.
export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connection = currentTransaction.getStore() ?? pool;
  const result = await connection.query<T>(sql, params);
  return result.rows;
}

// The same for at most one row.
export async function queryOne<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

// All or nothing: if anything in `work` fails, nothing is saved.
// All transactions wait for the same lock, so they run one after the other: what `work` has checked (e.g.
// "the item is available") stays true until it is finished. That is fast enough for a neighborhood.
const WRITE_LOCK = 2611; // any number, but always the same one

export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  if (currentTransaction.getStore()) return work(); // already inside one

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

// For values that must exist (e.g. the item of a loan): TypeScript can't know that a query finds a row.
export function found<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value, but there is none');
  return value;
}

// The schema, exactly as in CLAUDE.md section 5.
// "IF NOT EXISTS" keeps the existing data when the server restarts.
export async function createTables() {
  // A database from before there were accounts can't be used anymore: nobody in it has an email.
  const old = await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'token'");
  if (old.length > 0) {
    throw new Error('This database is from an older version. Reset it: npm run seed (Docker: docker compose down -v)');
  }
  await query(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,          -- join code, e.g. 'SAKURA-2611'
      name TEXT NOT NULL,                 -- shown as-is (proper noun)
      type TEXT NOT NULL CHECK (type IN ('building','block')),
      city TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,         -- lowercase
      email_verified BOOLEAN NOT NULL DEFAULT false, -- proved with a code or Google
      password_hash TEXT,                 -- scrypt; NULL = logs in with a code or Google
      google_sub TEXT UNIQUE,             -- Google's id of the account
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin','group_admin','user')),
      group_id INTEGER REFERENCES groups(id),  -- NULL = in no group
      joined_at TIMESTAMPTZ,              -- when they joined that group
      nickname TEXT NOT NULL DEFAULT '',  -- max 20 chars, asked when joining a group
      lang TEXT NOT NULL CHECK (lang IN ('en','ja','ja-easy','bn')),
      elder_mode BOOLEAN NOT NULL DEFAULT false,
      is_demo BOOLEAN NOT NULL DEFAULT false, -- seeded; its password is public, so it works only in demo mode
      deactivated_at TIMESTAMPTZ,         -- set by a super admin: can't log in
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CHECK (role <> 'group_admin' OR group_id IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,        -- SHA-256 of the token; the token itself is only on the device
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,            -- scrypt of the 6-digit code
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      item_key TEXT NOT NULL,             -- key from catalog.ts, e.g. 'futon_dryer'
      max_days INTEGER NOT NULL DEFAULT 3,
      spot TEXT NOT NULL,                 -- key from SPOTS, e.g. 'entrance'
      trusted_only BOOLEAN NOT NULL DEFAULT false,  -- true = only for people with an on-time return
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      removed_at TIMESTAMPTZ              -- set when the owner removes it (soft delete); NULL = on the shelf
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
      handover_photo TEXT,                -- 's3:photos/xxx.jpg' or '/uploads/xxx.jpg'
      return_photo TEXT,
      returned_at TIMESTAMPTZ,            -- when the borrower sent the return photo
      reminded_soon_at TIMESTAMPTZ,
      reminded_overdue_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loans(id),
      from_user_id INTEGER REFERENCES users(id),   -- NULL = system message (reminders)
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      phrase_key TEXT NOT NULL,           -- e.g. 'request', 'accept', 'sys.dueSoon'
      params JSONB NOT NULL DEFAULT '{}', -- { item, start, end, spot, name }
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
  `);
}

// Start from empty tables: drop them all and create them again (used by seedData.ts).
export async function resetDatabase() {
  await query('DROP TABLE IF EXISTS messages, loans, items, sessions, email_codes, users, groups');
  await createTables();
}

// On start the database may need a moment longer than this server. Try for half a minute.
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

// For scripts (seed.ts): without this they would not end.
export async function closeDatabase() {
  await pool.end();
}
