// Super admin user/group management endpoints from main (/api/v1/admin/*), with audit logging.

import type { Request } from 'express';
import { ALL_ROLES, isOneOf } from '../../core/allowedKeys.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { refuse, reply, toId } from '../../core/http.ts';
import { deleteSessionsOf } from '../auth/sessionModel.ts';
import { listGroupsWithCounts } from '../group/groupModel.ts';
import { findUser, listUsers, setActive, setRole } from '../user/userModel.ts';
import { adminUserView } from '../user/userView.ts';

export async function showGroups() {
  return reply(200, await listGroupsWithCounts());
}

export async function showUsers() {
  return reply(200, (await listUsers()).map(adminUserView));
}

export async function updateUser(req: Request) {
  const { role, active }: Record<string, unknown> = req.body ?? {};
  if (role !== undefined && !isOneOf(ALL_ROLES, role)) return refuse(400, 'Unknown role');
  if (active !== undefined && typeof active !== 'boolean') return refuse(400, 'active must be true or false');

  const user = await findUser(toId(req.params.id));
  if (!user) return refuse(404, 'User not found');
  if (user.id === req.user.id) return refuse(403, 'You cannot change your own account here');
  if (user.is_demo) return refuse(403, 'Demo accounts cannot be changed');
  if (role === 'group_admin' && user.group_id === null) {
    return refuse(409, 'This person is not in a group');
  }

  if (role !== undefined) await setRole(user.id, role);
  if (active !== undefined) await setActive(user.id, active);
  if (active === false) await deleteSessionsOf(user.id);

  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: `Super Admin · ${req.user.nickname || req.user.email}`,
    actorRole: 'super_admin',
    scopeGroupId: user.group_id,
    category: 'Member',
    action: 'account.updated',
    targetType: 'user',
    targetId: user.id,
    detail: `Updated account ${user.email} (${role !== undefined ? `role=${role}` : ''}${role !== undefined && active !== undefined ? ', ' : ''}${active !== undefined ? `active=${active}` : ''}).`,
    ipAddress: req.ip ?? null,
  });

  return reply(204);
}
