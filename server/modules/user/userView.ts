// What the client may see about people.

import type { DemoUser, Login, Me, User } from '../../../shared/types.ts';
import type { UserRow } from '../../types.ts';
import { getGroup } from '../group/groupModel.ts';
import { isTrusted, resolveEffectiveMemberStatus, type DemoUserRow } from './userModel.ts';

// Everything except the token.
export async function publicUser(user: UserRow): Promise<User> {
  const memberStatus = await resolveEffectiveMemberStatus(user);
  const trusted = await isTrusted(user.id);
  return {
    id: user.id,
    group_id: user.group_id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: user.elder_mode,
    group_role: user.group_role,
    member_status: memberStatus,
    muted_until: memberStatus === 'borrow_muted' ? user.muted_until : null,
    is_trusted: trusted,
    trust_override: user.trust_override,
  };
}

// "Me" as the client sees it: { user, group }.
export async function meView(user: UserRow): Promise<Me> {
  return { user: await publicUser(user), group: await getGroup(user.group_id) };
}

// After joining and after the demo login: the only answers with a token.
export async function loginView(user: UserRow): Promise<Login> {
  return { token: user.token, ...(await meView(user)) };
}

export async function demoUserView(user: DemoUserRow): Promise<DemoUser> {
  return { ...(await publicUser(user)), group_name: user.group_name, group_code: user.group_code };
}
