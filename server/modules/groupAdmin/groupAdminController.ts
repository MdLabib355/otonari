// Group Admin HTTP handlers — strictly scoped to req.groupId.

import type { Request } from 'express';
import { ANNOUNCEMENT_KEYS, GROUP_ROLES, JOIN_POLICIES, isOneOf } from '../../core/allowedKeys.ts';
import { listAuditLogs, writeAuditLog } from '../../core/audit.ts';
import { transaction } from '../../core/database.ts';
import { refuse, reply, toId, toText } from '../../core/http.ts';
import { deletePhoto } from '../../core/photoFiles.ts';
import { getGroup, rotateGroupCode, setGroupImage, updateGroupJoinPolicy } from '../group/groupModel.ts';
import { setTrustedOnly } from '../item/itemModel.ts';
import { declinePendingLoans } from '../loan/loanModel.ts';
import {
  approvePendingMember,
  countOwnedAvailableItemsByUser,
  extractMemberActiveLoans,
  findGroupItem,
  findGroupMember,
  getDashboardStats,
  listActiveLoansForGroup,
  listGroupItemsForAdmin,
  listGroupMembersRaw,
  pinGroupAnnouncement,
  rejectPendingMember,
  setItemHidden,
  unpinGroupAnnouncement,
  updateMemberTrustOverride,
} from './groupAdminModel.ts';
import { dashboardView, memberSummaryView } from './groupAdminView.ts';
import { findGroupLoan, listGroupLoansForAdmin, resolveGroupLoan, sendGentleCheckIn } from './loanMediation.ts';
import { changeMemberRoleGuarded, changeMemberStatusGuarded, safeRemoveMemberGuarded } from './memberControl.ts';

function actorRoleOf(req: Request): 'super_admin' | 'group_admin' | 'co_admin' {
  if (req.user.role === 'super_admin') return 'super_admin';
  return req.user.role === 'group_admin' ? 'group_admin' : 'co_admin';
}

function actorLabelOf(req: Request): string {
  const prefix =
    req.user.role === 'super_admin' ? 'SuperAdmin' : req.user.role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin';
  return `${prefix} · ${req.user.nickname || req.user.email}`;
}

export async function showDashboard(req: Request) {
  const [group, stats] = await Promise.all([getGroup(req.groupId), getDashboardStats(req.groupId)]);
  return reply(200, dashboardView(group, stats));
}

