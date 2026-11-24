// The email_codes table: the 6-digit code that was sent to an address. One per address, for 10 minutes and
// 5 attempts.

import { queryOne, query } from '../../core/database.ts';

export async function saveEmailCode(email: string, codeHash: string) {
  await query(
    `INSERT INTO email_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + INTERVAL '10 minutes')
     ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = now() + INTERVAL '10 minutes', attempts = 0`,
    [email, codeHash]
  );
}

// Counts the attempt first, then returns the hash to compare with. Undefined: no valid code.
export async function useAttempt(email: string): Promise<string | undefined> {
  const row = await queryOne<{ code_hash: string }>(
    `UPDATE email_codes SET attempts = attempts + 1
     WHERE email = $1 AND attempts < 5 AND expires_at > now() RETURNING code_hash`,
    [email]
  );
  return row?.code_hash;
}

// A code works once. False if somebody else has just used it.
export async function deleteEmailCode(email: string, codeHash: string): Promise<boolean> {
  const rows = await query('DELETE FROM email_codes WHERE email = $1 AND code_hash = $2 RETURNING email', [
    email,
    codeHash,
  ]);
  return rows.length > 0;
}
