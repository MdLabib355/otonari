// Demo mode only: "continue as a neighbor", and jumping to the moments when reminders are sent.

import type { Request, Response } from 'express';
import { checkReminders } from '../loan/reminders.ts';
import { findLoan, moveLoanDates } from '../loan/loanModel.ts';
import { findMember, listDemoUsers } from '../user/userModel.ts';
import { demoUserView, loginView } from '../user/userView.ts';

const HOUR = 60 * 60 * 1000;
const DUE_IN = { dueSoon: 12 * HOUR, overdue: -1 * HOUR }; // the new due time, from now

export function showDemoUsers(req: Request, res: Response) {
  res.json(listDemoUsers().map(demoUserView));
}

// Hands out a token, so it works only for the seeded demo neighbors, never for people who joined.
export function demoLogin(req: Request, res: Response) {
  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'user_id must be a number' });
  }
  const user = findMember(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.is_demo !== 1) {
    return res.status(403).json({ error: 'You can only continue as a demo neighbor' });
  }
  res.json(loginView(user));
}

// Moves the dates of an active loan, so nobody has to wait days to see the reminders.
export function fastForward(req: Request, res: Response) {
  const to: unknown = req.body?.to;
  if (to !== 'dueSoon' && to !== 'overdue') {
    return res.status(400).json({ error: "to must be 'dueSoon' or 'overdue'" });
  }
  const loan = findLoan(Number(req.params.loanId));
  if (!loan) {
    return res.status(404).json({ error: 'Loan not found' });
  }
  if (loan.borrower_id !== req.user.id && loan.lender_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your loan' });
  }
  if (loan.status !== 'active') {
    return res.status(409).json({ error: 'Only an active loan can be fast-forwarded' });
  }

  // The start moves along with the end, so the loan keeps its length and never starts after it ends.
  // (At least a day: this also repairs a loan whose start was left behind by an older fast-forward.)
  const length = Math.max(Date.parse(loan.end_at) - Date.parse(loan.start_at), 24 * HOUR);
  const end = Date.now() + DUE_IN[to];
  moveLoanDates(loan.id, new Date(end - length).toISOString(), new Date(end).toISOString());
  checkReminders(); // right now, instead of at the next 30-second check
  res.status(204).end();
}
