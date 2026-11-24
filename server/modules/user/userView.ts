// What the client may see about people.

import type { DemoUser, Login, Me, User } from '../../../shared/types.ts';
import { getGroup } from '../group/groupModel.ts';
import type { DemoUserRow } from './userModel.ts';
import type { UserRow } from '../../types.ts';

// Everything except the token.
function publicUser(user: UserRow): User {
  return {
    id: user.id,
    group_id: user.group_id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: user.elder_mode === 1,
  };
}

// "Me" as the client sees it: { user, group }.
export function meView(user: UserRow): Me {
  return { user: publicUser(user), group: getGroup(user.group_id) };
}

// After joining and after the demo login: the only answers with a token.
export function loginView(user: UserRow): Login {
  return { token: user.token, ...meView(user) };
}

export function demoUserView(user: DemoUserRow): DemoUser {
  return { ...publicUser(user), group_name: user.group_name, group_code: user.group_code };
}
