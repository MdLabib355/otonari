// The registrations table: people who have proved their email with a code, but have not chosen a password yet.

import crypto from 'node:crypto';
import { query, queryOne } from '../../core/database.ts';

function hashTicket(ticket: string): string {
  return crypto.createHash('sha256').update(ticket).digest('hex');
}

// Returns the ticket: whoever has it may create the account for this address, within 15 minutes.
export async function createTicket(email: string): Promise<string> {
  const ticket = crypto.randomBytes(32).toString('base64url');
  await query('DELETE FROM registrations WHERE expires_at < now()');
  await query(
    "INSERT INTO registrations (ticket_hash, email, expires_at) VALUES ($1, $2, now() + INTERVAL '15 minutes')",
    [hashTicket(ticket), email]
  );
  return ticket;
}

// A ticket works once. Returns the proved address, or undefined.
export async function useTicket(ticket: string): Promise<string | undefined> {
  const row = await queryOne<{ email: string }>(
    'DELETE FROM registrations WHERE ticket_hash = $1 AND expires_at > now() RETURNING email',
    [hashTicket(ticket)]
  );
  return row?.email;
}
