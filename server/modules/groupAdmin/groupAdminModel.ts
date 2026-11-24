// Group Admin SQL operations — strictly scoped to req.groupId on every single query.

import type {
  ActiveLoanBadge,
  GroupAdminItem,
  GroupAnnouncement,
  GroupRole,
  LoanStatus,
  MemberStatus,
} from '../../../shared/types.ts';
import { found, query, queryOne, transaction } from '../../core/database.ts';
import type { CountRow, ItemRow, UserRow } from '../../types.ts';
import { clearGroup } from '../user/userModel.ts';

export async function findGroupMember(groupId: number, userId: number): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND group_id = $2 AND deactivated_at IS NULL',
    [userId, groupId]
  );
}

export async function listGroupMembersRaw(groupId: number): Promise<UserRow[]> {
  return query<UserRow>(
    `SELECT * FROM users
     WHERE group_id = $1 AND deactivated_at IS NULL
     ORDER BY
       CASE member_status WHEN 'pending' THEN 0 ELSE 1 END,
       CASE role WHEN 'super_admin' THEN 0 WHEN 'group_admin' THEN 1 ELSE 2 END,
       id ASC`,
    [groupId]
  );
}

export async function listActiveLoansForGroup(groupId: number): Promise<
  {
    id: number;
    borrower_id: number;
    lender_id: number;
    status: LoanStatus;
    end_at: string;
    return_photo: string | null;
  }[]
> {
  return query(
    `SELECT loans.id, loans.borrower_id, loans.lender_id, loans.status, loans.end_at, loans.return_photo
     FROM loans
     JOIN items ON items.id = loans.item_id
     WHERE items.group_id = $1 AND loans.status IN ('accepted', 'active')
     ORDER BY loans.id DESC`,
    [groupId]
  );
}

export async function countOwnedAvailableItemsByUser(groupId: number): Promise<Map<number, number>> {
  const rows = await query<{ owner_id: number; count: number }>(
    `SELECT owner_id, COUNT(*)::int AS count
     FROM items
     WHERE group_id = $1 AND removed_at IS NULL AND hidden_at IS NULL AND status = 'available'
     GROUP BY owner_id`,
    [groupId]
  );
  return new Map(rows.map((row) => [row.owner_id, row.count]));
}

export function extractMemberActiveLoans(
  userId: number,
  groupLoans: { id: number; borrower_id: number; lender_id: number; status: LoanStatus; end_at: string; return_photo: string | null }[]
): ActiveLoanBadge[] {
  const now = Date.now();
  return groupLoans
    .filter((loan) => loan.borrower_id === userId || loan.lender_id === userId)
    .map((loan) => ({
      loan_id: loan.id,
      role: loan.lender_id === userId ? 'lender' : 'borrower',
      status: loan.status,
      is_overdue: loan.status === 'active' && !loan.return_photo && Date.parse(loan.end_at) < now,
    }));
}

export async function getActiveAnnouncement(groupId: number): Promise<GroupAnnouncement | null> {
  const row = await queryOne<GroupAnnouncement>(
    `SELECT id, group_id, phrase_key, is_active, created_at
     FROM group_announcements
     WHERE group_id = $1 AND is_active
     ORDER BY id DESC
     LIMIT 1`,
    [groupId]
  );
  return row ?? null;
}

