// Super Admin HTTP controllers: overview, operations, groups, catalog, Break-Glass disputes, audit logs.

import type { Request } from 'express';
import type { AuditCategory, SuperAdminOverview } from '../../../shared/types.ts';
import {
  CATEGORY_ICON_KEYS,
  GROUP_LIFECYCLE_STATUSES,
  GROUP_TYPES,
  JOIN_POLICIES,
  isActiveCategoryKey,
  isOneOf,
} from '../../core/allowedKeys.ts';
import { listAuditLogs, writeAuditLog } from '../../core/audit.ts';
import { tokenOf } from '../../core/auth.ts';
import { refuse, reply, toId, toText } from '../../core/http.ts';
import { DEMO_MODE } from '../../core/settings.ts';
import {
  createGroupReturning,
  findSimilarGroup,
  rotateGroupCode,
  updateGroupLifecycle,
} from '../group/groupModel.ts';
import { checkReminders, getReminderHealth } from '../loan/reminders.ts';
import { issueBreakGlassToken, verifyBreakGlassToken } from './breakGlass.ts';
import { cleanupOrphanUploads, getStorageHealth } from './storageMaintenance.ts';
import {
  dispatchEscalationNotice,
  findCatalogItem,
  findCategory,
  findDisputeById,
  findGroupById,
  getDisputeEvidence,
  getPlatformCounters,
  insertCatalogItem,
  insertCategory,
  listCatalogItems,
  listCategories,
  listEscalatedDisputes,
  listGroupsForSuperAdmin,
  rescuePrimaryAdmin,
  resolveDisputeRecord,
  updateCatalogItemRecord,
  updateCategoryRecord,
} from './superAdminModel.ts';
import { groupDirectoryView, overviewView } from './superAdminView.ts';

const AUDIT_CATEGORIES: AuditCategory[] = [
  'Group',
  'Member',
  'Shelf',
  'Loan',
  'Notice',
  'Catalog',
  'Break-Glass',
  'System',
];

const CATEGORY_KEY_PATTERN = /^[a-z0-9_]{2,32}$/;
const MAX_LABEL = 60;
const ITEM_KEY_PATTERN = /^[a-z0-9_]{2,40}$/;

function superAdminLabel(req: Request): string {
  const label = req.user!.nickname || req.user!.email;
  return `Super Admin · ${label}`;
}

// Public active catalog endpoint for resident app sync.
export async function showPublicCatalog() {
  return reply(200, await listCatalogItems(true));
}

// Public, like the catalog.
export async function showPublicCategories() {
  return reply(200, await listCategories(true));
}

export async function showOverview() {
  const [counters, storage, recentAudits] = await Promise.all([
    getPlatformCounters(),
    getStorageHealth(),
    listAuditLogs({ limit: 10 }),
  ]);

  const overview: SuperAdminOverview = overviewView(
    counters,
    DEMO_MODE,
    getReminderHealth(),
    storage,
    recentAudits
  );
  return reply(200, overview);
}

export async function runRemindersNow(req: Request) {
  const result = await checkReminders();
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    category: 'System',
    action: 'system.reminder_manual_run',
    targetType: 'reminders',
    targetId: `${result.checkedLoans}_loans`,
    detail: `Manual overdue & due-soon reminder sweep executed (${result.checkedLoans} loans checked).`,
    ipAddress: req.ip ?? null,
  });
  return reply(200, { ...result, reminder_health: getReminderHealth() });
}

export async function runCleanupUploads(req: Request) {
  const dryRun = req.body?.dry_run !== false;
  const result = await cleanupOrphanUploads(dryRun);

  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    category: 'System',
    action: dryRun ? 'storage.cleanup_dry_run' : 'storage.cleanup_executed',
    targetType: 'uploads',
    targetId: result.mode === 's3' ? 's3' : 'server/uploads',
    detail:
      result.mode === 's3'
        ? 'Storage is managed in AWS S3; automatic local cleanup skipped.'
        : dryRun
          ? `Dry-run storage scan found ${result.orphan_files.length} orphan file(s).`
          : `Deleted ${result.deleted_count} orphan file(s), reclaiming ${result.reclaimed_bytes} bytes.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, result);
}

export async function listGroups(req: Request) {
  const q = toText(req.query.q).toLowerCase();
  let groups = await listGroupsForSuperAdmin();
  if (q) {
    groups = groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q) ||
        g.city.toLowerCase().includes(q) ||
        (g.admin_nickname ?? '').toLowerCase().includes(q) ||
        g.type.toLowerCase().includes(q)
    );
  }
  return reply(200, groupDirectoryView(groups));
}

export async function provisionGroup(req: Request) {
  const { type, create_anyway, join_policy = 'open' }: Record<string, unknown> = req.body ?? {};
  const name = toText(req.body?.name);
  const city = toText(req.body?.city);

  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return refuse(400, 'Group name must be 1-60 characters and city 1-40 characters');
  }
  if (!isOneOf(GROUP_TYPES, type)) return refuse(400, "type must be 'building' or 'block'");
  if (!isOneOf(JOIN_POLICIES, join_policy)) return refuse(400, 'Invalid join_policy');

  const similar = await findSimilarGroup(name, city);
  if (similar && create_anyway !== true) {
    return reply(409, {
      error: 'A similar group already exists in this city',
      existing_name: similar.name,
      existing_code: similar.code,
    });
  }

  const created = await createGroupReturning(name, type, city, join_policy);
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: created.id,
    category: 'Group',
    action: 'group.created',
    targetType: 'group',
    targetId: created.id,
    detail: `Provisioned ${type} "${created.name}" in ${created.city} with code ${created.code}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(201, created);
}

