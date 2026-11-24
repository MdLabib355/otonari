// Super Admin SQL queries: platform overview, group lifecycle & rescue, global catalog, and disputes.

import type {
  BreakGlassEvidence,
  BreakGlassEvidenceMessage,
  CatalogCategoryRecord,
  CatalogItemRecord,
  DisputeSummary,
  LoanStatus,
  MemberStatus,
  Role,
  SuperAdminGroupMemberPreview,
  SuperAdminGroupSummary,
} from '../../../shared/types.ts';
import { found, query, queryOne, transaction } from '../../core/database.ts';
import type { CountRow, GroupRow, LoanRow } from '../../types.ts';
import { photoUrl } from '../../core/photoFiles.ts';
import { createMessage } from '../message/messageModel.ts';

export async function getPlatformCounters() {
  const started = Date.now();
  await query('SELECT 1');
  const dbLatencyMs = Math.max(1, Date.now() - started);

  const [activeGroups, totalGroups, totalNeighbors, activeLoans, completedLoans, openDisputes, orphanedGroups] =
    await Promise.all([
      queryOne<CountRow>("SELECT COUNT(*)::int AS count FROM groups WHERE lifecycle_status = 'active'"),
      queryOne<CountRow>('SELECT COUNT(*)::int AS count FROM groups'),
      queryOne<CountRow>(
        "SELECT COUNT(*)::int AS count FROM users WHERE group_id IS NOT NULL AND deactivated_at IS NULL AND member_status IN ('active','borrow_muted')"
      ),
      queryOne<CountRow>("SELECT COUNT(*)::int AS count FROM loans WHERE status IN ('accepted','active')"),
      queryOne<CountRow>("SELECT COUNT(*)::int AS count FROM loans WHERE status = 'returned'"),
      queryOne<CountRow>(
        "SELECT COUNT(*)::int AS count FROM loan_disputes WHERE status = 'open' AND escalated_to_super_admin"
      ),
      query<{ id: number; name: string; code: string; member_count: number }>(
        `SELECT g.id, g.name, g.code,
                (SELECT COUNT(*)::int FROM users u WHERE u.group_id = g.id AND u.deactivated_at IS NULL AND u.member_status <> 'pending') AS member_count
         FROM groups g
         WHERE g.lifecycle_status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM users u
             WHERE u.group_id = g.id
               AND u.deactivated_at IS NULL
               AND u.member_status = 'active'
               AND u.role = 'group_admin'
           )
         ORDER BY g.id`
      ),
    ]);

  return {
    active_groups: found(activeGroups).count,
    total_groups: found(totalGroups).count,
    total_neighbors: found(totalNeighbors).count,
    active_loans: found(activeLoans).count,
    completed_loans: found(completedLoans).count,
    open_disputes: found(openDisputes).count,
    orphaned_groups: orphanedGroups,
    db_latency_ms: dbLatencyMs,
  };
}

export async function listGroupsForSuperAdmin(): Promise<SuperAdminGroupSummary[]> {
  const groups = await query<GroupRow & { overdue_count: number }>(
    `SELECT g.*,
            (SELECT COUNT(*)::int
             FROM loans l JOIN items i ON i.id = l.item_id
             WHERE i.group_id = g.id AND l.status = 'active' AND l.return_photo IS NULL AND l.end_at < now()) AS overdue_count
     FROM groups g
     ORDER BY g.id ASC`
  );

  const memberRows = await query<
    SuperAdminGroupMemberPreview & { group_id: number; role: Role; member_status: MemberStatus }
  >(
    `SELECT u.id, u.group_id, u.nickname, u.role, u.member_status,
            COUNT(l.id) FILTER (WHERE l.status = 'returned' AND l.returned_at <= l.end_at)::int AS on_time_returns
     FROM users u
     LEFT JOIN loans l ON l.borrower_id = u.id
     WHERE u.group_id IS NOT NULL AND u.deactivated_at IS NULL AND u.member_status <> 'pending'
     GROUP BY u.id
     ORDER BY
       CASE u.role WHEN 'group_admin' THEN 0 ELSE 1 END,
       u.id ASC`
  );

  const byGroup = new Map<number, SuperAdminGroupMemberPreview[]>();
  for (const row of memberRows) {
    const list = byGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      nickname: row.nickname,
      role: row.role,
      member_status: row.member_status,
      on_time_returns: row.on_time_returns,
    });
    byGroup.set(row.group_id, list);
  }

  return groups.map((g) => {
    const members = byGroup.get(g.id) ?? [];
    const primary = members.find((m) => m.role === 'group_admin');
    return {
      id: g.id,
      name: g.name,
      code: g.code,
      type: g.type,
      city: g.city,
      join_policy: g.join_policy,
      lifecycle_status: g.lifecycle_status,
      admin_nickname: primary?.nickname ?? null,
      member_count: members.length,
      overdue_count: g.overdue_count,
      members,
    };
  });
}

