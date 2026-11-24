// Safe neighbor-control operations enforcing self-protection, hierarchy, active-loan, and last-admin guardrails.

import type { GroupRole, MemberStatus } from '../../../shared/types.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { refuse, type Answer } from '../../core/http.ts';
import type { UserRow } from '../../types.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { leaveGroup } from '../user/leaveGroup.ts';
import { countActiveGroupAdmins } from '../user/userModel.ts';
import { transferPrimaryAdmin, updateMemberRole, updateMemberStatus } from './groupAdminModel.ts';

function adminActorRole(admin: UserRow): 'super_admin' | 'group_admin' | 'co_admin' {
  if (admin.role === 'super_admin') return 'super_admin';
  return admin.role === 'group_admin' ? 'group_admin' : 'co_admin';
}

function adminLabel(admin: UserRow): string {
  const prefix = admin.role === 'super_admin' ? 'SuperAdmin' : admin.role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin';
  return `${prefix} · ${admin.nickname || admin.email}`;
}

export async function changeMemberStatusGuarded(
  admin: UserRow,
  groupId: number,
  target: UserRow,
  nextStatus: Exclude<MemberStatus, 'pending'>,
  mutedUntil: string | null,
  ipAddress: string | null
): Promise<{ error?: Answer; updated?: UserRow }> {
  if (target.id === admin.id) {
    return { error: refuse(400, 'You cannot mute or suspend yourself') };
  }
  if (target.member_status === 'pending') {
    return { error: refuse(409, 'Approve or decline the pending request first') };
  }
  if (admin.role === 'co_admin' && (target.role === 'group_admin' || target.role === 'super_admin')) {
    return { error: refuse(403, 'Co-Admins cannot restrict the Primary Group Admin') };
  }
  if (
    nextStatus === 'suspended' &&
    target.role === 'group_admin' &&
    (await countActiveGroupAdmins(groupId)) <= 1
  ) {
    return { error: refuse(409, 'Cannot suspend the last active Group Admin') };
  }

  const updated = await updateMemberStatus(groupId, target.id, nextStatus, mutedUntil);
  await writeAuditLog({
    actorId: admin.id,
    actorLabel: adminLabel(admin),
    actorRole: adminActorRole(admin),
    scopeGroupId: groupId,
    category: 'Member',
    action: `member.status_${nextStatus}`,
    targetType: 'user',
    targetId: target.id,
    detail: `Changed ${target.nickname} status from ${target.member_status} to ${nextStatus}${mutedUntil ? ` (until ${mutedUntil})` : ''}.`,
    ipAddress,
  });

  return { updated };
}

export async function changeMemberRoleGuarded(
  admin: UserRow,
  groupId: number,
  target: UserRow,
  nextRole: GroupRole,
  ipAddress: string | null
): Promise<{ error?: Answer; updated?: UserRow }> {
  if (target.role === 'super_admin') {
    return { error: refuse(403, 'Platform Super Admin role cannot be modified here') };
  }
  if (target.member_status !== 'active') {
    return { error: refuse(409, 'Only active neighbors can hold an admin role') };
  }
  if (target.id === admin.id && nextRole !== 'group_admin') {
    if ((await countActiveGroupAdmins(groupId)) <= 1) {
      return { error: refuse(409, 'Last-Admin Guardrail: promote another Group Admin before stepping down') };
    }
  }

  let updated: UserRow;
  let action = 'member.role_changed';
  let detail = `Changed ${target.nickname} role from ${target.role} to ${nextRole}.`;

  if (nextRole === 'group_admin' && target.id !== admin.id && admin.role === 'group_admin') {
    updated = await transferPrimaryAdmin(groupId, admin.id, target.id);
    action = 'member.primary_transferred';
    detail = `Transferred primary Group Admin ownership from ${admin.nickname} to ${target.nickname}.`;
  } else {
    updated = await updateMemberRole(groupId, target.id, nextRole);
  }

  await writeAuditLog({
    actorId: admin.id,
    actorLabel: adminLabel(admin),
    actorRole: adminActorRole(admin),
    scopeGroupId: groupId,
    category: 'Member',
    action,
    targetType: 'user',
    targetId: target.id,
    detail,
    ipAddress,
  });

  return { updated };
}

export async function safeRemoveMemberGuarded(
  admin: UserRow,
  groupId: number,
  target: UserRow,
  ipAddress: string | null
): Promise<Answer | null> {
  if (target.id === admin.id) {
    return refuse(400, 'Use Settings to leave the neighborhood yourself');
  }
  if (target.role === 'super_admin') {
    return refuse(403, 'Platform Super Admin cannot be removed here');
  }
  if (admin.role === 'co_admin' && target.role === 'group_admin') {
    return refuse(403, 'Co-Admins cannot remove the Primary Group Admin');
  }
  if (await hasUnfinishedLoan(target.id)) {
    return refuse(409, 'Cannot remove neighbor while an accepted or active loan is still open');
  }
  if (target.role === 'group_admin' && (await countActiveGroupAdmins(groupId)) <= 1) {
    return refuse(409, 'Cannot remove the last active Group Admin');
  }

  await leaveGroup(target.id, groupId);
  await writeAuditLog({
    actorId: admin.id,
    actorLabel: adminLabel(admin),
    actorRole: adminActorRole(admin),
    scopeGroupId: groupId,
    category: 'Member',
    action: 'member.safe_removed',
    targetType: 'user',
    targetId: target.id,
    detail: `Safely removed ${target.nickname} from group (soft-deleted available items & cancelled pending requests).`,
    ipAddress,
  });

  return null;
}