export async function rotateAnyGroupCode(req: Request) {
  const group = await findGroupById(toId(req.params.groupId));
  if (!group) return refuse(404, 'Group not found');

  const updated = await rotateGroupCode(group.id);
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: group.id,
    category: 'Group',
    action: 'group.code_rotated',
    targetType: 'group',
    targetId: group.id,
    detail: `Rotated join code for "${group.name}": ${group.code} -> ${updated.code}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}

export async function rescueGroupAdmin(req: Request) {
  const group = await findGroupById(toId(req.params.groupId));
  if (!group) return refuse(404, 'Group not found');

  const userId = toId(req.body?.user_id);
  const reason = toText(req.body?.reason);
  if (!userId) return refuse(400, 'user_id is required');
  if (reason.length < 3 || reason.length > 200) {
    return refuse(400, 'A verification reason (3-200 characters) is required for Admin Rescue');
  }

  const result = await rescuePrimaryAdmin(group.id, userId);
  if (!result) return refuse(404, 'Active member not found in this group');

  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: group.id,
    category: 'Group',
    action: 'group.admin_rescue',
    targetType: 'user',
    targetId: userId,
    reason,
    detail: `Reassigned Group Admin for "${group.name}": ${result.previousAdmin ?? 'NONE'} -> ${result.newAdmin} (${reason}).`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, result);
}

export async function updateGroupStatus(req: Request) {
  const group = await findGroupById(toId(req.params.groupId));
  if (!group) return refuse(404, 'Group not found');

  const status: unknown = req.body?.lifecycle_status;
  const reason = toText(req.body?.reason) || null;
  if (!isOneOf(GROUP_LIFECYCLE_STATUSES, status)) {
    return refuse(400, `lifecycle_status must be one of: ${GROUP_LIFECYCLE_STATUSES.join(', ')}`);
  }

  const updated = await updateGroupLifecycle(group.id, status, reason);
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: group.id,
    category: 'Group',
    action: `group.status_${status}`,
    targetType: 'group',
    targetId: group.id,
    reason,
    detail: `Transitioned "${group.name}" lifecycle status from ${group.lifecycle_status} to ${status}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}

export async function listCatalog() {
  return reply(200, await listCatalogItems(false));
}

export async function createCatalogEntry(req: Request) {
  const itemKey = toText(req.body?.item_key).toLowerCase();
  const emoji = toText(req.body?.emoji);
  const category = toText(req.body?.category);
  const labelEn = toText(req.body?.label_en);
  const labelJa = toText(req.body?.label_ja);
  const labelJaEasy = toText(req.body?.label_ja_easy);
  const labelBn = toText(req.body?.label_bn);

  if (!ITEM_KEY_PATTERN.test(itemKey)) {
    return refuse(400, 'item_key must be snake_case (2-40 lowercase letters, digits, underscores)');
  }
  if (!emoji || emoji.length > 8) return refuse(400, 'emoji is required');
  if (!(await isActiveCategoryKey(category))) return refuse(400, 'category must be an active category');
  if (!labelEn || !labelJa || !labelJaEasy || !labelBn) {
    return refuse(400, 'All 4 language translations (en, ja, ja-easy, bn) are required');
  }

  if (await findCatalogItem(itemKey)) {
    return refuse(409, `Catalog key "${itemKey}" already exists`);
  }

  const created = await insertCatalogItem({
    item_key: itemKey,
    emoji,
    category,
    is_active: true,
    label_en: labelEn,
    label_ja: labelJa,
    label_ja_easy: labelJaEasy,
    label_bn: labelBn,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    category: 'Catalog',
    action: 'catalog.item_added',
    targetType: 'catalog',
    targetId: itemKey,
    detail: `Added ${emoji} ${itemKey} (${category}) with verified 4-locale translations.`,
    ipAddress: req.ip ?? null,
  });

  return reply(201, created);
}

