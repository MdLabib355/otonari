// Demo mode only: "continue as a neighbor", and jumping to the moments when reminders are sent.

import type { Request } from 'express';
import { refuse, reply, toId } from '../../core/http.ts';
import { findLoan, moveLoanDates } from '../loan/loanModel.ts';
import { checkReminders } from '../loan/reminders.ts';
import { findMember, listDemoUsers } from '../user/userModel.ts';
import { demoUserView, loginView } from '../user/userView.ts';

const HOUR = 60 * 60 * 1000;
const DUE_IN = { dueSoon: 12 * HOUR, overdue: -1 * HOUR }; // the new due time, from now

export async function showDemoUsers() {
  return reply(200, (await listDemoUsers()).map(demoUserView));
}

// Hands out a token, so it works only for the seeded demo neighbors, never for people who joined.
export async function demoLogin(req: Request) {
  const userId: unknown = req.body?.user_id;
  if (!Number.isInteger(Number(userId))) return refuse(400, 'user_id must be a number');

  const user = await findMember(toId(userId));
  if (!user) return refuse(404, 'User not found');
  if (!user.is_demo) return refuse(403, 'You can only continue as a demo neighbor');
  return reply(200, await loginView(user));
}

// Moves the dates of an active loan, so nobody has to wait days to see the reminders.
export async function fastForward(req: Request) {
  const to: unknown = req.body?.to;
  if (to !== 'dueSoon' && to !== 'overdue') return refuse(400, "to must be 'dueSoon' or 'overdue'");

  const loan = await findLoan(toId(req.params.id));
  if (!loan) return refuse(404, 'Loan not found');
  if (loan.borrower_id !== req.user.id && loan.lender_id !== req.user.id) return refuse(403, 'Not your loan');
  if (loan.status !== 'active') return refuse(409, 'Only an active loan can be fast-forwarded');

  // The start moves along with the end, so the loan keeps its length and never starts after it ends.
  // (At least a day: this also repairs a loan whose start was left behind by an older fast-forward.)
  const length = Math.max(Date.parse(loan.end_at) - Date.parse(loan.start_at), 24 * HOUR);
  const end = Date.now() + DUE_IN[to];
  await moveLoanDates(loan.id, new Date(end - length).toISOString(), new Date(end).toISOString());
  await checkReminders(); // right now, instead of at the next 30-second check
  return reply(204);
}
