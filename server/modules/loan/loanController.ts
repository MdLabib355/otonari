// Loans: a borrowing request and the conversation about it. Each function checks whether the step is
// allowed right now; loanModel.ts then saves it and sends the matching phrase to the other person.
// (Who may do it is checked before, by loanRole.ts, which also fills req.loan.)

import type { Request, Response } from 'express';
import type { LoanStatus, MyLoans } from '../../../shared/types.ts';
import { DURATIONS, QUICK_REPLY_KEYS, isOneOf } from '../../core/allowedKeys.ts';
import { found } from '../../core/database.ts';
import { findItem, getItem } from '../item/itemModel.ts';
import {
  acceptLoan,
  cancelLoan,
  confirmReturn,
  createLoan,
  declineLoan,
  findOpenLoan,
  listBorrowing,
  listLending,
  receiveItem,
  saveHandoverPhoto,
  saveReturnPhoto,
} from './loanModel.ts';
import { createMessage } from '../message/messageModel.ts';
import { isTrusted } from '../user/userModel.ts';
import { savePhoto } from './photoFiles.ts';
import { loanDetailsView } from './loanView.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Once the lender has said yes (the client shows the quick replies at the same moments).
const QUICK_REPLY_STATUSES: LoanStatus[] = ['accepted', 'active', 'returned'];

export function showMyLoans(req: Request, res: Response) {
  const answer: MyLoans = { borrowing: listBorrowing(req.user.id), lending: listLending(req.user.id) };
  res.json(answer);
}

export function showLoan(req: Request, res: Response) {
  res.json(loanDetailsView(req.loan.id, req.user.id));
}

export function requestLoan(req: Request, res: Response) {
  const { item_id, start_at, end_at }: Record<string, unknown> = req.body ?? {};

  const itemId = Number(item_id);
  if (!Number.isInteger(itemId)) {
    return res.status(400).json({ error: 'item_id must be a number' });
  }
  const item = findItem(itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.group_id !== req.user.group_id) {
    return res.status(403).json({ error: 'Not in your neighborhood' });
  }
  if (item.owner_id === req.user.id) {
    return res.status(403).json({ error: "You can't borrow your own item" });
  }
  // Checked before the item status: once my request is accepted, the item is reserved (for me).
  const openLoan = findOpenLoan(item.id, req.user.id);
  if (openLoan) {
    return res.status(409).json({ error: 'You already asked for this item', loan_id: openLoan.id });
  }
  if (item.status !== 'available') {
    return res.status(409).json({ error: 'This item is not available right now' });
  }
  if (item.trusted_only === 1 && !isTrusted(req.user.id)) {
    return res.status(403).json({ error: 'Only for neighbors who have returned something on time' });
  }

  const start = typeof start_at === 'string' ? Date.parse(start_at) : NaN;
  const end = typeof end_at === 'string' ? Date.parse(end_at) : NaN;
  const problem = problemWithDates(start, end, item.max_days);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  const loanId = createLoan(item, req.user.id, new Date(start).toISOString(), new Date(end).toISOString());
  res.status(201).json(loanDetailsView(loanId, req.user.id));
}

// The tap-only picker always asks for whole days (1, 2, 3 or 7), never more than the owner allows,
// starting at a time that is not over yet (one hour of slack for slow taps).
function problemWithDates(start: number, end: number, maxDays: number): string | null {
  if (Number.isNaN(start) || Number.isNaN(end)) return 'start_at and end_at must be ISO dates';

  const days = (end - start) / DAY;
  if (!DURATIONS.includes(days) || days > maxDays) {
    return `The loan must last 1, 2, 3 or 7 days, at most ${maxDays}`;
  }
  if (start < Date.now() - HOUR) return 'start_at is in the past';
  // The picker ends with the evening of the day after tomorrow, which is always less than 3 days away.
  if (start > Date.now() + 3 * DAY) return 'start_at is too far in the future';
  return null;
}

