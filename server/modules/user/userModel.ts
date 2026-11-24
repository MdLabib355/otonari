// The users table: the neighbors, and how reliable they have been as borrowers.

import crypto from 'node:crypto';
import type { Lang, Person, Trust } from '../../../shared/types.ts';
import { found, query, queryOne } from '../../core/database.ts';
import type { CountRow, UserRow } from '../../types.ts';

export type DemoUserRow = UserRow & { group_name: string; group_code: string };

export async function getUser(userId: number): Promise<UserRow> {
  return found(await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [userId]));
}

// What the two people in a loan may know about each other.
export async function getPerson(userId: number): Promise<Person> {
  return found(await queryOne<Person>('SELECT id, nickname, lang FROM users WHERE id = $1', [userId]));
}

// A member is someone who hasn't left.
export async function findMember(userId: number): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1 AND left_at IS NULL', [userId]);
}

export async function findMemberByToken(token: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM users WHERE token = $1 AND left_at IS NULL', [token]);
}

export async function countMembers(groupId: number): Promise<number> {
  const row = await queryOne<CountRow>(
    'SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND left_at IS NULL',
    [groupId]
  );
  return found(row).count;
}

export async function listDemoUsers(): Promise<DemoUserRow[]> {
  return query<DemoUserRow>(
    `SELECT users.*, groups.name AS group_name, groups.code AS group_code
     FROM users JOIN groups ON groups.id = users.group_id
     WHERE users.is_demo AND users.left_at IS NULL
     ORDER BY users.group_id, users.id`
  );
}

// The new random token is the user's whole identity (the client keeps it in localStorage).
export async function createUser(groupId: number, nickname: string, lang: Lang): Promise<UserRow> {
  const user = await queryOne<UserRow>(
    'INSERT INTO users (group_id, nickname, lang, token) VALUES ($1, $2, $3, $4) RETURNING *',
    [groupId, nickname, lang, crypto.randomUUID()]
  );
  return found(user);
}

export async function setLang(userId: number, lang: Lang) {
  await query('UPDATE users SET lang = $1 WHERE id = $2', [lang, userId]);
}

export async function setElderMode(userId: number, on: boolean) {
  await query('UPDATE users SET elder_mode = $1 WHERE id = $2', [on, userId]);
}

// From now on their token doesn't work anymore.
export async function markLeft(userId: number) {
  await query('UPDATE users SET left_at = now() WHERE id = $1', [userId]);
}

// How reliable a borrower has been: { joined_days, on_time, late }. Only completed returns count,
// and "on time" means that the return photo was sent before the loan was due.
export async function trustOf(userId: number): Promise<Trust> {
  const trust = await queryOne<Trust>(
    `SELECT EXTRACT(DAY FROM now() - users.created_at)::int AS joined_days,
            COUNT(*) FILTER (WHERE loans.returned_at <= loans.end_at)::int AS on_time,
            COUNT(*) FILTER (WHERE loans.returned_at > loans.end_at)::int AS late
     FROM users LEFT JOIN loans ON loans.borrower_id = users.id AND loans.status = 'returned'
     WHERE users.id = $1
     GROUP BY users.id`,
    [userId]
  );
  return found(trust);
}

// "Trusted neighbors only" items need at least one on-time return.
export async function isTrusted(userId: number): Promise<boolean> {
  return (await trustOf(userId)).on_time > 0;
}
