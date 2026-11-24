// Automatic polite reminders, so the lender never has to ask (CLAUDE.md section 6).
// Every 30 seconds, for each active loan without a return photo:
//   24 hours or less to go  → 'sys.dueSoon' to the borrower
//   overdue                 → 'sys.overdue' to the borrower, and 'sys.overdueLender' ("we reminded
//                             them for you") to the lender
// reminded_soon_at / reminded_overdue_at remember what was sent, so nothing is ever sent twice,
// not even after a server restart.

import { transaction } from '../../core/database.ts';
import type { LoanRow } from '../../types.ts';
import { createMessage } from '../message/messageModel.ts';
import { listNotYetReturned, markRemindedOverdue, markRemindedSoon } from './loanModel.ts';

const CHECK_EVERY_MS = 30_000;
const DAY = 24 * 60 * 60 * 1000;
const FROM_SYSTEM = null; // reminders have no sender

async function remind(loan: LoanRow) {
  const timeLeft = Date.parse(loan.end_at) - Date.now();

  if (timeLeft > 0 && timeLeft <= DAY && !loan.reminded_soon_at) {
    await markRemindedSoon(loan.id);
    await createMessage(loan, FROM_SYSTEM, loan.borrower_id, 'sys.dueSoon');
  }
  if (timeLeft < 0 && !loan.reminded_overdue_at) {
    await markRemindedOverdue(loan.id);
    await createMessage(loan, FROM_SYSTEM, loan.borrower_id, 'sys.overdue');
    await createMessage(loan, FROM_SYSTEM, loan.lender_id, 'sys.overdueLender');
  }
}

// One transaction: a reminder and its "already sent" time are saved together, or not at all.
// With a return photo the borrower has done their part (only "I got it back" is missing): no reminders.
export async function checkReminders() {
  await transaction(async () => {
    for (const loan of await listNotYetReturned()) await remind(loan);
  });
}

export function startReminders() {
  setInterval(() => {
    // E.g. the database restarts: don't stop the server, the next check tries again.
    checkReminders().catch((error) => console.error('Reminder check failed:', error));
  }, CHECK_EVERY_MS);
}
