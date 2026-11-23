// Loans: borrowing request, lifecycle transitions, photos, polite ping, and quick replies.
//   GET  /api/loans                       user          my loans: { borrowing: [...], lending: [...] }
//   POST /api/loans                       borrower      { item_id, start_at, end_at } -> new pending loan
//   GET  /api/loans/:id                   participant   loan, item, both people, trust, and messages
//   POST /api/loans/:id/accept            lender        pending -> accepted (item reserved; declines others)
//   POST /api/loans/:id/decline           lender        { reason: 'default' | 'busy' } pending -> declined
//   POST /api/loans/:id/cancel            participant   pending (borrower) or accepted w/o photo (either) -> cancelled
//   POST /api/loans/:id/handover          lender        photo (multipart) -> condition before
//   POST /api/loans/:id/received          borrower      accepted + handover photo -> active (item lent)
//   POST /api/loans/:id/return            borrower      photo (multipart) -> condition after
//   POST /api/loans/:id/return-confirmed  lender        active + return photo -> returned (item available)
//   POST /api/loans/:id/ping              lender        active w/o return photo -> polite reminder (with cooldown)
//   POST /api/loans/:id/quick-reply       participant   { phrase_key } one of the five fixed quick replies

import express from 'express';
import { DURATIONS, ISSUE_KEYS, QUICK_REPLY_KEYS, STAMP_KEYS } from '../config/constants.js';
import { query, withTransaction } from '../db/pool.js';
import { requireUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  createMessage,
  declinePendingLoans,
  findOpenLoan,
  isTrusted,
  trustOf,
} from '../services/loans.js';
import { deletePhotoFile, receiveOptionalPhoto, receivePhoto, savePhoto } from '../services/photos.js';

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_ADVANCE_DAYS = 15; // allows selecting up to 14 days ahead across JST slots

const quickReplyLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyFn: (req) => `qr:${req.user?.id ?? req.ip}`,
});

const loanCreateLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  keyFn: (req) => `loan:${req.user?.id ?? req.ip}`,
});

