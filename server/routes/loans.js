// Loans: a borrowing request and the conversation about it.
//   POST /api/loans       borrower      { item_id, start_at, end_at } → new pending loan,
//                                       and the 'request' phrase goes to the lender
//   GET  /api/loans/:id   participant   the loan, its item, both people and the messages

import express from 'express';
import { DURATIONS } from '../allowedKeys.js';
import { requireUser } from '../auth.js';
import { createMessage, db } from '../db.js';

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;

// Everything the loan page needs. The viewer sees what they sent, what was sent to them, and their
// own reminders; a reminder meant for the other person stays hidden.
function loanDetails(loanId, viewerId) {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
  const item = db.prepare('SELECT id, item_key, max_days, spot, status FROM items WHERE id = ?').get(loan.item_id);
  const person = (userId) => db.prepare('SELECT id, nickname, lang FROM users WHERE id = ?').get(userId);
  const messages = db
    .prepare(
      `SELECT messages.id, messages.from_user_id, messages.to_user_id, messages.phrase_key,
              messages.params, messages.read_at, messages.created_at,
              sender.lang AS from_lang  -- for "Show original" (NULL for system reminders)
       FROM messages LEFT JOIN users AS sender ON sender.id = messages.from_user_id
       WHERE messages.loan_id = ? AND (messages.to_user_id = ? OR messages.from_user_id = ?)
       ORDER BY messages.created_at, messages.id`
    )
    .all(loanId, viewerId, viewerId);

  return {
    loan,
    item,
    borrower: person(loan.borrower_id),
    lender: person(loan.lender_id),
    messages: messages.map((message) => ({ ...message, params: JSON.parse(message.params) })),
  };
}

router.post('/loans', requireUser, (req, res) => {
  const { item_id, start_at, end_at } = req.body ?? {};

  const itemId = Number(item_id);
  if (!Number.isInteger(itemId)) {
    return res.status(400).json({ error: 'item_id must be a number' });
  }
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND removed_at IS NULL').get(itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.group_id !== req.user.group_id) {
    return res.status(403).json({ error: 'Not in your neighborhood' });
  }
  if (item.owner_id === req.user.id) {
    return res.status(403).json({ error: "You can't borrow your own item" });
  }
  if (item.status !== 'available') {
    return res.status(409).json({ error: 'This item is not available right now' });
  }

  // The tap-only picker always asks for whole days (1, 2, 3 or 7), never more than the owner allows,
  // starting at a time that is not over yet (one hour of slack for slow taps).
  const start = typeof start_at === 'string' ? Date.parse(start_at) : NaN;
  const end = typeof end_at === 'string' ? Date.parse(end_at) : NaN;
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return res.status(400).json({ error: 'start_at and end_at must be ISO dates' });
  }
  const days = (end - start) / DAY;
  if (!DURATIONS.includes(days) || days > item.max_days) {
    return res.status(400).json({ error: `The loan must last 1, 2, 3 or 7 days, at most ${item.max_days}` });
  }
  if (start < Date.now() - 60 * 60 * 1000) {
    return res.status(400).json({ error: 'start_at is in the past' });
  }

  const createLoan = db.transaction(() => {
    const loanId = db
      .prepare('INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at) VALUES (?, ?, ?, ?, ?)')
      .run(item.id, req.user.id, item.owner_id, new Date(start).toISOString(), new Date(end).toISOString())
      .lastInsertRowid;
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
    createMessage(loan, req.user.id, item.owner_id, 'request');
    return loanId;
  });
  const loanId = createLoan();
  res.status(201).json(loanDetails(loanId, req.user.id));
});

router.get('/loans/:id', requireUser, (req, res) => {
  const loan = db.prepare('SELECT id, borrower_id, lender_id FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) {
    return res.status(404).json({ error: 'Loan not found' });
  }
  if (loan.borrower_id !== req.user.id && loan.lender_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your loan' });
  }
  res.json(loanDetails(loan.id, req.user.id));
});

export default router;
