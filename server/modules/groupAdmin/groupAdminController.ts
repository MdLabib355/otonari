// Group Admin HTTP handlers for dashboard, neighbor control, join policy, and invite code rotation.

import type { Request } from 'express';
import { GROUP_ROLES, JOIN_POLICIES, isOneOf } from '../../core/allowedKeys.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { refuse, reply, toId, toText } from '../../core/http.ts';
import { getGroup, rotateGroupCode, updateGroupJoinPolicy } from '../group/groupModel.ts';
import {
  approvePendingMember,
  countOwnedAvailableItemsByUser,
  extractMemberActiveLoans,
  findGroupMember,
  getDashboardStats,
  listActiveLoansForGroup,
  listGroupMembersRaw,
  rejectPendingMember,
  updateMemberTrustOverride,
} from './groupAdminModel.ts';
import { dashboardView, memberSummaryView } from './groupAdminView.ts';
import {
  changeMemberRoleGuarded,
  changeMemberStatusGuarded,
  safeRemoveMemberGuarded,
} from './memberControl.ts';

function actorRoleOf(req: Request): 'group_admin' | 'co_admin' {
  return req.user.group_role === 'group_admin' ? 'group_admin' : 'co_admin';
}

function actorLabelOf(req: Request): string {
  return `${req.user.group_role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin'} · ${req.user.nickname}`;
}

export async function showDashboard(req: Request) {
  const [group, stats] = await Promise.all([
    getGroup(req.user.group_id),
    getDashboardStats(req.user.group_id),
  ]);
  return reply(200, dashboardView(group, stats));
}

export async function listMembers(req: Request) {
  const [users, groupLoans, availableCounts] = await Promise.all([
    listGroupMembersRaw(req.user.group_id),
    listActiveLoansForGroup(req.user.group_id),
    countOwnedAvailableItemsByUser(req.user.group_id),
  ]);

  let summaries = await Promise.all(
    users.map((user) =>
      memberSummaryView(
        user,
        extractMemberActiveLoans(user.id, groupLoans),
        availableCounts.get(user.id) ?? 0
      )
    )
  );

  const statusFilter = toText(req.query.status);
  if (statusFilter) {
    summaries = summaries.filter((member) => member.member_status === statusFilter);
  }

  const filter = toText(req.query.filter);
  if (filter === 'admins') {
    summaries = summaries.filter((m) => m.group_role === 'group_admin' || m.group_role === 'co_admin');
  } else if (filter === 'trusted') {
    summaries = summaries.filter((m) => m.is_trusted);
  } else if (filter === 'muted') {
    summaries = summaries.filter((m) => m.member_status === 'borrow_muted' || m.member_status === 'suspended');
  } else if (filter === 'inLoan') {
    summaries = summaries.filter((m) => m.active_loans.length > 0);
  }

  const q = toText(req.query.q).toLowerCase();
  if (q) {
    summaries = summaries.filter(
      (m) => m.nickname.toLowerCase().includes(q) || m.lang.toLowerCase().includes(q)
    );
  }

  return reply(200, summaries);
}

export async function approveMember(req: Request) {
  const target = await findGroupMember(req.user.group_id, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');
  if (target.member_status !== 'pending') return refuse(409, 'Member is not awaiting approval');

  const grantTrust = req.body?.grant_trust === true;
  const updated = await approvePendingMember(req.user.group_id, target.id, grantTrust);

  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.user.group_id,
    category: 'Member',
    action: 'member.approved',
    targetType: 'user',
    targetId: target.id,
    detail: `Approved join request for ${target.nickname} (${target.lang})${grantTrust ? ' with Trusted badge' : ''}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, await memberSummaryView(updated, [], 0));
}

export async function rejectMember(req: Request) {
  const target = await findGroupMember(req.user.group_id, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');
  if (target.member_status !== 'pending') return refuse(409, 'Member is not awaiting approval');

  await rejectPendingMember(req.user.group_id, target.id);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.user.group_id,
    category: 'Member',
    action: 'member.rejected',
    targetType: 'user',
    targetId: target.id,
    detail: `Declined join request from ${target.nickname}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(204);
}

export async function setMemberTrust(req: Request) {
  const trusted: unknown = req.body?.trusted;
  if (typeof trusted !== 'boolean') return refuse(400, 'trusted must be true or false');

  const target = await findGroupMember(req.user.group_id, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');
  if (target.member_status === 'pending') return refuse(409, 'Approve the neighbor before endorsing trust');

  const updated = await updateMemberTrustOverride(req.user.group_id, target.id, trusted);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.user.group_id,
    category: 'Member',
    action: trusted ? 'trust.granted' : 'trust.revoked',
    targetType: 'user',
    targetId: target.id,
    detail: `${trusted ? 'Endorsed' : 'Revoked'} Trusted Neighbor status for ${target.nickname}.`,
    ipAddress: req.ip ?? null,
  });

  const [groupLoans, availableCounts] = await Promise.all([
    listActiveLoansForGroup(req.user.group_id),
    countOwnedAvailableItemsByUser(req.user.group_id),
  ]);
  return reply(
    200,
    await memberSummaryView(
      updated,
      extractMemberActiveLoans(updated.id, groupLoans),
      availableCounts.get(updated.id) ?? 0
    )
  );
}

