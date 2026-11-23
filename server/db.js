// PostgreSQL database layer (pg): connection pool, schema initialization, transactions,
// and shared query helpers.
//
// Golden rule: never store translated text. A message is a phrase_key + JSONB params;
// the client renders it in each viewer's own language.

import pg from 'pg';

const { Pool } = pg;

let pool = null;

function buildPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const config = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
  if (process.env.DATABASE_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

export function getPool() {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
  }
  return pool;
}

export async function query(sql, params = [], client = null) {
  const executor = client ?? getPool();
  return executor.query(sql, params);
}

// Runs `fn(client)` inside a single PostgreSQL transaction, guaranteeing client release.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('building', 'block')),
      city TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      nickname TEXT NOT NULL,
      lang TEXT NOT NULL CHECK (lang IN ('en', 'ja', 'ja-easy', 'bn')),
      elder_mode BOOLEAN NOT NULL DEFAULT FALSE,
      token TEXT UNIQUE NOT NULL,
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      item_key TEXT NOT NULL,
      max_days INTEGER NOT NULL DEFAULT 3 CHECK (max_days IN (1, 2, 3, 7)),
      spot TEXT NOT NULL,
      trusted_only BOOLEAN NOT NULL DEFAULT FALSE,
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
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'active', 'returned')),
      handover_photo TEXT,
      return_photo TEXT,
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

    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE loans ADD COLUMN IF NOT EXISTS last_pinged_at TIMESTAMPTZ;

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
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS loans CASCADE;
    DROP TABLE IF EXISTS items CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS groups CASCADE;
  `);
  await initDatabase();
}

export async function closeDatabase() {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Create one message for a loan. Every message gets the same params object so any phrase
// can use any placeholder. {name} is always the OTHER person seen from the recipient's side.
export async function createMessage(loan, fromUserId, toUserId, phraseKey, client = null) {
  const itemRes = await query('SELECT item_key, spot FROM items WHERE id = $1', [loan.item_id], client);
  const item = itemRes.rows[0];
  const otherId = toUserId === loan.borrower_id ? loan.lender_id : loan.borrower_id;
  const otherRes = await query('SELECT nickname FROM users WHERE id = $1', [otherId], client);
  const other = otherRes.rows[0];

  const params = {
    item: item.item_key,
    spot: item.spot,
    start: toIso(loan.start_at),
    end: toIso(loan.end_at),
    name: other.nickname,
  };
  const result = await query(
    `INSERT INTO messages (loan_id, from_user_id, to_user_id, phrase_key, params)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [loan.id, fromUserId, toUserId, phraseKey, JSON.stringify(params)],
    client
  );
  return result.rows[0].id;
}

// This person's pending or accepted loan for this item, if any. They cannot ask a second time.
export async function findOpenLoan(itemId, borrowerId, client = null) {
  const result = await query(
    `SELECT id FROM loans
     WHERE item_id = $1 AND borrower_id = $2 AND status IN ('pending', 'accepted')
     LIMIT 1`,
    [itemId, borrowerId],
    client
  );
  return result.rows[0];
}

// Politely decline every pending request for this item (except `exceptLoanId`).
export async function declinePendingLoans(itemId, exceptLoanId = null, client = null) {
  const pendingRes = await query(
    `SELECT * FROM loans WHERE item_id = $1 AND status = 'pending' FOR UPDATE`,
    [itemId],
    client
  );
  for (const loan of pendingRes.rows) {
    if (loan.id === exceptLoanId) continue;
    await query("UPDATE loans SET status = 'declined' WHERE id = $1", [loan.id], client);
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'decline', client);
  }
}

// Reliability record for a borrower: { joined_days, on_time, late }.
export async function trustOf(userId, client = null) {
  const result = await query(
    `SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - users.created_at)) / 86400))::int AS joined_days,
            COUNT(CASE WHEN loans.returned_at <= loans.end_at THEN 1 END)::int AS on_time,
            COUNT(CASE WHEN loans.returned_at > loans.end_at THEN 1 END)::int AS late
     FROM users
     LEFT JOIN loans ON loans.borrower_id = users.id AND loans.status = 'returned'
     WHERE users.id = $1
     GROUP BY users.id`,
    [userId],
    client
  );
  return result.rows[0] ?? { joined_days: 0, on_time: 0, late: 0 };
}

export async function isTrusted(userId, client = null) {
  const trust = await trustOf(userId, client);
  return trust.on_time > 0;
}

export function publicUser(user) {
  return {
    id: user.id,
    group_id: user.group_id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: Boolean(user.elder_mode),
  };
}

export async function getMe(userId, client = null) {
  const userRes = await query('SELECT * FROM users WHERE id = $1', [userId], client);
  const user = userRes.rows[0];
  const groupRes = await query('SELECT * FROM groups WHERE id = $1', [user.group_id], client);
  return { user: publicUser(user), group: groupRes.rows[0] };
}
