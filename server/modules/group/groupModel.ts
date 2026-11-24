// The groups table: neighborhoods and their join codes.

import crypto from 'node:crypto';
import type { AdminGroup, Group, GroupType } from '../../../shared/types.ts';
import { found, query, queryOne } from '../../core/database.ts';
import { toText } from '../../core/http.ts';
import type { CountRow } from '../../types.ts';

// Join codes have no I, L, O, 0 or 1: those are easily mixed up when typing a code from a poster.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Codes are printed in capitals on the poster; accept "sakura-2611" too.
export async function findGroupByCode(code: unknown): Promise<Group | undefined> {
  return queryOne<Group>('SELECT * FROM groups WHERE code = $1', [toText(code).toUpperCase()]);
}

export async function getGroup(groupId: number): Promise<Group> {
  return found(await queryOne<Group>('SELECT * FROM groups WHERE id = $1', [groupId]));
}

export async function listGroups(): Promise<Group[]> {
  return query<Group>('SELECT * FROM groups ORDER BY id');
}

export async function listGroupsWithCounts(): Promise<AdminGroup[]> {
  return query<AdminGroup>(
    `SELECT groups.*, COUNT(users.id)::int AS member_count
     FROM groups LEFT JOIN users ON users.group_id = groups.id GROUP BY groups.id ORDER BY groups.id`
  );
}

export async function changeJoinCode(groupId: number) {
  await query('UPDATE groups SET code = $1 WHERE id = $2', [await newJoinCode(), groupId]);
}

export async function countGroups(): Promise<number> {
  return found(await queryOne<CountRow>('SELECT COUNT(*)::int AS count FROM groups')).count;
}

// For comparing names: "Sakura Heights" and "SAKURAHEIGHTS" count as the same.
// (NFKC does the same for Japanese full-width typing: "３丁目" and "3丁目".)
function simplified(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

export async function findSimilarGroup(name: string, city: string): Promise<Group | undefined> {
  const groups = await listGroups();
  return groups.find(
    (group) => simplified(group.city) === simplified(city) && simplified(group.name) === simplified(name)
  );
}

// A random join code like 'K7PW-3XQD' that no other group has.
async function newJoinCode(): Promise<string> {
  let code: string;
  do {
    let chars = '';
    while (chars.length < 8) chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  } while (await findGroupByCode(code));
  return code;
}

// Creates a group with a new join code, and returns that code.
export async function createGroup(name: string, type: GroupType, city: string): Promise<string> {
  const code = await newJoinCode();
  await query('INSERT INTO groups (code, name, type, city) VALUES ($1, $2, $3, $4)', [code, name, type, city]);
  return code;
}