export async function listMembers(req: Request) {
  const [users, groupLoans, availableCounts] = await Promise.all([
    listGroupMembersRaw(req.groupId),
    listActiveLoansForGroup(req.groupId),
    countOwnedAvailableItemsByUser(req.groupId),
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
  if (statusFilter) summaries = summaries.filter((m) => m.member_status === statusFilter);

  const filter = toText(req.query.filter);
  if (filter === 'admins') {
    summaries = summaries.filter((m) => m.role !== 'user');
  } else if (filter === 'trusted') {
    summaries = summaries.filter((m) => m.is_trusted);
  } else if (filter === 'muted') {
    summaries = summaries.filter((m) => m.member_status === 'borrow_muted' || m.member_status === 'suspended');
  } else if (filter === 'inLoan') {
    summaries = summaries.filter((m) => m.active_loans.length > 0);
  }

  const q = toText(req.query.q).toLowerCase();
  if (q) {
    summaries = summaries.filter((m) => m.nickname.toLowerCase().includes(q) || m.lang.toLowerCase().includes(q));
  }

  return reply(200, summaries);
}

export async function approveMember(req: Request) {
  const target = await findGroupMember(req.groupId, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');
  if (target.member_status !== 'pending') return refuse(409, 'Member is not awaiting approval');

  const grantTrust = req.body?.grant_trust === true;
  const updated = await approvePendingMember(req.groupId, target.id, grantTrust);

  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.groupId,
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
  const target = await findGroupMember(req.groupId, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');
  if (target.member_status !== 'pending') return refuse(409, 'Member is not awaiting approval');

  await rejectPendingMember(req.groupId, target.id);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.groupId,
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

  const target = await findGroupMember(req.groupId, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');
  if (target.member_status === 'pending') return refuse(409, 'Approve the neighbor before endorsing trust');

  const updated = await updateMemberTrustOverride(req.groupId, target.id, trusted);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.groupId,
    category: 'Member',
    action: trusted ? 'trust.granted' : 'trust.revoked',
    targetType: 'user',
    targetId: target.id,
    detail: `${trusted ? 'Endorsed' : 'Revoked'} Trusted Neighbor status for ${target.nickname}.`,
    ipAddress: req.ip ?? null,
  });

  const [groupLoans, availableCounts] = await Promise.all([
    listActiveLoansForGroup(req.groupId),
    countOwnedAvailableItemsByUser(req.groupId),
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

  const target = await findGroupMember(req.groupId, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');

  const result = await changeMemberStatusGuarded(req.user, req.groupId, target, status, mutedUntil, req.ip ?? null);
  if (result.error) return result.error;

  const [groupLoans, availableCounts] = await Promise.all([
    listActiveLoansForGroup(req.groupId),
    countOwnedAvailableItemsByUser(req.groupId),
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
  if (!isOneOf(GROUP_ROLES, role)) return refuse(400, "role must be 'user', 'co_admin', or 'group_admin'");

  const target = await findGroupMember(req.groupId, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');

  const result = await changeMemberRoleGuarded(req.user, req.groupId, target, role, req.ip ?? null);
  if (result.error) return result.error;

  const [groupLoans, availableCounts] = await Promise.all([
    listActiveLoansForGroup(req.groupId),
    countOwnedAvailableItemsByUser(req.groupId),
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
  const target = await findGroupMember(req.groupId, toId(req.params.userId));
  if (!target) return refuse(404, 'Member not found');

  const error = await safeRemoveMemberGuarded(req.user, req.groupId, target, req.ip ?? null);
  if (error) return error;
  return reply(204);
}

export async function updateSettings(req: Request) {
  const joinPolicy: unknown = req.body?.join_policy;
  if (!isOneOf(JOIN_POLICIES, joinPolicy)) {
    return refuse(400, "join_policy must be 'open', 'approval_required', or 'locked'");
  }

  const updated = await updateGroupJoinPolicy(req.groupId, joinPolicy);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.groupId,
    category: 'Group',
    action: 'group.join_policy_changed',
    targetType: 'group',
    targetId: req.groupId,
    detail: `Updated join policy for ${updated.name} to '${joinPolicy}'.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}

// The group's icon. (A new one has been stored by storePhoto.) Not write() routes: deleting the old file can be
// slow, so it is done after the transaction.
export async function changeImage(req: Request) {
  return saveImage(req, req.photo);
}

export async function removeImage(req: Request) {
  return saveImage(req, null);
}

async function saveImage(req: Request, image: string | null) {
  const old = await transaction(async () => {
    const previous = await setGroupImage(req.groupId, image);
    await writeAuditLog({
      actorId: req.user.id,
      actorLabel: actorLabelOf(req),
      actorRole: actorRoleOf(req),
      scopeGroupId: req.groupId,
      category: 'Group',
      action: image ? 'group.image_changed' : 'group.image_removed',
      targetType: 'group',
      targetId: req.groupId,
      detail: image ? 'Changed the group image.' : 'Removed the group image.',
      ipAddress: req.ip ?? null,
    });
    return previous;
  });
  await deletePhoto(old);
  return reply(200, await getGroup(req.groupId));
}

export async function rotateInviteCode(req: Request) {
  const before = await getGroup(req.groupId);
  const updated = await rotateGroupCode(req.groupId);

  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.groupId,
    category: 'Group',
    action: 'code.rotated',
    targetType: 'group',
    targetId: req.groupId,
    detail: `Rotated building join code ${before.code} -> ${updated.code} (old lobby poster invalidated).`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}

export async function listItems(req: Request) {
  return reply(200, await listGroupItemsForAdmin(req.groupId));
}

export async function moderateItem(req: Request) {
  const { trusted_only, hidden }: Record<string, unknown> = req.body ?? {};
  if (trusted_only === undefined && hidden === undefined) {
    return refuse(400, 'Provide trusted_only or hidden to update');
  }
  if (trusted_only !== undefined && typeof trusted_only !== 'boolean') {
    return refuse(400, 'trusted_only must be true or false');
  }
  if (hidden !== undefined && typeof hidden !== 'boolean') {
    return refuse(400, 'hidden must be true or false');
  }

  const item = await findGroupItem(req.groupId, toId(req.params.itemId));
  if (!item) return refuse(404, 'Item not found');

  if (hidden === true && item.status !== 'available') {
    return refuse(409, 'Cannot hide an item while it is reserved or lent');
  }

  if (trusted_only !== undefined) {
    await setTrustedOnly(item.id, trusted_only);
    await writeAuditLog({
      actorId: req.user.id,
      actorLabel: actorLabelOf(req),
      actorRole: actorRoleOf(req),
      scopeGroupId: req.groupId,
      category: 'Shelf',
      action: 'item.trusted_only_changed',
      targetType: 'item',
      targetId: item.id,
      detail: `Set "${item.item_key}" Trusted-Only to ${trusted_only ? 'ON' : 'OFF'}.`,
      ipAddress: req.ip ?? null,
    });
  }

  if (hidden !== undefined) {
    await setItemHidden(item.id, hidden);
    if (hidden) await declinePendingLoans(item.id);
    await writeAuditLog({
      actorId: req.user.id,
      actorLabel: actorLabelOf(req),
      actorRole: actorRoleOf(req),
      scopeGroupId: req.groupId,
      category: 'Shelf',
      action: hidden ? 'item.hidden' : 'item.restored',
      targetType: 'item',
      targetId: item.id,
      detail: `${hidden ? 'Hidden' : 'Restored'} shelf item "${item.item_key}".`,
      ipAddress: req.ip ?? null,
    });
  }

  const updated = (await listGroupItemsForAdmin(req.groupId)).find((row) => row.id === item.id);
  return reply(200, updated);
}

export async function listLoans(req: Request) {
  return reply(200, await listGroupLoansForAdmin(req.groupId));
}

export async function nudgeLoan(req: Request) {
  const loan = await findGroupLoan(req.groupId, toId(req.params.loanId));
  if (!loan) return refuse(404, 'Loan not found');

  const error = await sendGentleCheckIn(req.user, req.groupId, loan, req.body?.phrase_key, req.ip ?? null);
  if (error) return error;

  const updated = (await listGroupLoansForAdmin(req.groupId)).find((row) => row.id === loan.id);
  return reply(200, updated);
}

export async function resolveLoan(req: Request) {
  const loan = await findGroupLoan(req.groupId, toId(req.params.loanId));
  if (!loan) return refuse(404, 'Loan not found');

  const error = await resolveGroupLoan(
    req.user,
    req.groupId,
    loan,
    req.body?.resolution,
    req.body?.reason_key,
    req.ip ?? null
  );
  if (error) return error;

  const updated = (await listGroupLoansForAdmin(req.groupId)).find((row) => row.id === loan.id);
  return reply(200, updated);
}

export async function publishAnnouncement(req: Request) {
  const phraseKey: unknown = req.body?.phrase_key;
  if (!isOneOf(ANNOUNCEMENT_KEYS, phraseKey)) {
    return refuse(400, `phrase_key must be one of: ${ANNOUNCEMENT_KEYS.join(', ')}`);
  }

  const announcement = await pinGroupAnnouncement(req.groupId, req.user.id, phraseKey);
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: actorLabelOf(req),
    actorRole: actorRoleOf(req),
    scopeGroupId: req.groupId,
    category: 'Notice',
    action: 'announcement.pinned',
    targetType: 'group',
    targetId: req.groupId,
    reason: phraseKey,
    detail: `Pinned structured building announcement "${phraseKey}" to the Live Shelf Banner.`,
    ipAddress: req.ip ?? null,
  });

  return reply(201, announcement);
}

export async function clearAnnouncement(req: Request) {
  const previousKey = await unpinGroupAnnouncement(req.groupId);
  if (previousKey) {
    await writeAuditLog({
      actorId: req.user.id,
      actorLabel: actorLabelOf(req),
      actorRole: actorRoleOf(req),
      scopeGroupId: req.groupId,
      category: 'Notice',
      action: 'announcement.unpinned',
      targetType: 'group',
      targetId: req.groupId,
      reason: previousKey,
      detail: `Unpinned building announcement "${previousKey}" from the Live Shelf Banner.`,
      ipAddress: req.ip ?? null,
    });
  }
  return reply(204);
}

export async function showActivityLog(req: Request) {
  return reply(200, await listAuditLogs({ scopeGroupId: req.groupId, limit: 100 }));
}
