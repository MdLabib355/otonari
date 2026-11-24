// The groups table: neighborhoods, join codes, join policy, and lifecycle status.

import crypto from 'node:crypto';
import type { AdminGroup, Group, GroupLifecycleStatus, GroupType, JoinPolicy } from '../../../shared/types.ts';
import { found, query, queryOne } from '../../core/database.ts';
import { toText } from '../../core/http.ts';
import type { CountRow, GroupRow } from '../../types.ts';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const GROUP_SELECT = `
  SELECT groups.id, groups.code, groups.name, groups.type, groups.city,
         groups.join_policy, groups.lifecycle_status, groups.invite_code_version,
         (SELECT ga.phrase_key
          FROM group_announcements AS ga
          WHERE ga.group_id = groups.id AND ga.is_active
          ORDER BY ga.id DESC
          LIMIT 1) AS active_announcement_key
  FROM groups
`;

export async function findGroupByCode(code: unknown): Promise<Group | undefined> {
  return queryOne<Group>(`${GROUP_SELECT} WHERE groups.code = $1`, [toText(code).toUpperCase()]);
}

export async function getGroup(groupId: number): Promise<Group> {
  return found(await queryOne<Group>(`${GROUP_SELECT} WHERE groups.id = $1`, [groupId]));
}

export async function getGroupRow(groupId: number): Promise<GroupRow> {
  return found(await queryOne<GroupRow>('SELECT * FROM groups WHERE id = $1', [groupId]));
}

export async function listGroups(): Promise<Group[]> {
  return query<Group>(`${GROUP_SELECT} ORDER BY groups.id`);
}

export async function listGroupsWithCounts(): Promise<AdminGroup[]> {
  return query<AdminGroup>(
    `SELECT groups.id, groups.code, groups.name, groups.type, groups.city,
            groups.join_policy, groups.lifecycle_status, groups.invite_code_version,
            (SELECT ga.phrase_key
             FROM group_announcements AS ga
             WHERE ga.group_id = groups.id AND ga.is_active
             ORDER BY ga.id DESC
             LIMIT 1) AS active_announcement_key,
            COUNT(users.id)::int AS member_count
     FROM groups LEFT JOIN users ON users.group_id = groups.id
     GROUP BY groups.id ORDER BY groups.id`
  );
}

export async function changeJoinCode(groupId: number) {
  await rotateGroupCode(groupId);
}

export async function countGroups(): Promise<number> {
  return found(await queryOne<CountRow>('SELECT COUNT(*)::int AS count FROM groups')).count;
}

function simplified(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

export async function findSimilarGroup(name: string, city: string): Promise<Group | undefined> {
  const groups = await listGroups();
  return groups.find(
    (group) => simplified(group.city) === simplified(city) && simplified(group.name) === simplified(name)
  );
}

export async function newJoinCode(): Promise<string> {
  let code: string;
  do {
    let chars = '';
    while (chars.length < 8) chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  } while (await findGroupByCode(code));
  return code;
}

export async function createGroup(name: string, type: GroupType, city: string): Promise<string> {
  const code = await newJoinCode();
  await query('INSERT INTO groups (code, name, type, city) VALUES ($1, $2, $3, $4)', [code, name, type, city]);
  return code;
}

export async function createGroupReturning(
  name: string,
  type: GroupType,
  city: string,
  joinPolicy: JoinPolicy = 'open'
): Promise<Group> {
  const code = await newJoinCode();
  const row = await queryOne<{ id: number }>(
    'INSERT INTO groups (code, name, type, city, join_policy) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [code, name, type, city, joinPolicy]
  );
  return getGroup(found(row).id);
}

export async function rotateGroupCode(groupId: number): Promise<Group> {
  const code = await newJoinCode();
  await query(
    'UPDATE groups SET code = $1, invite_code_version = invite_code_version + 1 WHERE id = $2',
    [code, groupId]
  );
  return getGroup(groupId);
}

export async function updateGroupJoinPolicy(groupId: number, joinPolicy: JoinPolicy): Promise<Group> {
  await query('UPDATE groups SET join_policy = $1 WHERE id = $2', [joinPolicy, groupId]);
  return getGroup(groupId);
}

export async function updateGroupLifecycle(
  groupId: number,
  status: GroupLifecycleStatus,
  reason: string | null = null
): Promise<Group> {
  const suspendedAt = status === 'suspended' ? new Date().toISOString() : null;
  await query(
    'UPDATE groups SET lifecycle_status = $1, suspended_at = $2, suspension_reason = $3 WHERE id = $4',
    [status, suspendedAt, status === 'suspended' ? reason : null, groupId]
  );
  return getGroup(groupId);
}
