// Group Admin loan oversight, gentle cross-lingual check-ins (rate-limited), force-return, and escalation.

import type { GroupAdminLoan, GroupAdminLoanTimelineItem, Lang } from '../../../shared/types.ts';
import { ADMIN_MEDIATION_KEYS, DISPUTE_REASON_KEYS, isOneOf } from '../../core/allowedKeys.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { found, query, queryOne, transaction } from '../../core/database.ts';
import { refuse, type Answer } from '../../core/http.ts';
import type { LoanRow, UserRow } from '../../types.ts';
import { setItemStatus } from '../item/itemModel.ts';
import { createMessage } from '../message/messageModel.ts';

interface GroupLoanQueryRow extends LoanRow {
  item_key: string;
  spot: string;
  borrower_nickname: string;
  borrower_lang: Lang;
  lender_nickname: string;
  lender_lang: Lang;
  flagged_reason: string | null;
  escalated_to_super_admin: boolean | null;
  last_nudge_at: string | null;
}

export async function findGroupLoan(groupId: number, loanId: number): Promise<LoanRow | undefined> {
  return queryOne<LoanRow>(
    `SELECT loans.*
     FROM loans
     JOIN items ON items.id = loans.item_id
     WHERE loans.id = $1 AND items.group_id = $2`,
    [loanId, groupId]
  );
}

async function listTimelineForLoan(loanId: number): Promise<GroupAdminLoanTimelineItem[]> {
  // Collapse dual-recipient system/admin messages with identical phrase_key and second-level timestamp.
  const rows = await query<GroupAdminLoanTimelineItem>(
    `SELECT DISTINCT ON (messages.phrase_key, date_trunc('second', messages.created_at), COALESCE(messages.from_user_id, 0))
            messages.id, messages.phrase_key, messages.params,
            sender.nickname AS from_nickname, sender.lang AS from_lang,
            messages.created_at
     FROM messages
     LEFT JOIN users AS sender ON sender.id = messages.from_user_id
     WHERE messages.loan_id = $1
     ORDER BY messages.phrase_key, date_trunc('second', messages.created_at), COALESCE(messages.from_user_id, 0), messages.id ASC`,
    [loanId]
  );
  return rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
}

export async function listGroupLoansForAdmin(groupId: number): Promise<GroupAdminLoan[]> {
  const rows = await query<GroupLoanQueryRow>(
    `SELECT loans.*,
            items.item_key, items.spot,
            borrower.nickname AS borrower_nickname, borrower.lang AS borrower_lang,
            lender.nickname AS lender_nickname, lender.lang AS lender_lang,
            dispute.reason_key AS flagged_reason,
            dispute.escalated_to_super_admin,
            (SELECT MAX(al.created_at)
             FROM audit_logs AS al
             WHERE al.scope_group_id = $1
               AND al.action = 'loan.nudge'
               AND al.target_id = loans.id::text) AS last_nudge_at
     FROM loans
     JOIN items ON items.id = loans.item_id
     JOIN users AS borrower ON borrower.id = loans.borrower_id
     JOIN users AS lender ON lender.id = loans.lender_id
     LEFT JOIN LATERAL (
       SELECT reason_key, escalated_to_super_admin
       FROM loan_disputes
       WHERE loan_disputes.loan_id = loans.id AND loan_disputes.status = 'open'
       ORDER BY loan_disputes.id DESC
       LIMIT 1
     ) AS dispute ON true
     WHERE items.group_id = $1
       AND loans.status IN ('accepted', 'active', 'returned')
     ORDER BY
       CASE
         WHEN loans.status = 'active' AND loans.return_photo IS NULL AND loans.end_at < now() THEN 0
         WHEN dispute.reason_key IS NOT NULL THEN 1
         WHEN loans.status IN ('active', 'accepted') THEN 2
         ELSE 3
       END,
       loans.id DESC
     LIMIT 50`,
    [groupId]
  );

  const now = Date.now();
  return Promise.all(
    rows.map(async (row) => {
      const isOverdue = row.status === 'active' && !row.return_photo && Date.parse(row.end_at) < now;
      const timeline = await listTimelineForLoan(row.id);
      return {
        id: row.id,
        item_id: row.item_id,
        item_key: row.item_key,
        spot: row.spot,
        status: row.status,
        is_overdue: isOverdue,
        start_at: row.start_at,
        end_at: row.end_at,
        returned_at: row.returned_at,
        handover_photo: row.handover_photo,
        return_photo: row.return_photo,
        borrower: { id: row.borrower_id, nickname: row.borrower_nickname, lang: row.borrower_lang },
        lender: { id: row.lender_id, nickname: row.lender_nickname, lang: row.lender_lang },
        flagged_reason: row.flagged_reason,
        escalated_to_super_admin: Boolean(row.escalated_to_super_admin),
        last_nudge_at: row.last_nudge_at,
        timeline,
      };
    })
  );
}

