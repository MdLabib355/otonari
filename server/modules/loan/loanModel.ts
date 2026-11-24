// The loans table, and every step of a loan. Each step is one transaction: the new status, the item's
// status and the message to the other person are saved together, or not at all.
// Whether a step is allowed is checked by loanController.ts.

import type { LoanStatus, LoanSummary } from '../../../shared/types.ts';
import { found, query, queryOne, transaction } from '../../core/database.ts';
import { photoUrl } from '../../core/photoFiles.ts';
import type { ItemRow, LoanRow } from '../../types.ts';
import { setItemStatus } from '../item/itemModel.ts';
import { createMessage, moveMessageDates } from '../message/messageModel.ts';

type LoanSide = 'borrower_id' | 'lender_id';

export async function findLoan(loanId: number): Promise<LoanRow | undefined> {
  return queryOne<LoanRow>('SELECT * FROM loans WHERE id = $1', [loanId]);
}

export async function getLoan(loanId: number): Promise<LoanRow> {
  return found(await findLoan(loanId));
}

// My loans from one side, newest first. As borrower the other person is the lender, and the other
// way round. `unread` counts the messages to me in that loan that I haven't seen yet.
async function listLoans(myColumn: LoanSide, otherColumn: LoanSide, userId: number): Promise<LoanSummary[]> {
  const loans = await query<LoanSummary>(
    `SELECT loans.id, loans.status, loans.start_at, loans.end_at, items.item_key, items.custom_title, items.category_key,
            items.photo AS item_photo, items.spot,
            other.nickname AS other_nickname, other.lang AS other_lang,
            (SELECT COUNT(*)::int FROM messages
              WHERE messages.loan_id = loans.id AND messages.to_user_id = $1 AND messages.read_at IS NULL) AS unread
     FROM loans
     JOIN items ON items.id = loans.item_id
     JOIN users AS other ON other.id = loans.${otherColumn}
     WHERE loans.${myColumn} = $1
     ORDER BY loans.id DESC`,
    [userId]
  );
  return Promise.all(loans.map(async (loan) => ({ ...loan, item_photo: await photoUrl(loan.item_photo) })));
}

export async function listBorrowing(userId: number): Promise<LoanSummary[]> {
  return listLoans('borrower_id', 'lender_id', userId);
}

export async function listLending(userId: number): Promise<LoanSummary[]> {
  return listLoans('lender_id', 'borrower_id', userId);
}

// This person's pending or accepted loan for this item, if any. They can't ask for it a second time.
export async function findOpenLoan(itemId: number, borrowerId: number): Promise<{ id: number } | undefined> {
  return queryOne<{ id: number }>(
    "SELECT id FROM loans WHERE item_id = $1 AND borrower_id = $2 AND status IN ('pending', 'accepted')",
    [itemId, borrowerId]
  );
}

// In the middle of a loan (as borrower or lender)? Then this person can't leave the neighborhood.
export async function hasUnfinishedLoan(userId: number): Promise<boolean> {
  const loan = await queryOne(
    "SELECT id FROM loans WHERE (borrower_id = $1 OR lender_id = $1) AND status IN ('accepted', 'active')",
    [userId]
  );
  return loan !== undefined;
}

// Active loans whose borrower hasn't sent the return photo yet (for the reminders).
export async function listNotYetReturned(): Promise<LoanRow[]> {
  return query<LoanRow>("SELECT * FROM loans WHERE status = 'active' AND return_photo IS NULL ORDER BY id");
}

export async function listPendingRequestsOf(borrowerId: number): Promise<LoanRow[]> {
  return query<LoanRow>("SELECT * FROM loans WHERE borrower_id = $1 AND status = 'pending' ORDER BY id", [borrowerId]);
}

async function setStatus(loanId: number, status: LoanStatus) {
  await query('UPDATE loans SET status = $1 WHERE id = $2', [status, loanId]);
}

// Politely decline every request still waiting for this item (except `exceptLoanId`):
// when another request for it is accepted, or when the owner removes the item.
// Each of those borrowers gets the 'decline' phrase.
export async function declinePendingLoans(itemId: number, exceptLoanId: number | null = null) {
  const pendingLoans = await query<LoanRow>(
    "SELECT * FROM loans WHERE item_id = $1 AND status = 'pending' ORDER BY id",
    [itemId]
  );
  for (const loan of pendingLoans) {
    if (loan.id !== exceptLoanId) await declineLoan(loan, 'decline');
  }
}

// Returns the new loan's id.
export async function createLoan(item: ItemRow, borrowerId: number, startAt: string, endAt: string): Promise<number> {
  return transaction(async () => {
    const row = await queryOne<LoanRow>(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [item.id, borrowerId, item.owner_id, startAt, endAt]
    );
    const loan = found(row);
    await createMessage(loan, borrowerId, item.owner_id, 'request');
    return loan.id;
  });
}

// Yes: the item is reserved for this borrower, and everyone else who asked for it gets a polite no.
export async function acceptLoan(loan: LoanRow) {
  await transaction(async () => {
    await setStatus(loan.id, 'accepted');
    await setItemStatus(loan.item_id, 'reserved');
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'accept');
    await declinePendingLoans(loan.item_id, loan.id);
  });
}

export async function declineLoan(loan: LoanRow, phraseKey: 'decline' | 'declineBusy') {
  await transaction(async () => {
    await setStatus(loan.id, 'declined');
    await createMessage(loan, loan.lender_id, loan.borrower_id, phraseKey);
  });
}

export async function cancelLoan(loan: LoanRow) {
  await transaction(async () => {
    await setStatus(loan.id, 'cancelled');
    await createMessage(loan, loan.borrower_id, loan.lender_id, 'cancel');
  });
}

export async function saveHandoverPhoto(loan: LoanRow, photo: string) {
  await transaction(async () => {
    await query('UPDATE loans SET handover_photo = $1 WHERE id = $2', [photo, loan.id]);
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'handoverPhoto');
  });
}

// The borrower has the item. Now it is really lent.
export async function receiveItem(loan: LoanRow) {
  await transaction(async () => {
    await setStatus(loan.id, 'active');
    await setItemStatus(loan.item_id, 'lent');
    await createMessage(loan, loan.borrower_id, loan.lender_id, 'received');
  });
}

export async function saveReturnPhoto(loan: LoanRow, photo: string) {
  await transaction(async () => {
    // This moment decides whether the return was on time, however slowly the lender confirms it.
    await query('UPDATE loans SET return_photo = $1, returned_at = now() WHERE id = $2', [photo, loan.id]);
    await createMessage(loan, loan.borrower_id, loan.lender_id, 'returned');
  });
}

// The lender has it back, and it can be borrowed again.
export async function confirmReturn(loan: LoanRow) {
  await transaction(async () => {
    await setStatus(loan.id, 'returned');
    await setItemStatus(loan.item_id, 'available');
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'returnConfirmed');
  });
}

export async function markRemindedSoon(loanId: number) {
  await query('UPDATE loans SET reminded_soon_at = now() WHERE id = $1', [loanId]);
}

export async function markRemindedOverdue(loanId: number) {
  await query('UPDATE loans SET reminded_overdue_at = now() WHERE id = $1', [loanId]);
}

// Demo fast-forward. The dates in the messages move too, or the reminder would contradict the request
// above it.
export async function moveLoanDates(loanId: number, startAt: string, endAt: string) {
  await transaction(async () => {
    await query('UPDATE loans SET start_at = $1, end_at = $2 WHERE id = $3', [startAt, endAt, loanId]);
    await moveMessageDates(loanId, startAt, endAt);
  });
}
