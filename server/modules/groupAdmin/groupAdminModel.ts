// Group Admin SQL operations — strictly scoped to req.user.group_id on every single query.

import type {
  ActiveLoanBadge,
  GroupAnnouncement,
  GroupRole,
  LoanStatus,
  MemberStatus,
} from '../../../shared/types.ts';
import { found, query, queryOne, transaction } from '../../core/database.ts';
import type { CountRow, UserRow } from '../../types.ts';

export async function findGroupMember(groupId: number, userId: number): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND group_id = $2 AND left_at IS NULL',
    [userId, groupId]
  );
}

export async function listGroupMembersRaw(groupId: number): Promise<UserRow[]> {
  return query<UserRow>(
    `SELECT * FROM users
     WHERE group_id = $1 AND left_at IS NULL
     ORDER BY
       CASE member_status WHEN 'pending' THEN 0 ELSE 1 END,
       CASE group_role WHEN 'group_admin' THEN 0 WHEN 'co_admin' THEN 1 ELSE 2 END,
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
      "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND left_at IS NULL AND member_status = 'pending'",
      [groupId]
    ),
    queryOne<CountRow>(
      "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND left_at IS NULL AND member_status IN ('active','borrow_muted')",
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
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL AND member_status = 'pending'
     RETURNING *`,
    [userId, groupId, grantTrust]
  );
  return found(row);
}

export async function rejectPendingMember(groupId: number, userId: number) {
  await query(
    `UPDATE users SET left_at = now()
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL AND member_status = 'pending'`,
    [userId, groupId]
  );
}

export async function updateMemberTrustOverride(
  groupId: number,
  userId: number,
  trusted: boolean
): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `UPDATE users
     SET trust_override = $3
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL
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
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL
     RETURNING *`,
    [userId, groupId, status, status === 'borrow_muted' ? mutedUntil : null]
  );
  return found(row);
}

export async function updateMemberRole(groupId: number, userId: number, role: GroupRole): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `UPDATE users
     SET group_role = $3
     WHERE id = $1 AND group_id = $2 AND left_at IS NULL
     RETURNING *`,
    [userId, groupId, role]
  );
  return found(row);
}

export async function transferPrimaryAdmin(
  groupId: number,
  currentPrimaryId: number,
  newPrimaryId: number
): Promise<UserRow> {
  return transaction(async () => {
    await query(
      "UPDATE users SET group_role = 'co_admin' WHERE id = $1 AND group_id = $2 AND left_at IS NULL",
      [currentPrimaryId, groupId]
    );
    const promoted = await queryOne<UserRow>(
      "UPDATE users SET group_role = 'group_admin' WHERE id = $1 AND group_id = $2 AND left_at IS NULL RETURNING *",
      [newPrimaryId, groupId]
    );
    return found(promoted);
  });
}
