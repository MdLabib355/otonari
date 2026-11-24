// The users table: the neighbors, and how reliable they have been as borrowers.

import crypto from 'node:crypto';
import type { Lang, Person, Trust } from '../../../shared/types.ts';
import { db, found } from '../../core/database.ts';
import type { CountRow, UserRow } from '../../types.ts';

export type DemoUserRow = UserRow & { group_name: string; group_code: string };

export function getUser(userId: number): UserRow {
  return found(db.prepare<unknown[], UserRow>('SELECT * FROM users WHERE id = ?').get(userId));
}

// What the two people in a loan may know about each other.
export function getPerson(userId: number): Person {
  return found(db.prepare<unknown[], Person>('SELECT id, nickname, lang FROM users WHERE id = ?').get(userId));
}

// A member is someone who hasn't left.
export function findMember(userId: number): UserRow | undefined {
  return db.prepare<unknown[], UserRow>('SELECT * FROM users WHERE id = ? AND left_at IS NULL').get(userId);
}

export function findMemberByToken(token: string): UserRow | undefined {
  return db.prepare<unknown[], UserRow>('SELECT * FROM users WHERE token = ? AND left_at IS NULL').get(token);
}

export function countMembers(groupId: number): number {
  return found(
    db
      .prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM users WHERE group_id = ? AND left_at IS NULL')
      .get(groupId)
  ).count;
}

export function listDemoUsers(): DemoUserRow[] {
  return db
    .prepare<unknown[], DemoUserRow>(
      `SELECT users.*, groups.name AS group_name, groups.code AS group_code
       FROM users JOIN groups ON groups.id = users.group_id
       WHERE users.is_demo = 1 AND users.left_at IS NULL
       ORDER BY users.group_id, users.id`
    )
    .all();
}

// The new random token is the user's whole identity (the client keeps it in localStorage).
export function createUser(groupId: number, nickname: string, lang: Lang): UserRow {
  const result = db
    .prepare('INSERT INTO users (group_id, nickname, lang, token) VALUES (?, ?, ?, ?)')
    .run(groupId, nickname, lang, crypto.randomUUID());
  return getUser(Number(result.lastInsertRowid));
}

export function setLang(userId: number, lang: Lang) {
  db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang, userId);
}

export function setElderMode(userId: number, on: boolean) {
  db.prepare('UPDATE users SET elder_mode = ? WHERE id = ?').run(on ? 1 : 0, userId);
}

// From now on their token doesn't work anymore.
export function markLeft(userId: number) {
  db.prepare("UPDATE users SET left_at = datetime('now') WHERE id = ?").run(userId);
}

// How reliable a borrower has been: { joined_days, on_time, late }. Only completed returns count,
// and "on time" means that the return photo was sent before the loan was due.
export function trustOf(userId: number): Trust {
  const trust = db
    .prepare<unknown[], Trust>(
      `SELECT CAST(julianday('now') - julianday(users.created_at) AS INTEGER) AS joined_days,
              COUNT(CASE WHEN loans.returned_at <= loans.end_at THEN 1 END) AS on_time,
              COUNT(CASE WHEN loans.returned_at > loans.end_at THEN 1 END) AS late
       FROM users LEFT JOIN loans ON loans.borrower_id = users.id AND loans.status = 'returned'
       WHERE users.id = ?`
    )
    .get(userId);
  return found(trust);
}

// "Trusted neighbors only" items need at least one on-time return.
export function isTrusted(userId: number): boolean {
  return trustOf(userId).on_time > 0;
}
