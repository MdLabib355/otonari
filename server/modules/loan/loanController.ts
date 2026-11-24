// Loans: a borrowing request and the conversation about it.

import type { Request } from 'express';
import type { LoanStatus, MyLoans } from '../../../shared/types.ts';
import { DISPUTE_REASON_KEYS, DURATIONS, QUICK_REPLY_KEYS, isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toId } from '../../core/http.ts';
import { getGroupRow } from '../group/groupModel.ts';
import { flagLoanForAdminHelp } from '../groupAdmin/loanMediation.ts';
import { findItem, getItem } from '../item/itemModel.ts';
import { createMessage } from '../message/messageModel.ts';
import { isTrusted, resolveEffectiveMemberStatus } from '../user/userModel.ts';
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
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

  const group = await getGroupRow(req.groupId);
  if (group.lifecycle_status !== 'active') {
    return refuse(403, 'New borrow requests are currently paused for this group');
  }
  const effectiveStatus = await resolveEffectiveMemberStatus(req.user);
  if (effectiveStatus === 'borrow_muted') {
    return refuse(403, 'Your borrowing privileges are temporarily paused by the building admin');
  }

  if (!Number.isInteger(Number(item_id))) return refuse(400, 'item_id must be a number');
  const item = await findItem(toId(item_id));
  if (!item || item.hidden_at || item.approval_status !== 'approved') return refuse(404, 'Item not found');
  if (item.group_id !== req.groupId) return refuse(403, 'Not in your neighborhood');
  if (item.owner_id === req.user.id) return refuse(403, "You can't borrow your own item");

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

function problemWithDates(start: number, end: number, maxDays: number): string | null {
  if (Number.isNaN(start) || Number.isNaN(end)) return 'start_at and end_at must be ISO dates';

  const days = (end - start) / DAY;
  if (!DURATIONS.includes(days) || days > maxDays) {
    return `The loan must last 1, 2, 3 or 7 days, at most ${maxDays}`;
  }
  if (start < Date.now() - HOUR) return 'start_at is in the past';
  if (start > Date.now() + 3 * DAY) return 'start_at is too far in the future';
  return null;
}

export async function accept(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'pending') return refuse(409, 'Only a waiting request can be accepted');
  if (Date.parse(loan.end_at) <= Date.now()) return refuse(409, 'The dates of this request are over');
  const item = await getItem(loan.item_id);
  if (item.status !== 'available' || item.removed_at || item.hidden_at) return refuse(409, 'The item is not available');

  await acceptLoan(loan);
  return showLoan(req);
}

export async function decline(req: Request) {
  const reason: unknown = req.body?.reason ?? 'default';
  if (!isOneOf(['default', 'busy'], reason)) return refuse(400, "reason must be 'default' or 'busy'");
  if (req.loan.status !== 'pending') return refuse(409, 'Only a waiting request can be declined');

  await declineLoan(req.loan, reason === 'busy' ? 'declineBusy' : 'decline');
  return showLoan(req);
}

export async function cancel(req: Request) {
  if (req.loan.status !== 'pending') return refuse(409, 'Only a waiting request can be cancelled');

  await cancelLoan(req.loan);
  return showLoan(req);
}

export function canHandOver({ loan }: Request) {
  const allowed = loan.status === 'accepted' && !loan.handover_photo;
  return allowed ? null : refuse(409, 'The handover photo is taken once, after accepting');
}

export async function handover(req: Request) {
  await saveHandoverPhoto(req.loan, req.photo);
  return showLoan(req);
}

export async function received(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'accepted' || !loan.handover_photo) {
    return refuse(409, 'Only possible after the handover photo');
  }
  await receiveItem(loan);
  return showLoan(req);
}

export function canGiveBack({ loan }: Request) {
  const allowed = loan.status === 'active' && !loan.return_photo;
  return allowed ? null : refuse(409, 'The return photo is taken once, while borrowing');
}

export async function giveBack(req: Request) {
  await saveReturnPhoto(req.loan, req.photo);
  return showLoan(req);
}

export async function returnConfirmed(req: Request) {
  const loan = req.loan;
  if (loan.status !== 'active' || !loan.return_photo) return refuse(409, 'Only possible after the return photo');

  await confirmReturn(loan);
  return showLoan(req);
}

export async function quickReply(req: Request) {
  const loan = req.loan;
  const phraseKey: unknown = req.body?.phrase_key;
  if (!isOneOf(QUICK_REPLY_KEYS, phraseKey)) return refuse(400, 'Unknown quick reply');
  if (!QUICK_REPLY_STATUSES.includes(loan.status)) {
    return refuse(409, 'Quick replies are possible once the request is accepted');
  }
  const otherId = loan.borrower_id === req.user.id ? loan.lender_id : loan.borrower_id;
  await createMessage(loan, req.user.id, otherId, phraseKey);
  return reply(201, await loanDetailsView(loan.id, req.user.id));
}

// Resident asks their building's Group Admin for polite mediation on a stuck or disputed loan.
export async function askAdminHelp(req: Request) {
  const reasonKey: unknown = req.body?.reason_key;
  if (!isOneOf(DISPUTE_REASON_KEYS, reasonKey)) {
    return refuse(400, `reason_key must be one of: ${DISPUTE_REASON_KEYS.join(', ')}`);
  }
  if (req.loan.status !== 'active' && req.loan.status !== 'accepted' && req.loan.status !== 'returned') {
    return refuse(409, 'Only accepted, active, or returned loans can be flagged for admin help');
  }

  const flagged = await flagLoanForAdminHelp(req.groupId, req.loan.id, req.user.id, reasonKey);
  return reply(201, flagged);
}
