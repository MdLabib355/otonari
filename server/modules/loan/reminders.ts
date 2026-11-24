// Automatic polite reminders, so the lender never has to ask (CLAUDE.md section 6).
// Tracks last-run health telemetry for the Super Admin Operations dashboard.

import type { ReminderHealth } from '../../../shared/types.ts';
import { transaction } from '../../core/database.ts';
import type { LoanRow } from '../../types.ts';
import { createMessage } from '../message/messageModel.ts';
import { listNotYetReturned, markRemindedOverdue, markRemindedSoon } from './loanModel.ts';

const CHECK_EVERY_MS = 30_000;
const DAY = 24 * 60 * 60 * 1000;
const FROM_SYSTEM = null; // reminders have no sender

let lastRunAt: string | null = null;
let lastCheckedLoans = 0;
let lastError: string | null = null;

export function getReminderHealth(): ReminderHealth {
  return {
    interval_seconds: CHECK_EVERY_MS / 1000,
    last_run_at: lastRunAt,
    last_checked_loans: lastCheckedLoans,
    last_error: lastError,
  };
}

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
export async function checkReminders(): Promise<{ checkedLoans: number; ranAt: string }> {
  try {
    let checked = 0;
    await transaction(async () => {
      const loans = await listNotYetReturned();
      checked = loans.length;
      for (const loan of loans) await remind(loan);
    });
    lastRunAt = new Date().toISOString();
    lastCheckedLoans = checked;
    lastError = null;
    return { checkedLoans: checked, ranAt: lastRunAt };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

export function startReminders() {
  setInterval(() => {
    // E.g. the database restarts: don't stop the server, the next check tries again.
    checkReminders().catch((error) => console.error('Reminder check failed:', error));
  }, CHECK_EVERY_MS);
}