export async function updateCatalogEntry(req: Request) {
  const itemKey = toText(req.params.key).toLowerCase();
  const existing = await findCatalogItem(itemKey);
  if (!existing) return refuse(404, 'Catalog item not found');

  const isActive = req.body?.is_active;
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return refuse(400, 'is_active must be true or false');
  }

  const nextEn = req.body?.label_en !== undefined ? toText(req.body.label_en) : existing.label_en;
  const nextJa = req.body?.label_ja !== undefined ? toText(req.body.label_ja) : existing.label_ja;
  const nextJaEasy =
    req.body?.label_ja_easy !== undefined ? toText(req.body.label_ja_easy) : existing.label_ja_easy;
  const nextBn = req.body?.label_bn !== undefined ? toText(req.body.label_bn) : existing.label_bn;
  const nextCategory = req.body?.category !== undefined ? toText(req.body.category) : existing.category;
  const nextEmoji = req.body?.emoji !== undefined ? toText(req.body.emoji) : existing.emoji;

  // An unchanged category may be disabled by now: the item must still be editable.
  if (nextCategory !== existing.category && !(await isActiveCategoryKey(nextCategory))) {
    return refuse(400, 'category must be an active category');
  }
  if (!nextEn || !nextJa || !nextJaEasy || !nextBn || !nextEmoji) {
    return refuse(400, 'Emoji and all 4 language translations must remain non-empty');
  }

  const updated = await updateCatalogItemRecord(itemKey, {
    emoji: nextEmoji,
    category: nextCategory,
    is_active: isActive ?? existing.is_active,
    label_en: nextEn,
    label_ja: nextJa,
    label_ja_easy: nextJaEasy,
    label_bn: nextBn,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    category: 'Catalog',
    action: isActive !== undefined ? 'catalog.status_changed' : 'catalog.updated',
    targetType: 'catalog',
    targetId: itemKey,
    detail: `Updated catalog item "${itemKey}" (active=${updated.is_active}).`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, updated);
}

export async function showCategories() {
  return reply(200, await listCategories());
}

// The labels in all four languages, or null if one is missing, empty or too long.
function categoryLabels(body: Record<string, unknown>) {
  const labels = {
    label_en: toText(body.label_en),
    label_ja: toText(body.label_ja),
    label_ja_easy: toText(body.label_ja_easy),
    label_bn: toText(body.label_bn),
  };
  return Object.values(labels).every((label) => label.length >= 1 && label.length <= MAX_LABEL) ? labels : null;
}

export async function createCategory(req: Request) {
  const body: Record<string, unknown> = req.body ?? {};
  const categoryKey = toText(body.category_key).toLowerCase();
  const iconKey: unknown = body.icon_key ?? 'default';
  const labels = categoryLabels(body);

  if (!CATEGORY_KEY_PATTERN.test(categoryKey) || categoryKey === 'all') {
    return refuse(400, 'category_key must be snake_case (2-32 lowercase letters, digits, underscores)');
  }
  if (!isOneOf(CATEGORY_ICON_KEYS, iconKey)) return refuse(400, 'Unknown icon_key');
  if (!labels) return refuse(400, 'All 4 language labels (en, ja, ja-easy, bn) are required, 60 characters at most');
  if (await findCategory(categoryKey)) return refuse(409, `Category "${categoryKey}" already exists`);

  const created = await insertCategory({ category_key: categoryKey, icon_key: iconKey, is_active: true, ...labels });
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    category: 'Catalog',
    action: 'catalog.category_added',
    targetType: 'category',
    targetId: categoryKey,
    detail: `Added category "${categoryKey}" (${labels.label_en}) in 4 languages.`,
    ipAddress: req.ip ?? null,
  });
  return reply(201, created);
}