export async function getDashboardStats(groupId: number) {
  const [pending, activeMembers, overdue, flagged, announcement] = await Promise.all([
    queryOne<CountRow>(
      "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND deactivated_at IS NULL AND member_status = 'pending'",
      [groupId]
    ),
    queryOne<CountRow>(
      "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND deactivated_at IS NULL AND member_status IN ('active','borrow_muted')",
      [groupId]
    ),
    queryOne<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM loans JOIN items ON items.id = loans.item_id
       WHERE items.group_id = $1 AND loans.status = 'active' AND loans.return_photo IS NULL AND loans.end_at < now()`,
      [groupId]
    ),
    queryOne<CountRow>(
      "SELECT COUNT(*)::int AS count FROM loan_disputes WHERE group_id = $1 AND status = 'open'",
      [groupId]
    ),
    getActiveAnnouncement(groupId),
  ]);

  return {
    pending_count: found(pending).count,
    active_member_count: found(activeMembers).count,
    overdue_loan_count: found(overdue).count,
    flagged_loan_count: found(flagged).count,
    active_announcement: announcement,
  };
}

export async function approvePendingMember(groupId: number, userId: number, grantTrust: boolean): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `UPDATE users
     SET member_status = 'active',
         trust_override = CASE WHEN $3 THEN 'granted' ELSE trust_override END
     WHERE id = $1 AND group_id = $2 AND deactivated_at IS NULL AND member_status = 'pending'
     RETURNING *`,
    [userId, groupId, grantTrust]
  );
  return found(row);
}

// Rejecting a pending join clears group_id while keeping their account intact so they can join another building.
export async function rejectPendingMember(groupId: number, userId: number) {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM users WHERE id = $1 AND group_id = $2 AND member_status = 'pending'",
    [userId, groupId]
  );
  if (existing) await clearGroup(userId);
}

export async function updateMemberTrustOverride(
  groupId: number,
  userId: number,
  trusted: boolean
): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `UPDATE users
     SET trust_override = $3
     WHERE id = $1 AND group_id = $2 AND deactivated_at IS NULL
     RETURNING *`,
    [userId, groupId, trusted ? 'granted' : 'revoked']
  );
  return found(row);
}

export async function updateMemberStatus(
  groupId: number,
  userId: number,
  status: Exclude<MemberStatus, 'pending'>,
  mutedUntil: string | null
): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `UPDATE users
     SET member_status = $3,
         muted_until = $4
     WHERE id = $1 AND group_id = $2 AND deactivated_at IS NULL
     RETURNING *`,
    [userId, groupId, status, status === 'borrow_muted' ? mutedUntil : null]
  );
  return found(row);
}

export async function updateMemberRole(groupId: number, userId: number, role: GroupRole): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `UPDATE users
     SET role = $3
     WHERE id = $1 AND group_id = $2 AND deactivated_at IS NULL
     RETURNING *`,
    [userId, groupId, role]
  );
  return found(row);
}

export async function listGroupItemsForAdmin(groupId: number): Promise<GroupAdminItem[]> {
  return query<GroupAdminItem>(
    `SELECT items.id, items.item_key, items.max_days, items.spot, items.trusted_only, items.status,
            items.owner_id, users.nickname AS owner_nickname, items.hidden_at
     FROM items
     JOIN users ON users.id = items.owner_id
     WHERE items.group_id = $1 AND items.removed_at IS NULL
     ORDER BY items.id ASC`,
    [groupId]
  );
}

export async function findGroupItem(groupId: number, itemId: number): Promise<ItemRow | undefined> {
  return queryOne<ItemRow>(
    'SELECT * FROM items WHERE id = $1 AND group_id = $2 AND removed_at IS NULL',
    [itemId, groupId]
  );
}

export async function setItemHidden(itemId: number, hidden: boolean) {
  await query('UPDATE items SET hidden_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1', [itemId, hidden]);
}

export async function pinGroupAnnouncement(
  groupId: number,
  authorId: number,
  phraseKey: string
): Promise<GroupAnnouncement> {
  return transaction(async () => {
    await query('UPDATE group_announcements SET is_active = false WHERE group_id = $1 AND is_active', [groupId]);
    const row = await queryOne<GroupAnnouncement>(
      `INSERT INTO group_announcements (group_id, author_id, phrase_key, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, group_id, phrase_key, is_active, created_at`,
      [groupId, authorId, phraseKey]
    );
    return found(row);
  });
}

export async function unpinGroupAnnouncement(groupId: number): Promise<string | null> {
  const row = await queryOne<{ phrase_key: string }>(
    'UPDATE group_announcements SET is_active = false WHERE group_id = $1 AND is_active RETURNING phrase_key',
    [groupId]
  );
  return row?.phrase_key ?? null;
}
