// PostgreSQL connection pool, parameterized query runner, and atomic transaction helper.

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

export async function closeDatabase() {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}
