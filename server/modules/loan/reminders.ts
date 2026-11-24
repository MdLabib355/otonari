// Automatic polite reminders, so the lender never has to ask (CLAUDE.md section 6).
// Every 30 seconds, for each active loan without a return photo:
//   24 hours or less to go  → 'sys.dueSoon' to the borrower
//   overdue                 → 'sys.overdue' to the borrower, and 'sys.overdueLender' ("we reminded
//                             them for you") to the lender
// reminded_soon_at / reminded_overdue_at remember what was sent, so nothing is ever sent twice,
// not even after a server restart.

import { db } from '../../core/database.ts';
import { listNotYetReturned, markRemindedOverdue, markRemindedSoon } from './loanModel.ts';
import { createMessage } from '../message/messageModel.ts';
import type { LoanRow } from '../../types.ts';

const CHECK_EVERY_MS = 30_000;
const DAY = 24 * 60 * 60 * 1000;
const FROM_SYSTEM = null; // reminders have no sender

function remind(loan: LoanRow) {
  const timeLeft = Date.parse(loan.end_at) - Date.now();

  if (timeLeft > 0 && timeLeft <= DAY && !loan.reminded_soon_at) {
    markRemindedSoon(loan.id);
    createMessage(loan, FROM_SYSTEM, loan.borrower_id, 'sys.dueSoon');
  }
  if (timeLeft < 0 && !loan.reminded_overdue_at) {
    markRemindedOverdue(loan.id);
    createMessage(loan, FROM_SYSTEM, loan.borrower_id, 'sys.overdue');
    createMessage(loan, FROM_SYSTEM, loan.lender_id, 'sys.overdueLender');
  }
}

// One transaction: a reminder and its "already sent" time are saved together, or not at all.
// With a return photo the borrower has done their part (only "I got it back" is missing): no reminders.
export const checkReminders = db.transaction(() => {
  listNotYetReturned().forEach(remind);
});

export function startReminders() {
  setInterval(() => {
    try {
      checkReminders();
    } catch (error) {
      // E.g. the database is busy for a moment: don't stop the server, the next check tries again.
      console.error('Reminder check failed:', error);
    }
  }, CHECK_EVERY_MS);
}
