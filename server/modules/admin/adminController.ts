// For super admins: all groups and all accounts.

import type { Request } from 'express';
import type { Role } from '../../../shared/types.ts';
import { isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toId } from '../../core/http.ts';
import { deleteSessionsOf } from '../auth/sessionModel.ts';
import { listGroupsWithCounts } from '../group/groupModel.ts';
import { findUser, listUsers, setActive, setRole } from '../user/userModel.ts';
import { adminUserView } from '../user/userView.ts';

const ROLES: Role[] = ['super_admin', 'group_admin', 'user'];

export async function showGroups() {
  return reply(200, await listGroupsWithCounts());
}

export async function showUsers() {
  return reply(200, (await listUsers()).map(adminUserView));
}

// Both fields are optional: send only what changed.
export async function updateUser(req: Request) {
  const { role, active }: Record<string, unknown> = req.body ?? {};
  if (role !== undefined && !isOneOf(ROLES, role)) return refuse(400, 'Unknown role');
  if (active !== undefined && typeof active !== 'boolean') return refuse(400, 'active must be true or false');

  const user = await findUser(toId(req.params.id));
  if (!user) return refuse(404, 'User not found');
  // So there is always at least one super admin left.
  if (user.id === req.user.id) return refuse(403, 'You cannot change your own account here');
  if (user.is_demo) return refuse(403, 'Demo accounts cannot be changed');
  if (role === 'group_admin' && user.group_id === null) return refuse(409, 'This person is not in a group');

  if (role !== undefined) await setRole(user.id, role);
  if (active !== undefined) await setActive(user.id, active);
  if (active === false) await deleteSessionsOf(user.id);
  return reply(204);
}