function parsePositiveInt(raw) {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function pingCooldownMs() {
  return process.env.DEMO_MODE === 'true' ? 10_000 : 4 * HOUR_MS;
}

async function loanDetails(loanId, viewerId) {
  const loan = (await query('SELECT * FROM loans WHERE id = $1', [loanId])).rows[0];
  const item = (
    await query('SELECT id, item_key, max_days, spot, photo_url, status FROM items WHERE id = $1', [loan.item_id])
  ).rows[0];
  const peopleRes = await query('SELECT id, nickname, lang FROM users WHERE id = ANY($1::int[])', [
    [loan.borrower_id, loan.lender_id],
  ]);
  const byId = Object.fromEntries(peopleRes.rows.map((u) => [u.id, u]));

  const messagesRes = await query(
    `SELECT messages.id, messages.from_user_id, messages.to_user_id, messages.phrase_key,
            messages.params, messages.read_at, messages.created_at,
            sender.lang AS from_lang
     FROM messages
     LEFT JOIN users AS sender ON sender.id = messages.from_user_id
     WHERE messages.loan_id = $1 AND (messages.to_user_id = $2 OR messages.from_user_id = $2)
     ORDER BY messages.created_at, messages.id`,
    [loanId, viewerId]
  );

  return {
    loan,
    item: { ...item, photo_url: item.photo_url ?? null },
    borrower: byId[loan.borrower_id],
    lender: byId[loan.lender_id],
    borrower_trust: viewerId === loan.lender_id ? await trustOf(loan.borrower_id) : null,
    messages: messagesRes.rows.map((m) => ({
      ...m,
      params: typeof m.params === 'string' ? JSON.parse(m.params) : m.params,
    })),
  };
}

async function myLoans(myColumn, otherColumn, userId) {
  const res = await query(
    `SELECT loans.id, loans.status, loans.start_at, loans.end_at, items.item_key, items.spot, items.photo_url,
            other.nickname AS other_nickname, other.lang AS other_lang,
            (SELECT COUNT(*)::int FROM messages
              WHERE messages.loan_id = loans.id AND messages.to_user_id = $1 AND messages.read_at IS NULL) AS unread
     FROM loans
     JOIN items ON items.id = loans.item_id
     JOIN users AS other ON other.id = loans.${otherColumn}
     WHERE loans.${myColumn} = $1
     ORDER BY loans.id DESC`,
    [userId]
  );
  return res.rows;
}

function loanRole(role) {
  return async (req, res, next) => {
    const loanId = parsePositiveInt(req.params.id);
    if (!loanId) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const loan = (await query('SELECT * FROM loans WHERE id = $1', [loanId])).rows[0];
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

router.get('/loans', requireUser, async (req, res) => {
  const [borrowing, lending] = await Promise.all([
    myLoans('borrower_id', 'lender_id', req.user.id),
    myLoans('lender_id', 'borrower_id', req.user.id),
  ]);
  res.json({ borrowing, lending });
});

router.post('/loans', requireUser, loanCreateLimiter, async (req, res) => {
  const { item_id, start_at, end_at } = req.body ?? {};
  const itemId = parsePositiveInt(item_id);
  if (!itemId) {
    return res.status(400).json({ error: 'item_id must be a number' });
  }

  const start = typeof start_at === 'string' ? Date.parse(start_at) : NaN;
  const end = typeof end_at === 'string' ? Date.parse(end_at) : NaN;
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return res.status(400).json({ error: 'start_at and end_at must be ISO dates' });
  }
  const now = Date.now();
  if (start < now - HOUR_MS) {
    return res.status(400).json({ error: 'start_at is in the past' });
  }
  if (start > now + MAX_ADVANCE_DAYS * DAY_MS) {
    return res.status(400).json({ error: 'start_at must be within the next 14 days' });
  }

  const outcome = await withTransaction(async (client) => {
    const itemRes = await query(
      'SELECT * FROM items WHERE id = $1 AND removed_at IS NULL FOR UPDATE',
      [itemId],
      client
    );
    const item = itemRes.rows[0];
    if (!item) return { status: 404, body: { error: 'Item not found' } };
    if (item.group_id !== req.user.group_id) return { status: 403, body: { error: 'Not in your neighborhood' } };
    if (item.owner_id === req.user.id) return { status: 403, body: { error: "You can't borrow your own item" } };

    const openLoan = await findOpenLoan(item.id, req.user.id, client);
    if (openLoan) {
      return { status: 409, body: { error: 'You already asked for this item', loan_id: openLoan.id } };
    }
    if (item.status !== 'available') {
      return { status: 409, body: { error: 'This item is not available right now' } };
    }
    if (item.paused) {
      return { status: 409, body: { error: 'This item is temporarily paused by its owner' } };
    }
    if (item.trusted_only && !(await isTrusted(req.user.id, client))) {
      return { status: 403, body: { error: 'Only for neighbors who have returned something on time' } };
    }

    const days = (end - start) / DAY_MS;
    if (!DURATIONS.includes(days) || days > item.max_days) {
      return {
        status: 400,
        body: { error: `The loan must last 1, 2, 3 or 7 days, at most ${item.max_days}` },
      };
    }

    const insertRes = await query(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [item.id, req.user.id, item.owner_id, new Date(start).toISOString(), new Date(end).toISOString()],
      client
    );
    const loan = insertRes.rows[0];
    await createMessage(loan, req.user.id, item.owner_id, 'request', client);
    return { status: 201, loanId: loan.id };
  });

  if (outcome.status !== 201) {
    return res.status(outcome.status).json(outcome.body);
  }
  res.status(201).json(await loanDetails(outcome.loanId, req.user.id));
});

router.get('/loans/:id', requireUser, loanRole('participant'), async (req, res) => {
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/accept', requireUser, loanRole('lender'), async (req, res) => {
  const outcome = await withTransaction(async (client) => {
    // Lock item before loan to match DELETE /api/items/:id and POST /api/leave lock ordering (prevents AB/BA deadlocks).
    const item = (
      await query('SELECT status, removed_at FROM items WHERE id = $1 FOR UPDATE', [req.loan.item_id], client)
    ).rows[0];
    const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
    if (loan.status !== 'pending') {
      return { status: 409, error: 'Only a waiting request can be accepted' };
    }
    if (!item || item.status !== 'available' || item.removed_at) {
      return { status: 409, error: 'The item is not available' };
    }

    await query("UPDATE loans SET status = 'accepted' WHERE id = $1", [loan.id], client);
    await query("UPDATE items SET status = 'reserved' WHERE id = $1", [loan.item_id], client);
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'accept', client);
    await declinePendingLoans(loan.item_id, loan.id, client);
    return { status: 200 };
  });

  if (outcome.status !== 200) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/decline', requireUser, loanRole('lender'), async (req, res) => {
  const reason = req.body?.reason ?? 'default';
  if (!['default', 'busy'].includes(reason)) {
    return res.status(400).json({ error: "reason must be 'default' or 'busy'" });
  }

  const outcome = await withTransaction(async (client) => {
    const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
    if (loan.status !== 'pending') {
      return { status: 409, error: 'Only a waiting request can be declined' };
    }
    await query("UPDATE loans SET status = 'declined' WHERE id = $1", [loan.id], client);
    await createMessage(loan, loan.lender_id, loan.borrower_id, reason === 'busy' ? 'declineBusy' : 'decline', client);
    return { status: 200 };
  });

  if (outcome.status !== 200) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

// Pending requests can be cancelled by the borrower; accepted loans (before handover photo)
// can be cancelled by either participant, releasing the item back to 'available'.
router.post('/loans/:id/cancel', requireUser, loanRole('participant'), async (req, res) => {
  const outcome = await withTransaction(async (client) => {
    // Lock item before loan to prevent AB/BA deadlocks with item deletion/leave.
    await query('SELECT id FROM items WHERE id = $1 FOR UPDATE', [req.loan.item_id], client);
    const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
    const iAmBorrower = loan.borrower_id === req.user.id;

    if (loan.status === 'pending') {
      if (!iAmBorrower) {
        return { status: 403, error: 'Only the borrower can cancel a waiting request' };
      }
      await query("UPDATE loans SET status = 'cancelled' WHERE id = $1", [loan.id], client);
      await createMessage(loan, loan.borrower_id, loan.lender_id, 'cancel', client);
      return { status: 200 };
    }

    if (loan.status === 'accepted' && !loan.handover_photo) {
      await query("UPDATE loans SET status = 'cancelled' WHERE id = $1", [loan.id], client);
      await query("UPDATE items SET status = 'available' WHERE id = $1", [loan.item_id], client);
      const otherId = iAmBorrower ? loan.lender_id : loan.borrower_id;
      await createMessage(loan, req.user.id, otherId, 'cancel', client);
      return { status: 200 };
    }

    return { status: 409, error: 'Only a waiting request or an accepted loan before handover can be cancelled' };
  });

  if (outcome.status !== 200) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/handover', requireUser, loanRole('lender'), quickReplyLimiter, receivePhoto, async (req, res) => {
  if (req.loan.status !== 'accepted' || req.loan.handover_photo) {
    return res.status(409).json({ error: 'The handover photo is taken once, after accepting' });
  }

  const photo = await savePhoto(req.file);
  try {
    const outcome = await withTransaction(async (client) => {
      const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
      if (loan.status !== 'accepted' || loan.handover_photo) {
        return { status: 409, error: 'The handover photo is taken once, after accepting' };
      }
      await query('UPDATE loans SET handover_photo = $1 WHERE id = $2', [photo, loan.id], client);
      await createMessage(loan, loan.lender_id, loan.borrower_id, 'handoverPhoto', client);
      return { status: 200 };
    });
    if (outcome.status !== 200) {
      await deletePhotoFile(photo);
      return res.status(outcome.status).json({ error: outcome.error });
    }
  } catch (error) {
    await deletePhotoFile(photo);
    throw error;
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/received', requireUser, loanRole('borrower'), async (req, res) => {
  const outcome = await withTransaction(async (client) => {
    const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
    if (loan.status !== 'accepted' || !loan.handover_photo) {
      return { status: 409, error: 'Only possible after the handover photo' };
    }
    await query("UPDATE loans SET status = 'active' WHERE id = $1", [loan.id], client);
    await query("UPDATE items SET status = 'lent' WHERE id = $1", [loan.item_id], client);
    await createMessage(loan, loan.borrower_id, loan.lender_id, 'received', client);
    return { status: 200 };
  });

  if (outcome.status !== 200) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/return', requireUser, loanRole('borrower'), quickReplyLimiter, receivePhoto, async (req, res) => {
  if (req.loan.status !== 'active' || req.loan.return_photo) {
    return res.status(409).json({ error: 'The return photo is taken once, while borrowing' });
  }

  const photo = await savePhoto(req.file);
  try {
    const outcome = await withTransaction(async (client) => {
      const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
      if (loan.status !== 'active' || loan.return_photo) {
        return { status: 409, error: 'The return photo is taken once, while borrowing' };
      }
      await query('UPDATE loans SET return_photo = $1, returned_at = NOW() WHERE id = $2', [photo, loan.id], client);
      await createMessage(loan, loan.borrower_id, loan.lender_id, 'returned', client);
      return { status: 200 };
    });
    if (outcome.status !== 200) {
      await deletePhotoFile(photo);
      return res.status(outcome.status).json({ error: outcome.error });
    }
  } catch (error) {
    await deletePhotoFile(photo);
    throw error;
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/return-confirmed', requireUser, loanRole('lender'), async (req, res) => {
  const outcome = await withTransaction(async (client) => {
    const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
    if (loan.status !== 'active' || !loan.return_photo) {
      return { status: 409, error: 'Only possible after the return photo' };
    }
    await query("UPDATE loans SET status = 'returned' WHERE id = $1", [loan.id], client);
    await query("UPDATE items SET status = 'available' WHERE id = $1", [loan.item_id], client);
    await createMessage(loan, loan.lender_id, loan.borrower_id, 'returnConfirmed', client);
    return { status: 200 };
  });

  if (outcome.status !== 200) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

// Lender polite nudge for active loans without a return photo, guarded by per-loan cooldown.
router.post('/loans/:id/ping', requireUser, loanRole('lender'), async (req, res) => {
  const cooldown = pingCooldownMs();
  const outcome = await withTransaction(async (client) => {
    const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
    if (loan.status !== 'active' || loan.return_photo) {
      return { status: 409, body: { error: 'You can only send a reminder while the item is lent out' } };
    }

    if (loan.last_pinged_at) {
      const elapsed = Date.now() - Date.parse(loan.last_pinged_at);
      if (elapsed < cooldown) {
        const retryAfter = Math.max(1, Math.ceil((cooldown - elapsed) / 1000));
        return {
          status: 429,
          body: { error: 'Please wait before sending another reminder', retry_after_seconds: retryAfter },
        };
      }
    }

    const phraseKey = Date.now() > Date.parse(loan.end_at) ? 'pingOverdue' : 'pingNeedBack';
    await query('UPDATE loans SET last_pinged_at = NOW() WHERE id = $1', [loan.id], client);
    await createMessage(loan, loan.lender_id, loan.borrower_id, phraseKey, client);
    return { status: 200 };
  });

  if (outcome.status !== 200) {
    if (outcome.status === 429) {
      res.setHeader('Retry-After', String(outcome.body.retry_after_seconds));
    }
    return res.status(outcome.status).json(outcome.body);
  }
  res.json(await loanDetails(req.loan.id, req.user.id));
});

router.post('/loans/:id/quick-reply', requireUser, quickReplyLimiter, loanRole('participant'), async (req, res) => {
  const loan = req.loan;
  const phraseKey = req.body?.phrase_key;
  if (!QUICK_REPLY_KEYS.includes(phraseKey)) {
    return res.status(400).json({ error: 'Unknown quick reply' });
  }
  const otherId = loan.borrower_id === req.user.id ? loan.lender_id : loan.borrower_id;
  await createMessage(loan, req.user.id, otherId, phraseKey);
  res.json(await loanDetails(loan.id, req.user.id));
});

// Structured issue/damage report on an active or returned loan (optional photo, zero free text).
router.post(
  '/loans/:id/issue',
  requireUser,
  loanRole('participant'),
  quickReplyLimiter,
  receiveOptionalPhoto,
  async (req, res) => {
    const issueKey = req.body?.issue_key;
    if (!ISSUE_KEYS.includes(issueKey)) {
      return res.status(400).json({ error: 'Unknown issue type' });
    }
    if (req.loan.status !== 'active' && req.loan.status !== 'returned') {
      return res.status(409).json({ error: 'Issues can only be reported on active or returned loans' });
    }

    const photo = req.file ? await savePhoto(req.file) : null;
    try {
      await withTransaction(async (client) => {
        const loan = (await query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [req.loan.id], client)).rows[0];
        if (photo) {
          await query('UPDATE loans SET issue_photo = $1 WHERE id = $2', [photo, loan.id], client);
        }
        const otherId = loan.borrower_id === req.user.id ? loan.lender_id : loan.borrower_id;
        await createMessage(loan, req.user.id, otherId, issueKey, client, photo ? { photo } : {});
      });
    } catch (error) {
      if (photo) await deletePhotoFile(photo);
      throw error;
    }
    res.json(await loanDetails(req.loan.id, req.user.id));
  }
);

// Warm neighborly thank-you stamp on a completed (returned) loan.
router.post('/loans/:id/stamp', requireUser, quickReplyLimiter, loanRole('participant'), async (req, res) => {
  const stampKey = req.body?.stamp_key;
  if (!STAMP_KEYS.includes(stampKey)) {
    return res.status(400).json({ error: 'Unknown thank-you stamp' });
  }
  if (req.loan.status !== 'returned') {
    return res.status(409).json({ error: 'Thank-you stamps can only be sent after return is confirmed' });
  }
  const otherId = req.loan.borrower_id === req.user.id ? req.loan.lender_id : req.loan.borrower_id;
  await createMessage(req.loan, req.user.id, otherId, stampKey);
  res.json(await loanDetails(req.loan.id, req.user.id));
});

export default router;
