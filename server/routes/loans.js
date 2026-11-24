// Loans: a borrowing request and the conversation about it.
//   GET  /api/loans                   user          my loans: { borrowing: [...], lending: [...] }
//   POST /api/loans                   borrower      { item_id, start_at, end_at } → new pending loan
//   GET  /api/loans/:id               participant   the loan, its item, both people and the messages
//   POST /api/loans/:id/accept        lender        pending → accepted (item reserved)
//   POST /api/loans/:id/decline       lender        { reason: 'default' | 'busy' } pending → declined
//   POST /api/loans/:id/cancel        borrower      pending → cancelled
//   POST /api/loans/:id/handover      lender        photo (multipart) → the item's condition before
//   POST /api/loans/:id/received      borrower      accepted + handover photo → active (item lent)
//   POST /api/loans/:id/return        borrower      photo (multipart) → the item's condition after
//   POST /api/loans/:id/return-confirmed  lender    active + return photo → returned (item available)
//   POST /api/loans/:id/quick-reply   participant   { phrase_key } one of the five fixed quick replies
// Every step also sends the matching phrase to the other person (CLAUDE.md section 6).

import express from 'express';
import { DURATIONS, QUICK_REPLY_KEYS } from '../allowedKeys.js';
import { requireUser } from '../auth.js';
import { createMessage, db, declinePendingLoans, findOpenLoan, isTrusted, trustOf } from '../db.js';
import { receivePhoto, savePhoto } from '../photos.js';

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;
// Once the lender has said yes (the client shows the quick replies at the same moments).
const QUICK_REPLY_STATUSES = ['accepted', 'active', 'returned'];

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
    borrower_trust: viewerId === loan.lender_id ? trustOf(loan.borrower_id) : null, // only for the lender
    messages: messages.map((message) => ({ ...message, params: JSON.parse(message.params) })),
  };
}

// My loans from one side, newest first. As borrower the other person is the lender, and the other
// way round. `unread` counts the messages to me in that loan that I haven't seen yet.
function myLoans(myColumn, otherColumn, userId) {
  return db
    .prepare(
      `SELECT loans.id, loans.status, loans.start_at, loans.end_at, items.item_key, items.spot,
              other.nickname AS other_nickname, other.lang AS other_lang,
              (SELECT COUNT(*) FROM messages
                WHERE messages.loan_id = loans.id AND messages.to_user_id = ? AND messages.read_at IS NULL) AS unread
       FROM loans
       JOIN items ON items.id = loans.item_id
       JOIN users AS other ON other.id = loans.${otherColumn}
       WHERE loans.${myColumn} = ?
       ORDER BY loans.id DESC`
    )
    .all(userId, userId);
}

// Middleware for the /loans/:id routes: loads the loan into req.loan and checks that I am its
// 'lender', its 'borrower', or (for 'participant') either of them.
function loanRole(role) {
  return (req, res, next) => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const iAmLender = loan.lender_id === req.user.id;
    const iAmBorrower = loan.borrower_id === req.user.id;
    const allowed = role === 'lender' ? iAmLender : role === 'borrower' ? iAmBorrower : iAmLender || iAmBorrower;
    if (!allowed) {
      return res.status(403).json({ error: `Only the ${role} can do this` });
    }
    req.loan = loan;
    next();
  };
}

function setStatus(loanId, status) {
  db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(status, loanId);
}

function setItemStatus(itemId, status) {
  db.prepare('UPDATE items SET status = ? WHERE id = ?').run(status, itemId);
}

