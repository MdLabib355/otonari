// The users table: accounts, roles, group membership, and borrower reliability.

import type { Lang, MemberStatus, Person, Role, Trust } from '../../../shared/types.ts';
import { found, query, queryOne } from '../../core/database.ts';
import type { CountRow, UserRow } from '../../types.ts';

export async function getUser(userId: number): Promise<UserRow> {
  return found(await findUser(userId));
}

export async function findUser(userId: number): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
}

export async function findUserByGoogle(sub: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM users WHERE google_sub = $1', [sub]);
}

export async function getPerson(userId: number): Promise<Person> {
  return found(await queryOne<Person>('SELECT id, nickname, lang, avatar FROM users WHERE id = $1', [userId]));
}

interface NewUser {
  email: string;
  lang: Lang;
  password_hash?: string;
  email_verified?: boolean;
  google_sub?: string;
  nickname?: string;
}

export async function createUser(user: NewUser): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `INSERT INTO users (email, lang, password_hash, email_verified, google_sub, google_only, nickname)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      user.email,
      user.lang,
      user.password_hash ?? null,
      user.email_verified ?? false,
      user.google_sub ?? null,
      user.google_sub !== undefined,
      user.nickname ?? '',
    ]
  );
  return found(row);
}

export async function confirmEmail(userId: number) {
  await query('UPDATE users SET email_verified = true, password_hash = NULL, google_sub = NULL WHERE id = $1', [userId]);
}

export async function setGoogle(userId: number, sub: string, only: boolean) {
  await query('UPDATE users SET google_sub = $1, google_only = $2 WHERE id = $3', [sub, only, userId]);
}

export async function setPassword(userId: number, passwordHash: string) {
  await query(
    'UPDATE users SET password_hash = $1, email_verified = true, google_only = false, deactivated_at = NULL WHERE id = $2',
    [passwordHash, userId]
  );
}

// Chosen by the person themselves.
export async function changePassword(userId: number, passwordHash: string) {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function setNickname(userId: number, nickname: string) {
  await query('UPDATE users SET nickname = $1 WHERE id = $2', [nickname, userId]);
}

export async function setAvatar(userId: number, avatar: string | null) {
  await query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, userId]);
}

export async function setRole(userId: number, role: Role) {
  await query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
}

export async function setActive(userId: number, active: boolean) {
  await query('UPDATE users SET deactivated_at = CASE WHEN $1 THEN NULL ELSE now() END WHERE id = $2', [
    active,
    userId,
  ]);
}

export async function listUsers(): Promise<(UserRow & { group_name: string | null })[]> {
  return query<UserRow & { group_name: string | null }>(
    `SELECT users.*, groups.name AS group_name
     FROM users LEFT JOIN groups ON groups.id = users.group_id ORDER BY users.id`
  );
}

export async function listMembers(groupId: number): Promise<UserRow[]> {
  return query<UserRow>(
    "SELECT * FROM users WHERE group_id = $1 AND deactivated_at IS NULL AND member_status <> 'pending' ORDER BY joined_at, id",
    [groupId]
  );
}

export async function countMembers(groupId: number): Promise<number> {
  return found(
    await queryOne<CountRow>(
      "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND deactivated_at IS NULL AND member_status <> 'pending'",
      [groupId]
    )
  ).count;
}

export async function countActiveGroupAdmins(groupId: number): Promise<number> {
  return found(
    await queryOne<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE group_id = $1
         AND deactivated_at IS NULL
         AND member_status = 'active'
         AND role = 'group_admin'`,
      [groupId]
    )
  ).count;
}

export async function joinGroup(
  userId: number,
  groupId: number,
  nickname: string,
  lang: Lang,
  memberStatus: MemberStatus = 'active'
) {
  await query(
    `UPDATE users
     SET group_id = $1, nickname = $2, lang = $3, joined_at = now(),
         member_status = $4, muted_until = NULL, trust_override = NULL
     WHERE id = $5`,
    [groupId, nickname, lang, memberStatus, userId]
  );
}

// The account stays. Whoever managed the group doesn't anymore; a super admin stays one.
export async function clearGroup(userId: number) {
  await query(
    `UPDATE users SET group_id = NULL, joined_at = NULL,
       member_status = 'active', muted_until = NULL, trust_override = NULL,
       role = CASE WHEN role IN ('group_admin','co_admin') THEN 'user' ELSE role END
     WHERE id = $1`,
    [userId]
  );
}

export async function setLang(userId: number, lang: Lang) {
  await query('UPDATE users SET lang = $1 WHERE id = $2', [lang, userId]);
}

export async function setElderMode(userId: number, on: boolean) {
  await query('UPDATE users SET elder_mode = $1 WHERE id = $2', [on, userId]);
}

export async function resolveEffectiveMemberStatus(user: UserRow): Promise<MemberStatus> {
  if (user.member_status === 'borrow_muted' && user.muted_until && Date.parse(user.muted_until) <= Date.now()) {
    await query("UPDATE users SET member_status = 'active', muted_until = NULL WHERE id = $1", [user.id]);
    return 'active';
  }
  return user.member_status;
}

export async function trustOf(userId: number): Promise<Trust> {
  const trust = await queryOne<Trust>(
    `SELECT COALESCE(EXTRACT(DAY FROM now() - users.joined_at), 0)::int AS joined_days,
            COUNT(*) FILTER (WHERE loans.returned_at <= loans.end_at)::int AS on_time,
            COUNT(*) FILTER (WHERE loans.returned_at > loans.end_at)::int AS late
     FROM users LEFT JOIN loans ON loans.borrower_id = users.id AND loans.status = 'returned'
     WHERE users.id = $1
     GROUP BY users.id`,
    [userId]
  );
  return found(trust);
}

export async function isTrusted(userId: number): Promise<boolean> {
  const user = await getUser(userId);
  if (user.trust_override === 'granted') return true;
  if (user.trust_override === 'revoked') return false;
  return (await trustOf(userId)).on_time > 0;
}