export function accept(req: Request, res: Response) {
  const loan = req.loan;
  if (loan.status !== 'pending') {
    return res.status(409).json({ error: 'Only a waiting request can be accepted' });
  }
  if (Date.parse(loan.end_at) <= Date.now()) {
    return res.status(409).json({ error: 'The dates of this request are over' });
  }
  const item = getItem(loan.item_id);
  if (item.status !== 'available' || item.removed_at) {
    return res.status(409).json({ error: 'The item is not available' });
  }
  acceptLoan(loan);
  res.json(loanDetailsView(loan.id, req.user.id));
}

// No (reason 'default'), or "No – I need it those days" (reason 'busy').
export function decline(req: Request, res: Response) {
  const loan = req.loan;
  const reason: unknown = req.body?.reason ?? 'default';
  if (!isOneOf(['default', 'busy'], reason)) {
    return res.status(400).json({ error: "reason must be 'default' or 'busy'" });
  }
  if (loan.status !== 'pending') {
    return res.status(409).json({ error: 'Only a waiting request can be declined' });
  }
  declineLoan(loan, reason === 'busy' ? 'declineBusy' : 'decline');
  res.json(loanDetailsView(loan.id, req.user.id));
}

// The borrower changes their mind (only while nobody has answered yet).
export function cancel(req: Request, res: Response) {
  const loan = req.loan;
  if (loan.status !== 'pending') {
    return res.status(409).json({ error: 'Only a waiting request can be cancelled' });
  }
  cancelLoan(loan);
  res.json(loanDetailsView(loan.id, req.user.id));
}

// Handover, part 1: the lender's condition photo.
export function handover(req: Request, res: Response) {
  const loan = req.loan;
  if (loan.status !== 'accepted' || loan.handover_photo) {
    return res.status(409).json({ error: 'The handover photo is taken once, after accepting' });
  }
  saveHandoverPhoto(loan, savePhoto(found(req.file))); // receivePhoto has checked that there is one
  res.json(loanDetailsView(loan.id, req.user.id));
}

// Handover, part 2: the borrower has the item.
export function received(req: Request, res: Response) {
  const loan = req.loan;
  if (loan.status !== 'accepted' || !loan.handover_photo) {
    return res.status(409).json({ error: 'Only possible after the handover photo' });
  }
  receiveItem(loan);
  res.json(loanDetailsView(loan.id, req.user.id));
}

// Return, part 1: the borrower's photo of the item they bring back.
export function giveBack(req: Request, res: Response) {
  const loan = req.loan;
  if (loan.status !== 'active' || loan.return_photo) {
    return res.status(409).json({ error: 'The return photo is taken once, while borrowing' });
  }
  saveReturnPhoto(loan, savePhoto(found(req.file))); // receivePhoto has checked that there is one
  res.json(loanDetailsView(loan.id, req.user.id));
}

// Return, part 2: the lender has it back.
export function returnConfirmed(req: Request, res: Response) {
  const loan = req.loan;
  if (loan.status !== 'active' || !loan.return_photo) {
    return res.status(409).json({ error: 'Only possible after the return photo' });
  }
  confirmReturn(loan);
  res.json(loanDetailsView(loan.id, req.user.id));
}

// One of the five fixed quick replies, to the other person. Only these keys: never free text.
export function quickReply(req: Request, res: Response) {
  const loan = req.loan;
  const phraseKey: unknown = req.body?.phrase_key;
  if (!isOneOf(QUICK_REPLY_KEYS, phraseKey)) {
    return res.status(400).json({ error: 'Unknown quick reply' });
  }
  if (!QUICK_REPLY_STATUSES.includes(loan.status)) {
    return res.status(409).json({ error: 'Quick replies are possible once the request is accepted' });
  }
  const otherId = loan.borrower_id === req.user.id ? loan.lender_id : loan.borrower_id;
  createMessage(loan, req.user.id, otherId, phraseKey);
  res.json(loanDetailsView(loan.id, req.user.id));
}
