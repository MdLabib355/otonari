// Automatic polite reminders, so the lender never has to chase an overdue item.
// Every 30 seconds, for each active loan without a return photo:
//   <= 24 hours left (not overdue) -> 'sys.dueSoon' to borrower
//   overdue                        -> 'sys.overdue' to borrower, and 'sys.overdueLender' to lender
// reminded_soon_at / reminded_overdue_at guarantee idempotency across server restarts.

import { createMessage, query, withTransaction } from './db.js';

const CHECK_EVERY_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FROM_SYSTEM = null;

let intervalId = null;

async function remindLoan(loan, client) {
  const timeLeft = Date.parse(loan.end_at) - Date.now();

  if (timeLeft > 0 && timeLeft <= DAY_MS && !loan.reminded_soon_at) {
    await query('UPDATE loans SET reminded_soon_at = NOW() WHERE id = $1', [loan.id], client);
    await createMessage(loan, FROM_SYSTEM, loan.borrower_id, 'sys.dueSoon', client);
  }
  if (timeLeft < 0 && !loan.reminded_overdue_at) {
    await query('UPDATE loans SET reminded_overdue_at = NOW() WHERE id = $1', [loan.id], client);
    await createMessage(loan, FROM_SYSTEM, loan.borrower_id, 'sys.overdue', client);
    await createMessage(loan, FROM_SYSTEM, loan.lender_id, 'sys.overdueLender', client);
  }
}

export async function checkReminders() {
  return withTransaction(async (client) => {
    const res = await query(
      `SELECT * FROM loans
       WHERE status = 'active' AND return_photo IS NULL
       FOR UPDATE SKIP LOCKED`,
      [],
      client
    );
    for (const loan of res.rows) {
      await remindLoan(loan, client);
    }
  });
}

export function startReminders() {
  stopReminders();
  const run = async () => {
    try {
      await checkReminders();
    } catch (error) {
      console.error('Reminder check failed:', error);
    }
  };
  intervalId = setInterval(run, CHECK_EVERY_MS);
  intervalId.unref?.();
}

export function stopReminders() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
