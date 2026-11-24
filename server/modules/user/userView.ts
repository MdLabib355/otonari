// What the client may see about people. Emails: only my own, and all of them for a super admin.

import type { AdminUser, GroupMember, Me, User } from '../../../shared/types.ts';
import type { UserRow } from '../../types.ts';
import { getGroup } from '../group/groupModel.ts';

// "Me" as the client sees it: { user, group }. The group is null before joining one.
export async function meView(user: UserRow): Promise<Me> {
  const { id, group_id, nickname, lang, elder_mode, email, role } = user;
  const me: User = { id, group_id, nickname, lang, elder_mode, email, role };
  return { user: me, group: group_id === null ? null : await getGroup(group_id) };
}

export function memberView({ id, nickname, lang, role, joined_at }: UserRow): GroupMember {
  return { id, nickname, lang, role, joined_at };
}

export function adminUserView(user: UserRow & { group_name: string | null }): AdminUser {
  const { id, email, nickname, role, group_name, created_at } = user;
  return { id, email, nickname, role, group_name, created_at, active: user.deactivated_at === null };
}