export async function findGroupById(groupId: number): Promise<GroupRow | undefined> {
  return queryOne<GroupRow>('SELECT * FROM groups WHERE id = $1', [groupId]);
}

export async function rescuePrimaryAdmin(
  groupId: number,
  userId: number
): Promise<{ previousAdmin: string | null; newAdmin: string } | null> {
  const target = await queryOne<{ id: number; nickname: string; member_status: MemberStatus; role: Role }>(
    'SELECT id, nickname, member_status, role FROM users WHERE id = $1 AND group_id = $2 AND deactivated_at IS NULL',
    [userId, groupId]
  );
  if (!target || target.member_status !== 'active' || target.role === 'super_admin') return null;

  return transaction(async () => {
    const previous = await queryOne<{ id: number; nickname: string }>(
      "SELECT id, nickname FROM users WHERE group_id = $1 AND deactivated_at IS NULL AND role = 'group_admin' ORDER BY (id = $2) DESC, id LIMIT 1",
      [groupId, target.id]
    );
    if (previous && previous.id !== target.id) {
      await query("UPDATE users SET role = 'user' WHERE id = $1", [previous.id]);
    }
    await query("UPDATE users SET role = 'group_admin' WHERE id = $1", [target.id]);
    return { previousAdmin: previous?.nickname ?? null, newAdmin: target.nickname };
  });
}

export async function listCatalogItems(activeOnly = false): Promise<CatalogItemRecord[]> {
  const where = activeOnly ? 'WHERE is_active' : '';
  return query<CatalogItemRecord>(
    `SELECT item_key, emoji, category, is_active, label_en, label_ja, label_ja_easy, label_bn, updated_at
     FROM catalog_items
     ${where}
     ORDER BY category ASC, item_key ASC`
  );
}

export async function findCatalogItem(itemKey: string): Promise<CatalogItemRecord | undefined> {
  return queryOne<CatalogItemRecord>('SELECT * FROM catalog_items WHERE item_key = $1', [itemKey]);
}

