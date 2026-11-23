// Single-use 10-minute transfer/restore codes for multi-device linking and manager-assisted lost-phone restore.

import crypto from 'node:crypto';
import { afterCommit, query, withTransaction } from '../db/pool.js';
import { disconnectUser } from './events.js';
import { getMe } from './loans.js';

// Unambiguous characters (excludes I, L, O, 0, 1).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode() {
  let chars = '';
  while (chars.length < 8) {
    chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export async function createTransferCode(userId, { rotateToken = false } = {}, client = null) {
  // Replace any older unused transfer codes for this user so only the latest code is active.
  await query('DELETE FROM transfer_codes WHERE user_id = $1 AND used_at IS NULL', [userId], client);

  let code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = generateCode();
    try {
      const res = await query(
        `INSERT INTO transfer_codes (code, user_id, rotate_token, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')
         RETURNING code, rotate_token, expires_at`,
        [code, userId, Boolean(rotateToken)],
        client
      );
      return res.rows[0];
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }
  throw new Error('Could not generate a unique transfer code');
}

export async function consumeTransferCode(rawCode) {
  const cleanCode = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!cleanCode) return null;

  return withTransaction(async (client) => {
    const consumed = await query(
      `UPDATE transfer_codes
       SET used_at = NOW()
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING user_id, rotate_token`,
      [cleanCode],
      client
    );
    const row = consumed.rows[0];
    if (!row) return null;

    const userRes = await query(
      "SELECT * FROM users WHERE id = $1 AND left_at IS NULL AND status <> 'rejected' FOR UPDATE",
      [row.user_id],
      client
    );
    const user = userRes.rows[0];
    if (!user) return null;

    let token = user.token;
    if (row.rotate_token) {
      token = crypto.randomUUID();
      await query('UPDATE users SET token = $1 WHERE id = $2', [token, user.id], client);
      afterCommit(client, () => disconnectUser(user.id));
    }

    const me = await getMe(user.id, client);
    return { token, rotated: Boolean(row.rotate_token), ...me };
  });
}