router.get('/loans', requireUser, (req, res) => {
  res.json({
    borrowing: myLoans('borrower_id', 'lender_id', req.user.id),
    lending: myLoans('lender_id', 'borrower_id', req.user.id),
  });
});

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
  // The picker ends with the evening of the day after tomorrow, which is always less than 3 days away.
  if (start > Date.now() + 3 * DAY) {
    return res.status(400).json({ error: 'start_at is too far in the future' });
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

router.get('/loans/:id', requireUser, loanRole('participant'), (req, res) => {
  res.json(loanDetails(req.loan.id, req.user.id));
});

// Yes: the item is reserved for this borrower, and everyone else who asked for it gets a polite no.
router.post('/loans/:id/accept', requireUser, loanRole('lender'), (req, res) => {
  const loan = req.loan;
  if (loan.status !== 'pending') {
    return res.status(409).json({ error: 'Only a waiting request can be accepted' });
  }
  if (Date.parse(loan.end_at) <= Date.now()) {
    return res.status(409).json({ error: 'The dates of this request are over' });
  }
  const item = db.prepare('SELECT status, removed_at FROM items WHERE id = ?').get(loan.item_id);
  if (item.status !== 'available' || item.removed_at) {
    return res.status(409).json({ error: 'The item is not available' });
  }

  const accept = db.transaction(() => {
    setStatus(loan.id, 'accepted');
    setItemStatus(loan.item_id, 'reserved');
    createMessage(loan, loan.lender_id, loan.borrower_id, 'accept');
    declinePendingLoans(loan.item_id, loan.id);
  });
  accept();
  res.json(loanDetails(loan.id, req.user.id));
});

// No (reason 'default'), or "No – I need it those days" (reason 'busy').
router.post('/loans/:id/decline', requireUser, loanRole('lender'), (req, res) => {
  const loan = req.loan;
  const reason = req.body?.reason ?? 'default';
  if (!['default', 'busy'].includes(reason)) {
    return res.status(400).json({ error: "reason must be 'default' or 'busy'" });
  }
  if (loan.status !== 'pending') {
    return res.status(409).json({ error: 'Only a waiting request can be declined' });
  }

  const decline = db.transaction(() => {
    setStatus(loan.id, 'declined');
    createMessage(loan, loan.lender_id, loan.borrower_id, reason === 'busy' ? 'declineBusy' : 'decline');
  });
  decline();
  res.json(loanDetails(loan.id, req.user.id));
});

// The borrower changes their mind (only while nobody has answered yet).
router.post('/loans/:id/cancel', requireUser, loanRole('borrower'), (req, res) => {
  const loan = req.loan;
  if (loan.status !== 'pending') {
    return res.status(409).json({ error: 'Only a waiting request can be cancelled' });
  }

  const cancel = db.transaction(() => {
    setStatus(loan.id, 'cancelled');
    createMessage(loan, loan.borrower_id, loan.lender_id, 'cancel');
  });
  cancel();
  res.json(loanDetails(loan.id, req.user.id));
});

// Handover, part 1: the lender's condition photo. (Uploads can be slow, so the loan is loaded and
// checked AFTER the photo has arrived: its status may have changed in the meantime.)
router.post('/loans/:id/handover', requireUser, receivePhoto, loanRole('lender'), (req, res) => {
  const loan = req.loan;
  if (loan.status !== 'accepted' || loan.handover_photo) {
    return res.status(409).json({ error: 'The handover photo is taken once, after accepting' });
  }

  const photo = savePhoto(req.file);
  const handOver = db.transaction(() => {
    db.prepare('UPDATE loans SET handover_photo = ? WHERE id = ?').run(photo, loan.id);
    createMessage(loan, loan.lender_id, loan.borrower_id, 'handoverPhoto');
  });
  handOver();
  res.json(loanDetails(loan.id, req.user.id));
});

// Handover, part 2: the borrower has the item. Now it is really lent.
router.post('/loans/:id/received', requireUser, loanRole('borrower'), (req, res) => {
  const loan = req.loan;
  if (loan.status !== 'accepted' || !loan.handover_photo) {
    return res.status(409).json({ error: 'Only possible after the handover photo' });
  }

  const receive = db.transaction(() => {
    setStatus(loan.id, 'active');
    setItemStatus(loan.item_id, 'lent');
    createMessage(loan, loan.borrower_id, loan.lender_id, 'received');
  });
  receive();
  res.json(loanDetails(loan.id, req.user.id));
});

// Return, part 1: the borrower's photo of the item they bring back.
router.post('/loans/:id/return', requireUser, receivePhoto, loanRole('borrower'), (req, res) => {
  const loan = req.loan;
  if (loan.status !== 'active' || loan.return_photo) {
    return res.status(409).json({ error: 'The return photo is taken once, while borrowing' });
  }

  const photo = savePhoto(req.file);
  const giveBack = db.transaction(() => {
    // This moment decides whether the return was on time, however slowly the lender confirms it.
    db.prepare('UPDATE loans SET return_photo = ?, returned_at = ? WHERE id = ?').run(
      photo,
      new Date().toISOString(),
      loan.id
    );
    createMessage(loan, loan.borrower_id, loan.lender_id, 'returned');
  });
  giveBack();
  res.json(loanDetails(loan.id, req.user.id));
});

// Return, part 2: the lender has it back, and it can be borrowed again.
router.post('/loans/:id/return-confirmed', requireUser, loanRole('lender'), (req, res) => {
  const loan = req.loan;
  if (loan.status !== 'active' || !loan.return_photo) {
    return res.status(409).json({ error: 'Only possible after the return photo' });
  }

  const confirmReturn = db.transaction(() => {
    setStatus(loan.id, 'returned');
    setItemStatus(loan.item_id, 'available');
    createMessage(loan, loan.lender_id, loan.borrower_id, 'returnConfirmed');
  });
  confirmReturn();
  res.json(loanDetails(loan.id, req.user.id));
});

// One of the five fixed quick replies, to the other person. Only these keys: never free text.
router.post('/loans/:id/quick-reply', requireUser, loanRole('participant'), (req, res) => {
  const loan = req.loan;
  const phraseKey = req.body?.phrase_key;
  if (!QUICK_REPLY_KEYS.includes(phraseKey)) {
    return res.status(400).json({ error: 'Unknown quick reply' });
  }
  if (!QUICK_REPLY_STATUSES.includes(loan.status)) {
    return res.status(409).json({ error: 'Quick replies are possible once the request is accepted' });
  }
  const otherId = loan.borrower_id === req.user.id ? loan.lender_id : loan.borrower_id;
  createMessage(loan, req.user.id, otherId, phraseKey);
  res.json(loanDetails(loan.id, req.user.id));
});

export default router;