export async function sendGentleCheckIn(
  admin: UserRow,
  loan: LoanRow,
  phraseKey: unknown,
  ipAddress: string | null
): Promise<Answer | null> {
  if (!isOneOf(ADMIN_MEDIATION_KEYS, phraseKey)) {
    return refuse(400, `phrase_key must be one of: ${ADMIN_MEDIATION_KEYS.join(', ')}`);
  }
  if (loan.status !== 'active' && loan.status !== 'accepted') {
    return refuse(409, 'Gentle check-ins can only be sent on active or accepted loans');
  }

  // Anti-harassment rate limit: at most 1 admin nudge per 24 hours per loan.
  const recentNudge = await queryOne<{ id: number }>(
    `SELECT id FROM audit_logs
     WHERE scope_group_id = $1
       AND action = 'loan.nudge'
       AND target_id = $2
       AND created_at > now() - INTERVAL '24 hours'
     LIMIT 1`,
    [admin.group_id, String(loan.id)]
  );
  if (recentNudge) {
    return refuse(429, 'A gentle check-in was already sent for this loan in the last 24 hours');
  }

  await transaction(async () => {
    await createMessage(loan, null, loan.borrower_id, phraseKey);
    await createMessage(loan, null, loan.lender_id, phraseKey);
    await writeAuditLog({
      actorId: admin.id,
      actorLabel: `${admin.group_role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin'} · ${admin.nickname}`,
      actorRole: admin.group_role === 'group_admin' ? 'group_admin' : 'co_admin',
      scopeGroupId: admin.group_id,
      category: 'Loan',
      action: 'loan.nudge',
      targetType: 'loan',
      targetId: loan.id,
      reason: phraseKey,
      detail: `Sent structured check-in (${phraseKey}) on Loan #${loan.id} to both borrower and lender.`,
      ipAddress,
    });
  });

  return null;
}

export async function resolveGroupLoan(
  admin: UserRow,
  loan: LoanRow,
  resolution: unknown,
  reasonKey: unknown,
  ipAddress: string | null
): Promise<Answer | null> {
  if (resolution !== 'force_return' && resolution !== 'escalate') {
    return refuse(400, "resolution must be 'force_return' or 'escalate'");
  }

  const actorLabel = `${admin.group_role === 'group_admin' ? 'GroupAdmin' : 'CoAdmin'} · ${admin.nickname}`;
  const actorRole: 'group_admin' | 'co_admin' = admin.group_role === 'group_admin' ? 'group_admin' : 'co_admin';

  if (resolution === 'force_return') {
    if (loan.status !== 'active' && loan.status !== 'accepted') {
      return refuse(409, 'Only an accepted or active loan can be marked returned');
    }

    await transaction(async () => {
      await query(
        "UPDATE loans SET status = 'returned', returned_at = COALESCE(returned_at, now()) WHERE id = $1",
        [loan.id]
      );
      await setItemStatus(loan.item_id, 'available');
      await query(
        `UPDATE loan_disputes
         SET status = 'resolved', resolution_note = 'Resolved by Group Admin (confirmed returned)', resolved_at = now()
         WHERE loan_id = $1 AND status = 'open'`,
        [loan.id]
      );
      await createMessage(loan, null, loan.borrower_id, 'admin.resolvedReturn');
      await createMessage(loan, null, loan.lender_id, 'admin.resolvedReturn');
      await writeAuditLog({
        actorId: admin.id,
        actorLabel,
        actorRole,
        scopeGroupId: admin.group_id,
        category: 'Loan',
        action: 'loan.force_return',
        targetType: 'loan',
        targetId: loan.id,
        reason: 'confirmed_in_person',
        detail: `Marked Loan #${loan.id} returned after in-person confirmation and restored item to shelf.`,
        ipAddress,
      });
    });
    return null;
  }

  // resolution === 'escalate' -> forward to Super Admin Safety Queue
  const validReason = isOneOf(DISPUTE_REASON_KEYS, reasonKey) ? reasonKey : 'item_damaged';
  const existing = await queryOne<{ id: number; escalated_to_super_admin: boolean }>(
    "SELECT id, escalated_to_super_admin FROM loan_disputes WHERE loan_id = $1 AND status = 'open' ORDER BY id DESC LIMIT 1",
    [loan.id]
  );

  if (existing?.escalated_to_super_admin) {
    return refuse(409, 'This loan is already escalated to the Super Admin Safety Queue');
  }

  await transaction(async () => {
    if (existing) {
      await query(
        'UPDATE loan_disputes SET escalated_to_super_admin = true, reason_key = $1 WHERE id = $2',
        [validReason, existing.id]
      );
    } else {
      await query(
        `INSERT INTO loan_disputes (group_id, loan_id, raised_by_user_id, reason_key, status, escalated_to_super_admin)
         VALUES ($1, $2, $3, $4, 'open', true)`,
        [admin.group_id, loan.id, admin.id, validReason]
      );
    }

    await writeAuditLog({
      actorId: admin.id,
      actorLabel,
      actorRole,
      scopeGroupId: admin.group_id,
      category: 'Break-Glass',
      action: 'dispute.escalated',
      targetType: 'loan',
      targetId: loan.id,
      reason: validReason,
      detail: `Escalated Loan #${loan.id} (${validReason}) to Super Admin Safety Queue.`,
      ipAddress,
    });
  });

  return null;
}

export async function flagLoanForAdminHelp(
  groupId: number,
  loanId: number,
  userId: number,
  reasonKey: string
): Promise<{ id: number }> {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM loan_disputes WHERE loan_id = $1 AND status = 'open' LIMIT 1",
    [loanId]
  );
  if (existing) return existing;

  const row = await queryOne<{ id: number }>(
    `INSERT INTO loan_disputes (group_id, loan_id, raised_by_user_id, reason_key, status, escalated_to_super_admin)
     VALUES ($1, $2, $3, $4, 'open', false)
     RETURNING id`,
    [groupId, loanId, userId, reasonKey]
  );
  return found(row);
}