export async function setMemberStatus(req: Request) {
  const status: unknown = req.body?.status;
  const mutedUntilRaw: unknown = req.body?.muted_until;

  if (!isOneOf(['active', 'borrow_muted', 'suspended'] as const, status)) {
    return refuse(400, "status must be 'active', 'borrow_muted', or 'suspended'");
  }

  let mutedUntil: string | null = null;
  if (status === 'borrow_muted' && mutedUntilRaw !== undefined && mutedUntilRaw !== null) {
    if (typeof mutedUntilRaw !== 'string' || Number.isNaN(Date.parse(mutedUntilRaw))) {
      return refuse(400, 'muted_until must be a valid ISO timestamp');
    }
    mutedUntil = new Date(mutedUntilRaw).toISOString();
  }

  const target = await findGroupMember(req.user.group_id, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');

  const result = await changeMemberStatusGuarded(req.user, target, status, mutedUntil, req.ip ?? null);
  if (result.error) return result.error;

  const [groupLoans, availableCounts] = await Promise.all([
    listActiveLoansForGroup(req.user.group_id),
    countOwnedAvailableItemsByUser(req.user.group_id),
  ]);
  return reply(
    200,
    await memberSummaryView(
      result.updated!,
      extractMemberActiveLoans(target.id, groupLoans),
      availableCounts.get(target.id) ?? 0
    )
  );
}

export async function setMemberRole(req: Request) {
  const role: unknown = req.body?.role;
  if (!isOneOf(GROUP_ROLES, role)) return refuse(400, "role must be 'member', 'co_admin', or 'group_admin'");

  const target = await findGroupMember(req.user.group_id, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');

  const result = await changeMemberRoleGuarded(req.user, target, role, req.ip ?? null);
  if (result.error) return result.error;

  const [groupLoans, availableCounts] = await Promise.all([
    listActiveLoansForGroup(req.user.group_id),
    countOwnedAvailableItemsByUser(req.user.group_id),
  ]);
  return reply(
    200,
    await memberSummaryView(
      result.updated!,
      extractMemberActiveLoans(target.id, groupLoans),
      availableCounts.get(target.id) ?? 0
    )
  );
}

export async function removeMember(req: Request) {
  const target = await findGroupMember(req.user.group_id, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');

  const error = await safeRemoveMemberGuarded(req.user, target, req.ip ?? null);
  if (error) return error;
  return reply(204);
}

export async function updateSettings(req: Request) {
  const joinPolicy: unknown = req.body?.join_policy;
  if (!isOneOf(JOIN_POLICIES, joinPolicy)) {
    return refuse(400, "join_policy must be 'open', 'approval_required', or 'locked'");
  }

  const updated = await updateGroupJoinPolicy(req.user.group_id, joinPolicy);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.user.group_id,
    category: 'Group',
    action: 'group.join_policy_changed',
    targetType: 'group',
    targetId: req.user.group_id,
    detail: `Updated join policy for ${updated.name} to '${joinPolicy}'.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}

export async function rotateInviteCode(req: Request) {
  const before = await getGroup(req.user.group_id);
  const updated = await rotateGroupCode(req.user.group_id);

  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.user.group_id,
    category: 'Group',
    action: 'code.rotated',
    targetType: 'group',
    targetId: req.user.group_id,
    detail: `Rotated building join code ${before.code} -> ${updated.code} (old lobby poster invalidated).`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}
