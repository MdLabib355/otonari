// Safe neighbor-control operations enforcing self-protection, hierarchy, active-loan, and last-admin guardrails.

import type { GroupRole, MemberStatus } from '../../../shared/types.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { refuse, type Answer } from '../../core/http.ts';
import type { UserRow } from '../../types.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { leaveGroup } from '../user/leaveGroup.ts';
import { countActiveGroupAdmins } from '../user/userModel.ts';
import {
  transferPrimaryAdmin,
  updateMemberRole,
  updateMemberStatus,
} from './groupAdminModel.ts';

function adminActorRole(admin: UserRow): 'group_admin' | 'co_admin' {
  return admin.group_role === 'group_admin' ? 'group_admin' : 'co_admin';
}

export async function changeMemberStatusGuarded(
  admin: UserRow,
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
  if (admin.group_role === 'co_admin' && target.group_role === 'group_admin') {
    return { error: refuse(403, 'Co-Admins cannot restrict the Primary Group Admin') };
  }
  if (
    nextStatus === 'suspended' &&
    target.group_role === 'group_admin' &&
    (await countActiveGroupAdmins(admin.group_id)) <= 1
  ) {
    return { error: refuse(409, 'Cannot suspend the last active Group Admin') };
  }

  const updated = await updateMemberStatus(admin.group_id, target.id, nextStatus, mutedUntil);
  await writeAuditLog({
    actorId: admin.id,
    actorLabel: `${admin.group_role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin'} · ${admin.nickname}`,
    actorRole: adminActorRole(admin),
    scopeGroupId: admin.group_id,
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
  target: UserRow,
  nextRole: GroupRole,
  ipAddress: string | null
): Promise<{ error?: Answer; updated?: UserRow }> {
  if (target.member_status !== 'active') {
    return { error: refuse(409, 'Only active neighbors can hold an admin role') };
  }
  if (target.id === admin.id && nextRole !== 'group_admin') {
    if ((await countActiveGroupAdmins(admin.group_id)) <= 1) {
      return { error: refuse(409, 'Last-Admin Guardrail: promote another Group Admin before stepping down') };
    }
  }

  let updated: UserRow;
  let action = 'member.role_changed';
  let detail = `Changed ${target.nickname} role from ${target.group_role} to ${nextRole}.`;

  if (nextRole === 'group_admin' && target.id !== admin.id) {
    updated = await transferPrimaryAdmin(admin.group_id, admin.id, target.id);
    action = 'member.primary_transferred';
    detail = `Transferred primary Group Admin ownership from ${admin.nickname} to ${target.nickname}.`;
  } else {
    updated = await updateMemberRole(admin.group_id, target.id, nextRole);
  }

  await writeAuditLog({
    actorId: admin.id,
    actorLabel: `GroupAdmin · ${admin.nickname}`,
    actorRole: 'group_admin',
    scopeGroupId: admin.group_id,
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
  target: UserRow,
  ipAddress: string | null
): Promise<Answer | null> {
  if (target.id === admin.id) {
    return refuse(400, 'Use Settings to leave the neighborhood yourself');
  }
  if (admin.group_role === 'co_admin' && target.group_role === 'group_admin') {
    return refuse(403, 'Co-Admins cannot remove the Primary Group Admin');
  }

  // Guardrail 1: Active/accepted loan check (mirrors leaveGroup.ts)
  if (await hasUnfinishedLoan(target.id)) {
    return refuse(409, 'Cannot remove neighbor while an accepted or active loan is still open');
  }

  // Guardrail 2: Last-Admin protection
  if (target.group_role === 'group_admin' && (await countActiveGroupAdmins(admin.group_id)) <= 1) {
    return refuse(409, 'Cannot remove the last active Group Admin');
  }

  await leaveGroup(target.id);
  await writeAuditLog({
    actorId: admin.id,
    actorLabel: `${admin.group_role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin'} · ${admin.nickname}`,
    actorRole: adminActorRole(admin),
    scopeGroupId: admin.group_id,
    category: 'Member',
    action: 'member.safe_removed',
    targetType: 'user',
    targetId: target.id,
    detail: `Safely removed ${target.nickname} (soft-deleted available items, cancelled pending requests, revoked session token).`,
    ipAddress,
  });

  return null;
}
