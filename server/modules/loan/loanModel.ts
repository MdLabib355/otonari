// The loans table, and every step of a loan. Each step is one transaction: the new status, the item's
// status and the message to the other person are saved together, or not at all.
// Whether a step is allowed is checked by loanController.ts.

import type { LoanStatus, LoanSummary } from '../../../shared/types.ts';
import { db, found } from '../../core/database.ts';
import type { ItemRow, LoanRow } from '../../types.ts';
import { setItemStatus } from '../item/itemModel.ts';
import { createMessage, moveMessageDates } from '../message/messageModel.ts';

type LoanSide = 'borrower_id' | 'lender_id';

export function findLoan(loanId: number): LoanRow | undefined {
  return db.prepare<unknown[], LoanRow>('SELECT * FROM loans WHERE id = ?').get(loanId);
}

export function getLoan(loanId: number): LoanRow {
  return found(findLoan(loanId));
}

// My loans from one side, newest first. As borrower the other person is the lender, and the other
// way round. `unread` counts the messages to me in that loan that I haven't seen yet.
function listLoans(myColumn: LoanSide, otherColumn: LoanSide, userId: number): LoanSummary[] {
  return db
    .prepare<unknown[], LoanSummary>(
      `SELECT loans.id, loans.status, loans.start_at, loans.end_at, items.item_key, items.spot,
              other.nickname AS other_nickname, other.lang AS other_lang,
              (SELECT COUNT(*) FROM messages
                WHERE messages.loan_id = loans.id AND messages.to_user_id = ? AND messages.read_at IS NULL) AS unread
       FROM loans
       JOIN items ON items.id = loans.item_id
       JOIN users AS other ON other.id = loans.${otherColumn}
       WHERE loans.${myColumn} = ?
       ORDER BY loans.id DESC`
    )
    .all(userId, userId);
}

export function listBorrowing(userId: number): LoanSummary[] {
  return listLoans('borrower_id', 'lender_id', userId);
}

export function listLending(userId: number): LoanSummary[] {
  return listLoans('lender_id', 'borrower_id', userId);
}

// This person's pending or accepted loan for this item, if any. They can't ask for it a second time.
export function findOpenLoan(itemId: number, borrowerId: number): { id: number } | undefined {
  return db
    .prepare<unknown[], { id: number }>(
      "SELECT id FROM loans WHERE item_id = ? AND borrower_id = ? AND status IN ('pending', 'accepted')"
    )
    .get(itemId, borrowerId);
}

// In the middle of a loan (as borrower or lender)? Then this person can't leave the neighborhood.
export function hasUnfinishedLoan(userId: number): boolean {
  const loan = db
    .prepare("SELECT id FROM loans WHERE (borrower_id = ? OR lender_id = ?) AND status IN ('accepted', 'active')")
    .get(userId, userId);
  return loan !== undefined;
}

// Active loans whose borrower hasn't sent the return photo yet (for the reminders).
export function listNotYetReturned(): LoanRow[] {
  return db.prepare<unknown[], LoanRow>("SELECT * FROM loans WHERE status = 'active' AND return_photo IS NULL").all();
}

export function listPendingRequestsOf(borrowerId: number): LoanRow[] {
  return db
    .prepare<unknown[], LoanRow>("SELECT * FROM loans WHERE borrower_id = ? AND status = 'pending'")
    .all(borrowerId);
}

function setStatus(loanId: number, status: LoanStatus) {
  db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(status, loanId);
}

// Politely decline every request still waiting for this item (except `exceptLoanId`):
// when another request for it is accepted, or when the owner removes the item.
// Each of those borrowers gets the 'decline' phrase.
export function declinePendingLoans(itemId: number, exceptLoanId: number | null = null) {
  const pendingLoans = db
    .prepare<unknown[], LoanRow>("SELECT * FROM loans WHERE item_id = ? AND status = 'pending'")
    .all(itemId);
  for (const loan of pendingLoans) {
    if (loan.id !== exceptLoanId) declineLoan(loan, 'decline');
  }
}

// Returns the new loan's id.
export const createLoan = db.transaction(
  (item: ItemRow, borrowerId: number, startAt: string, endAt: string): number => {
    const result = db
      .prepare('INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at) VALUES (?, ?, ?, ?, ?)')
      .run(item.id, borrowerId, item.owner_id, startAt, endAt);
    const loan = getLoan(Number(result.lastInsertRowid));
    createMessage(loan, borrowerId, item.owner_id, 'request');
    return loan.id;
  }
);

// Yes: the item is reserved for this borrower, and everyone else who asked for it gets a polite no.
export const acceptLoan = db.transaction((loan: LoanRow) => {
  setStatus(loan.id, 'accepted');
  setItemStatus(loan.item_id, 'reserved');
  createMessage(loan, loan.lender_id, loan.borrower_id, 'accept');
  declinePendingLoans(loan.item_id, loan.id);
});

export const declineLoan = db.transaction((loan: LoanRow, phraseKey: 'decline' | 'declineBusy') => {
  setStatus(loan.id, 'declined');
  createMessage(loan, loan.lender_id, loan.borrower_id, phraseKey);
});

export const cancelLoan = db.transaction((loan: LoanRow) => {
  setStatus(loan.id, 'cancelled');
  createMessage(loan, loan.borrower_id, loan.lender_id, 'cancel');
});

export const saveHandoverPhoto = db.transaction((loan: LoanRow, photo: string) => {
  db.prepare('UPDATE loans SET handover_photo = ? WHERE id = ?').run(photo, loan.id);
  createMessage(loan, loan.lender_id, loan.borrower_id, 'handoverPhoto');
});

// The borrower has the item. Now it is really lent.
export const receiveItem = db.transaction((loan: LoanRow) => {
  setStatus(loan.id, 'active');
  setItemStatus(loan.item_id, 'lent');
  createMessage(loan, loan.borrower_id, loan.lender_id, 'received');
});

export const saveReturnPhoto = db.transaction((loan: LoanRow, photo: string) => {
  // This moment decides whether the return was on time, however slowly the lender confirms it.
  db.prepare('UPDATE loans SET return_photo = ?, returned_at = ? WHERE id = ?').run(
    photo,
    new Date().toISOString(),
    loan.id
  );
  createMessage(loan, loan.borrower_id, loan.lender_id, 'returned');
});

// The lender has it back, and it can be borrowed again.
export const confirmReturn = db.transaction((loan: LoanRow) => {
  setStatus(loan.id, 'returned');
  setItemStatus(loan.item_id, 'available');
  createMessage(loan, loan.lender_id, loan.borrower_id, 'returnConfirmed');
});

export function markRemindedSoon(loanId: number) {
  db.prepare("UPDATE loans SET reminded_soon_at = datetime('now') WHERE id = ?").run(loanId);
}

export function markRemindedOverdue(loanId: number) {
  db.prepare("UPDATE loans SET reminded_overdue_at = datetime('now') WHERE id = ?").run(loanId);
}

// Demo fast-forward. The dates in the messages move too, or the reminder would contradict the request
// above it.
export const moveLoanDates = db.transaction((loanId: number, startAt: string, endAt: string) => {
  db.prepare('UPDATE loans SET start_at = ?, end_at = ? WHERE id = ?').run(startAt, endAt, loanId);
  moveMessageDates(loanId, startAt, endAt);
});
