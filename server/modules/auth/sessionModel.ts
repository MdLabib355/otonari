// The sessions table: one row for every device that is logged in. Only the hash of the token is stored, so
// whoever sees the database can't log in with it. (The token is random and long: a fast hash is enough.)

import crypto from 'node:crypto';
import { query, queryOne } from '../../core/database.ts';
import type { UserRow } from '../../types.ts';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Returns the new token. The client keeps it, and sends it with every request.
export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await query('DELETE FROM sessions WHERE expires_at < now()');
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + INTERVAL '30 days')", [
    hashToken(token),
    userId,
  ]);
  return token;
}

export async function findUserByToken(token: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now() AND users.deactivated_at IS NULL`,
    [hashToken(token)]
  );
}

export async function deleteSession(token: string) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

// Log out everywhere.
export async function deleteSessionsOf(userId: number) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}
