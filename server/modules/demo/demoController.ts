// Demo mode only: jumping to the moments when reminders are sent.

import type { Request } from 'express';
import { refuse, reply, toId } from '../../core/http.ts';
import { findLoan, moveLoanDates } from '../loan/loanModel.ts';
import { checkReminders } from '../loan/reminders.ts';

const HOUR = 60 * 60 * 1000;
const DUE_IN = { dueSoon: 12 * HOUR, overdue: -1 * HOUR }; // the new due time, from now

// Moves the dates of an active loan, so nobody has to wait days to see the reminders.
export async function fastForward(req: Request) {
  const to: unknown = req.body?.to;
  if (to !== 'dueSoon' && to !== 'overdue') return refuse(400, "to must be 'dueSoon' or 'overdue'");

  const loan = await findLoan(toId(req.params.id));
  if (!loan) return refuse(404, 'Loan not found');
  if (loan.borrower_id !== req.user.id && loan.lender_id !== req.user.id) return refuse(403, 'Not your loan');
  if (loan.status !== 'active') return refuse(409, 'Only an active loan can be fast-forwarded');

  // The start moves along with the end, so the loan keeps its length and never starts after it ends.
  const length = Math.max(Date.parse(loan.end_at) - Date.parse(loan.start_at), 24 * HOUR);
  const end = Date.now() + DUE_IN[to];
  await moveLoanDates(loan.id, new Date(end - length).toISOString(), new Date(end).toISOString());
  await checkReminders(); // right now, instead of at the next 30-second check
  return reply(204);
}
