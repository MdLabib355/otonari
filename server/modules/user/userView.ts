// What the client may see about people. Emails: only my own, and all of them for a super admin.

import type { AdminUser, GroupMember, Me, User } from '../../../shared/types.ts';
import type { UserRow } from '../../types.ts';
import { getGroup } from '../group/groupModel.ts';
import { isTrusted, resolveEffectiveMemberStatus } from './userModel.ts';

// "Me" as the client sees it: { user, group }. The group is null before joining one.
export async function meView(user: UserRow): Promise<Me> {
  const [memberStatus, trusted] = await Promise.all([
    resolveEffectiveMemberStatus(user),
    isTrusted(user.id),
  ]);
  const me: User = {
    id: user.id,
    group_id: user.group_id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: user.elder_mode,
    email: user.email,
    role: user.role,
    member_status: memberStatus,
    muted_until: memberStatus === 'borrow_muted' ? user.muted_until : null,
    is_trusted: trusted,
    trust_override: user.trust_override,
  };
  return { user: me, group: user.group_id === null ? null : await getGroup(user.group_id) };
}

export function memberView({ id, nickname, lang, role, joined_at }: UserRow): GroupMember {
  return { id, nickname, lang, role, joined_at };
}

export function adminUserView(user: UserRow & { group_name: string | null }): AdminUser {
  const { id, email, nickname, role, group_name, created_at } = user;
  return { id, email, nickname, role, group_name, created_at, active: user.deactivated_at === null };
}
