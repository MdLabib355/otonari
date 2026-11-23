// PostgreSQL connection pool, parameterized query runner, and atomic transaction helper
// with post-commit hook support so SSE/push notifications never fire on rolled-back writes.

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

// Schedule side-effects (SSE, Web Push) to execute strictly after COMMIT (or immediately if non-transactional).
export function afterCommit(client, fn) {
  if (client && Array.isArray(client._afterCommit)) {
    client._afterCommit.push(fn);
  } else {
    Promise.resolve().then(fn).catch((err) => console.error('Post-commit hook failed:', err));
  }
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  client._afterCommit = [];
  let committed = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    committed = true;
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    const callbacks = client._afterCommit;
    delete client._afterCommit;
    client.release();
    if (committed && callbacks.length > 0) {
      for (const cb of callbacks) {
        Promise.resolve().then(cb).catch((err) => console.error('Post-commit hook failed:', err));
      }
    }
  }
}

export async function closeDatabase() {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}