export async function insertCatalogItem(item: Omit<CatalogItemRecord, 'updated_at'>): Promise<CatalogItemRecord> {
  const row = await queryOne<CatalogItemRecord>(
    `INSERT INTO catalog_items (
       item_key, emoji, category, is_active, label_en, label_ja, label_ja_easy, label_bn
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      item.item_key,
      item.emoji,
      item.category,
      item.is_active,
      item.label_en,
      item.label_ja,
      item.label_ja_easy,
      item.label_bn,
    ]
  );
  return found(row);
}

export async function updateCatalogItemRecord(
  itemKey: string,
  changes: Partial<Omit<CatalogItemRecord, 'item_key' | 'updated_at'>>
): Promise<CatalogItemRecord> {
  const current = found(await findCatalogItem(itemKey));
  const row = await queryOne<CatalogItemRecord>(
    `UPDATE catalog_items
     SET emoji = $2,
         category = $3,
         is_active = $4,
         label_en = $5,
         label_ja = $6,
         label_ja_easy = $7,
         label_bn = $8,
         updated_at = now()
     WHERE item_key = $1
     RETURNING *`,
    [
      itemKey,
      changes.emoji ?? current.emoji,
      changes.category ?? current.category,
      changes.is_active ?? current.is_active,
      changes.label_en ?? current.label_en,
      changes.label_ja ?? current.label_ja,
      changes.label_ja_easy ?? current.label_ja_easy,
      changes.label_bn ?? current.label_bn,
    ]
  );
  return found(row);
}

export async function listCategories(activeOnly = false): Promise<CatalogCategoryRecord[]> {
  return query<CatalogCategoryRecord>(
    `SELECT * FROM catalog_categories ${activeOnly ? 'WHERE is_active' : ''} ORDER BY sort_order, category_key`
  );
}

export async function findCategory(categoryKey: string): Promise<CatalogCategoryRecord | undefined> {
  return queryOne<CatalogCategoryRecord>('SELECT * FROM catalog_categories WHERE category_key = $1', [categoryKey]);
}

type CategoryValues = Omit<CatalogCategoryRecord, 'sort_order' | 'updated_at'>;

// New categories come after the existing ones.
export async function insertCategory(category: CategoryValues): Promise<CatalogCategoryRecord> {
  const row = await queryOne<CatalogCategoryRecord>(
    `INSERT INTO catalog_categories (
       category_key, icon_key, is_active, sort_order, label_en, label_ja, label_ja_easy, label_bn
     )
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM catalog_categories), $4, $5, $6, $7)
     RETURNING *`,
    [
      category.category_key,
      category.icon_key,
      category.is_active,
      category.label_en,
      category.label_ja,
      category.label_ja_easy,
      category.label_bn,
    ]
  );
  return found(row);
}

export async function updateCategoryRecord(category: CategoryValues): Promise<CatalogCategoryRecord> {
  const row = await queryOne<CatalogCategoryRecord>(
    `UPDATE catalog_categories
     SET icon_key = $2, is_active = $3, label_en = $4, label_ja = $5, label_ja_easy = $6, label_bn = $7,
         updated_at = now()
     WHERE category_key = $1
     RETURNING *`,
    [
      category.category_key,
      category.icon_key,
      category.is_active,
      category.label_en,
      category.label_ja,
      category.label_ja_easy,
      category.label_bn,
    ]
  );
  return found(row);
}

export async function listEscalatedDisputes(): Promise<DisputeSummary[]> {
  return query<DisputeSummary>(
    `SELECT d.id, d.group_id, g.name AS group_name, d.loan_id,
            i.item_key, i.spot,
            b.nickname AS borrower_nickname, b.lang AS borrower_lang,
            lender.nickname AS lender_nickname, lender.lang AS lender_lang,
            d.reason_key, d.status, d.escalation_notice_sent, d.resolution_note,
            d.created_at, d.resolved_at
     FROM loan_disputes d
     JOIN groups g ON g.id = d.group_id
     JOIN loans l ON l.id = d.loan_id
     JOIN items i ON i.id = l.item_id
     JOIN users b ON b.id = l.borrower_id
     JOIN users lender ON lender.id = l.lender_id
     WHERE d.escalated_to_super_admin
     ORDER BY CASE d.status WHEN 'open' THEN 0 ELSE 1 END, d.created_at DESC`
  );
}

export async function findDisputeById(disputeId: number): Promise<DisputeSummary | undefined> {
  return queryOne<DisputeSummary>(
    `SELECT d.id, d.group_id, g.name AS group_name, d.loan_id,
            i.item_key, i.spot,
            b.nickname AS borrower_nickname, b.lang AS borrower_lang,
            lender.nickname AS lender_nickname, lender.lang AS lender_lang,
            d.reason_key, d.status, d.escalation_notice_sent, d.resolution_note,
            d.created_at, d.resolved_at
     FROM loan_disputes d
     JOIN groups g ON g.id = d.group_id
     JOIN loans l ON l.id = d.loan_id
     JOIN items i ON i.id = l.item_id
     JOIN users b ON b.id = l.borrower_id
     JOIN users lender ON lender.id = l.lender_id
     WHERE d.id = $1 AND d.escalated_to_super_admin`,
    [disputeId]
  );
}

export async function getDisputeEvidence(disputeId: number, loanId: number): Promise<BreakGlassEvidence> {
  const loan = found(
    await queryOne<LoanRow & { item_key: string }>(
      `SELECT l.*, i.item_key
       FROM loans l JOIN items i ON i.id = l.item_id
       WHERE l.id = $1`,
      [loanId]
    )
  );

  const [messages, handoverPhoto, returnPhoto] = await Promise.all([
    query<BreakGlassEvidenceMessage>(
      `SELECT DISTINCT ON (m.phrase_key, date_trunc('second', m.created_at), COALESCE(m.from_user_id, 0))
              m.id, sender.nickname AS sender_nickname, sender.lang AS sender_lang,
              m.phrase_key, m.params, m.created_at
       FROM messages m
       LEFT JOIN users sender ON sender.id = m.from_user_id
       WHERE m.loan_id = $1
       ORDER BY m.phrase_key, date_trunc('second', m.created_at), COALESCE(m.from_user_id, 0), m.id ASC`,
      [loanId]
    ),
    photoUrl(loan.handover_photo),
    photoUrl(loan.return_photo),
  ]);
  messages.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);

  return {
    dispute_id: disputeId,
    loan_id: loan.id,
    item_key: loan.item_key,
    handover_photo: handoverPhoto,
    return_photo: returnPhoto,
    loan_status: loan.status as LoanStatus,
    start_at: loan.start_at,
    end_at: loan.end_at,
    returned_at: loan.returned_at,
    messages,
  };
}

export async function dispatchEscalationNotice(disputeId: number, loanId: number) {
  const loan = found(await queryOne<LoanRow>('SELECT * FROM loans WHERE id = $1', [loanId]));
  await transaction(async () => {
    await query('UPDATE loan_disputes SET escalation_notice_sent = true WHERE id = $1', [disputeId]);
    await createMessage(loan, null, loan.borrower_id, 'platform.escalationNotice');
    await createMessage(loan, null, loan.lender_id, 'platform.escalationNotice');
  });
}

export async function resolveDisputeRecord(disputeId: number, resolutionNote: string) {
  await query(
    `UPDATE loan_disputes
     SET status = 'resolved', resolution_note = $2, resolved_at = now()
     WHERE id = $1`,
    [disputeId, resolutionNote]
  );
}
