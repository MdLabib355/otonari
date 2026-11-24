// What the client may see about people.

import type { DemoUser, Login, Me, User } from '../../../shared/types.ts';
import type { UserRow } from '../../types.ts';
import { getGroup } from '../group/groupModel.ts';
import type { DemoUserRow } from './userModel.ts';

// Everything except the token.
function publicUser({ id, group_id, nickname, lang, elder_mode }: UserRow): User {
  return { id, group_id, nickname, lang, elder_mode };
}

// "Me" as the client sees it: { user, group }.
export async function meView(user: UserRow): Promise<Me> {
  return { user: publicUser(user), group: await getGroup(user.group_id) };
}

// After joining and after the demo login: the only answers with a token.
export async function loginView(user: UserRow): Promise<Login> {
  return { token: user.token, ...(await meView(user)) };
}

export function demoUserView(user: DemoUserRow): DemoUser {
  return { ...publicUser(user), group_name: user.group_name, group_code: user.group_code };
}
