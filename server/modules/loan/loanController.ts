// Loans: a borrowing request and the conversation about it. Each function checks whether the step is
// allowed right now; loanModel.ts then saves it and sends the matching phrase to the other person.
// (Who may do it is checked before, by loanRole.ts, which also fills req.loan.)

import type { Request } from 'express';
import type { LoanStatus, MyLoans } from '../../../shared/types.ts';
import { DURATIONS, QUICK_REPLY_KEYS, isOneOf } from '../../core/allowedKeys.ts';
import { found } from '../../core/database.ts';
import { refuse, reply, toId } from '../../core/http.ts';
import { findItem, getItem } from '../item/itemModel.ts';
import { createMessage } from '../message/messageModel.ts';
import { isTrusted } from '../user/userModel.ts';
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
import { loanDetailsView } from './loanView.ts';
import { savePhoto } from './photoFiles.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Once the lender has said yes (the client shows the quick replies at the same moments).
const QUICK_REPLY_STATUSES: LoanStatus[] = ['accepted', 'active', 'returned'];

export async function showMyLoans(req: Request) {
  const answer: MyLoans = {
    borrowing: await listBorrowing(req.user.id),
    lending: await listLending(req.user.id),
  };
  return reply(200, answer);
}

export async function showLoan(req: Request) {
  return reply(200, await loanDetailsView(req.loan.id, req.user.id));
}

export async function requestLoan(req: Request) {
  const { item_id, start_at, end_at }: Record<string, unknown> = req.body ?? {};

  if (!Number.isInteger(Number(item_id))) return refuse(400, 'item_id must be a number');
  const item = await findItem(toId(item_id));
  if (!item) return refuse(404, 'Item not found');
  if (item.group_id !== req.user.group_id) return refuse(403, 'Not in your neighborhood');
  if (item.owner_id === req.user.id) return refuse(403, "You can't borrow your own item");

  // Checked before the item status: once my request is accepted, the item is reserved (for me).
  const openLoan = await findOpenLoan(item.id, req.user.id);
  if (openLoan) return reply(409, { error: 'You already asked for this item', loan_id: openLoan.id });
  if (item.status !== 'available') return refuse(409, 'This item is not available right now');
  if (item.trusted_only && !(await isTrusted(req.user.id))) {
    return refuse(403, 'Only for neighbors who have returned something on time');
  }

  const start = typeof start_at === 'string' ? Date.parse(start_at) : NaN;
  const end = typeof end_at === 'string' ? Date.parse(end_at) : NaN;
  const problem = problemWithDates(start, end, item.max_days);
  if (problem) return refuse(400, problem);

  const loanId = await createLoan(item, req.user.id, new Date(start).toISOString(), new Date(end).toISOString());
  return reply(201, await loanDetailsView(loanId, req.user.id));
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

export async function accept(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'pending') return refuse(409, 'Only a waiting request can be accepted');
  if (Date.parse(loan.end_at) <= Date.now()) return refuse(409, 'The dates of this request are over');
  const item = await getItem(loan.item_id);
  if (item.status !== 'available' || item.removed_at) return refuse(409, 'The item is not available');

  await acceptLoan(loan);
  return showLoan(req);
}

// No (reason 'default'), or "No – I need it those days" (reason 'busy').
export async function decline(req: Request) {
  const reason: unknown = req.body?.reason ?? 'default';
  if (!isOneOf(['default', 'busy'], reason)) return refuse(400, "reason must be 'default' or 'busy'");
  if (req.loan.status !== 'pending') return refuse(409, 'Only a waiting request can be declined');

  await declineLoan(req.loan, reason === 'busy' ? 'declineBusy' : 'decline');
  return showLoan(req);
}

// The borrower changes their mind (only while nobody has answered yet).
export async function cancel(req: Request) {
  if (req.loan.status !== 'pending') return refuse(409, 'Only a waiting request can be cancelled');

  await cancelLoan(req.loan);
  return showLoan(req);
}

// Handover, part 1: the lender's condition photo.
export async function handover(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'accepted' || loan.handover_photo) {
    return refuse(409, 'The handover photo is taken once, after accepting');
  }
  await saveHandoverPhoto(loan, savePhoto(found(req.file))); // receivePhoto has checked that there is one
  return showLoan(req);
}

// Handover, part 2: the borrower has the item.
export async function received(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'accepted' || !loan.handover_photo) {
    return refuse(409, 'Only possible after the handover photo');
  }
  await receiveItem(loan);
  return showLoan(req);
}

// Return, part 1: the borrower's photo of the item they bring back.
export async function giveBack(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'active' || loan.return_photo) {
    return refuse(409, 'The return photo is taken once, while borrowing');
  }
  await saveReturnPhoto(loan, savePhoto(found(req.file))); // receivePhoto has checked that there is one
  return showLoan(req);
}

// Return, part 2: the lender has it back.
export async function returnConfirmed(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'active' || !loan.return_photo) return refuse(409, 'Only possible after the return photo');

  await confirmReturn(loan);
  return showLoan(req);
}

// One of the five fixed quick replies, to the other person. Only these keys: never free text.
export async function quickReply(req: Request) {
  const loan = req.loan;
  const phraseKey: unknown = req.body?.phrase_key;
  if (!isOneOf(QUICK_REPLY_KEYS, phraseKey)) return refuse(400, 'Unknown quick reply');
  if (!QUICK_REPLY_STATUSES.includes(loan.status)) {
    return refuse(409, 'Quick replies are possible once the request is accepted');
  }
  const otherId = loan.borrower_id === req.user.id ? loan.lender_id : loan.borrower_id;
  await createMessage(loan, req.user.id, otherId, phraseKey);
  return showLoan(req);
}
