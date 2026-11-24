// The groups table: neighborhoods and their join codes.

import crypto from 'node:crypto';
import type { Group, GroupType } from '../../../shared/types.ts';
import { db, found } from '../../core/database.ts';
import type { CountRow } from '../../types.ts';

// Join codes have no I, L, O, 0 or 1: those are easily mixed up when typing a code from a poster.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Codes are printed in capitals on the poster; accept "sakura-2611" too.
export function findGroupByCode(code: unknown): Group | undefined {
  const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  return db.prepare<unknown[], Group>('SELECT * FROM groups WHERE code = ?').get(cleanCode);
}

export function getGroup(groupId: number): Group {
  return found(db.prepare<unknown[], Group>('SELECT * FROM groups WHERE id = ?').get(groupId));
}

export function listGroups(): Group[] {
  return db.prepare<unknown[], Group>('SELECT * FROM groups ORDER BY id').all();
}

export function countGroups(): number {
  return found(db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM groups').get()).count;
}

// For comparing names: "Sakura Heights" and "SAKURAHEIGHTS" count as the same.
// (NFKC does the same for Japanese full-width typing: "３丁目" and "3丁目".)
function simplified(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

export function findSimilarGroup(name: string, city: string): Group | undefined {
  return listGroups().find(
    (group) => simplified(group.city) === simplified(city) && simplified(group.name) === simplified(name)
  );
}

// A random join code like 'K7PW-3XQD' that no other group has.
function newJoinCode(): string {
  let code: string;
  do {
    let chars = '';
    while (chars.length < 8) chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  } while (findGroupByCode(code));
  return code;
}

// Creates a group with a new join code, and returns that code.
export function createGroup(name: string, type: GroupType, city: string): string {
  const code = newJoinCode();
  db.prepare('INSERT INTO groups (code, name, type, city) VALUES (?, ?, ?, ?)').run(code, name, type, city);
  return code;
}