export async function updateCategory(req: Request) {
  const existing = await findCategory(toText(req.params.key).toLowerCase());
  if (!existing) return refuse(404, 'Category not found');

  const body: Record<string, unknown> = req.body ?? {};
  const isActive: unknown = body.is_active ?? existing.is_active;
  const iconKey: unknown = body.icon_key ?? existing.icon_key;
  const labels = categoryLabels({ ...existing, ...body });
  if (typeof isActive !== 'boolean') return refuse(400, 'is_active must be true or false');
  if (!isOneOf(CATEGORY_ICON_KEYS, iconKey)) return refuse(400, 'Unknown icon_key');
  if (!labels) return refuse(400, 'All 4 language labels (en, ja, ja-easy, bn) are required, 60 characters at most');

  const updated = await updateCategoryRecord({
    category_key: existing.category_key,
    icon_key: iconKey,
    is_active: isActive,
    ...labels,
  });
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    category: 'Catalog',
    action: isActive !== existing.is_active ? 'catalog.category_status_changed' : 'catalog.category_updated',
    targetType: 'category',
    targetId: existing.category_key,
    detail: `Updated category "${existing.category_key}" (active=${updated.is_active}).`,
    ipAddress: req.ip ?? null,
  });
  return reply(200, updated);
}

export async function listDisputes() {
  return reply(200, await listEscalatedDisputes());
}

export async function unlockDisputeBreakGlass(req: Request) {
  const dispute = await findDisputeById(toId(req.params.disputeId));
  if (!dispute) return refuse(404, 'Escalated dispute not found');

  const reason = toText(req.body?.reason);
  if (reason.length < 3 || reason.length > 200) {
    return refuse(400, 'A mandatory audit reason (3-200 characters) is required for Break-Glass access');
  }

  const sessionToken = tokenOf(req);
  if (!sessionToken) return refuse(401, 'Session token required');

  const issued = issueBreakGlassToken(sessionToken, dispute.id, dispute.loan_id);
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: dispute.group_id,
    category: 'Break-Glass',
    action: 'break_glass.unlocked',
    targetType: 'loan',
    targetId: dispute.loan_id,
    reason,
    detail: `Unlocked 15-min Break-Glass evidence session for Dispute #${dispute.id} (Loan #${dispute.loan_id}) — Reason: ${reason}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, {
    break_glass_token: issued.token,
    expires_at: issued.expiresAt,
    ttl_seconds: issued.ttlSeconds,
    reason,
  });
}

export async function showDisputeEvidence(req: Request) {
  const dispute = await findDisputeById(toId(req.params.disputeId));
  if (!dispute) return refuse(404, 'Escalated dispute not found');

  const sessionToken = tokenOf(req);
  const bgToken = toText(req.get('X-Break-Glass-Token'));
  if (!sessionToken || !bgToken || !verifyBreakGlassToken(bgToken, sessionToken, dispute.id, dispute.loan_id)) {
    return refuse(403, 'Valid Break-Glass inspection token required to view dispute evidence');
  }

  return reply(200, await getDisputeEvidence(dispute.id, dispute.loan_id));
}

export async function sendDisputeNotice(req: Request) {
  const dispute = await findDisputeById(toId(req.params.disputeId));
  if (!dispute) return refuse(404, 'Escalated dispute not found');
  if (dispute.escalation_notice_sent) {
    return refuse(409, 'Platform escalation notice was already dispatched for this dispute');
  }

  await dispatchEscalationNotice(dispute.id, dispute.loan_id);
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: dispute.group_id,
    category: 'Break-Glass',
    action: 'dispute.notice_sent',
    targetType: 'loan',
    targetId: dispute.loan_id,
    detail: `Dispatched structured platform escalation notice on Loan #${dispute.loan_id} (${dispute.group_name}).`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, await findDisputeById(dispute.id));
}

export async function resolveDispute(req: Request) {
  const dispute = await findDisputeById(toId(req.params.disputeId));
  if (!dispute) return refuse(404, 'Escalated dispute not found');
  if (dispute.status === 'resolved') return refuse(409, 'Dispute is already resolved');

  const note = toText(req.body?.resolution_note) || 'Resolved by Super Admin after evidence review';
  await resolveDisputeRecord(dispute.id, note);
  await writeAuditLog({
    actorId: req.user!.id,
    actorLabel: superAdminLabel(req),
    actorRole: 'super_admin',
    scopeGroupId: dispute.group_id,
    category: 'Break-Glass',
    action: 'dispute.resolved',
    targetType: 'loan',
    targetId: dispute.loan_id,
    reason: note,
    detail: `Marked Dispute #${dispute.id} (Loan #${dispute.loan_id}) resolved: ${note}.`,
    ipAddress: req.ip ?? null,
  });

  return reply(200, await findDisputeById(dispute.id));
}

export async function showAuditLogs(req: Request) {
  const rawCategory = toText(req.query.category);
  const category = rawCategory && isOneOf(AUDIT_CATEGORIES, rawCategory) ? rawCategory : undefined;
  const limitRaw = Number(req.query.limit ?? 150);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 150;
  return reply(200, await listAuditLogs({ category, limit }));
}
