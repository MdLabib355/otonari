// Resident group lookup, join (+ approval & dup-nickname guard), device transfer/restore,
// profile (/api/me), group stats, and safe leaving.

import crypto from 'node:crypto';
import express from 'express';
import { LANGUAGES } from '../config/constants.js';
import { afterCommit, query, withTransaction } from '../db/pool.js';
import { requireResidentAnyStatus, requireUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { disconnectUser } from '../services/events.js';
import { createMessage, declinePendingLoans, getMe } from '../services/loans.js';
import { consumeTransferCode, createTransferCode } from '../services/transfer.js';

const router = express.Router();

const lookupLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const joinLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });
const restoreLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });
const transferLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 10,
  keyFn: (req) => `transfer:${req.user?.id ?? req.ip}`,
});

async function findGroupByCode(code, client = null) {
  const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!cleanCode) return undefined;
  const res = await query('SELECT * FROM groups WHERE code = $1', [cleanCode], client);
  return res.rows[0];
}

router.get('/groups/by-code/:code', lookupLimiter, async (req, res) => {
  const group = await findGroupByCode(req.params.code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const countRes = await query(
    "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND left_at IS NULL AND status = 'approved'",
    [group.id]
  );
  res.json({
    name: group.name,
    type: group.type,
    city: group.city,
    require_approval: Boolean(group.require_approval),
    memberCount: countRes.rows[0].count,
  });
});

router.post('/join', joinLimiter, async (req, res) => {
  const { code, nickname, lang, manager_note } = req.body ?? {};

  const group = await findGroupByCode(code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';
  if (cleanNickname.length < 1 || cleanNickname.length > 20) {
    return res.status(400).json({ error: 'Nickname must be 1 to 20 characters' });
  }
  if (!LANGUAGES.includes(lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }
  let cleanNote = null;
  if (manager_note !== undefined && manager_note !== null) {
    if (typeof manager_note !== 'string') {
      return res.status(400).json({ error: 'manager_note must be text' });
    }
    const trimmedNote = manager_note.trim();
    if (trimmedNote.length > 40) {
      return res.status(400).json({ error: 'manager_note must be at most 40 characters' });
    }
    cleanNote = trimmedNote || null;
  }

  const initialStatus = group.require_approval ? 'pending' : 'approved';
  const token = crypto.randomUUID();

  let insertRes;
  try {
    insertRes = await query(
      `INSERT INTO users (group_id, nickname, lang, token, status, manager_note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [group.id, cleanNickname, lang, token, initialStatus, cleanNote]
    );
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That nickname is already used in this neighborhood' });
    }
    throw error;
  }
  const me = await getMe(insertRes.rows[0].id);
  res.status(201).json({ token, ...me });
});

router.post('/restore', restoreLimiter, async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Transfer code is required' });
  }
  const restored = await consumeTransferCode(code);
  if (!restored) {
    return res.status(404).json({ error: 'Transfer code is invalid or expired' });
  }
  res.json({ token: restored.token, user: restored.user, group: restored.group });
});

router.post('/me/transfer-code', requireUser, transferLimiter, async (req, res) => {
  const codeInfo = await createTransferCode(req.user.id, { rotateToken: false });
  res.status(201).json(codeInfo);
});

router.get('/me', requireResidentAnyStatus, async (req, res) => {
  res.json(await getMe(req.user.id));
});

router.get('/group/stats', requireUser, async (req, res) => {
  const groupId = req.user.group_id;
  const [membersRes, itemsRes, loansRes] = await Promise.all([
    query(
      "SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND left_at IS NULL AND status = 'approved'",
      [groupId]
    ),
    query('SELECT COUNT(*)::int AS count FROM items WHERE group_id = $1 AND removed_at IS NULL', [groupId]),
    query(
      `SELECT COUNT(*)::int AS completed_loans,
              COUNT(CASE WHEN b.lang <> l.lang THEN 1 END)::int AS cross_language_loans
       FROM loans
       JOIN items ON items.id = loans.item_id
       JOIN users AS b ON b.id = loans.borrower_id
       JOIN users AS l ON l.id = loans.lender_id
       WHERE items.group_id = $1 AND loans.status = 'returned'`,
      [groupId]
    ),
  ]);
  res.json({
    members: membersRes.rows[0].count,
    items: itemsRes.rows[0].count,
    completed_loans: loansRes.rows[0].completed_loans,
    cross_language_loans: loansRes.rows[0].cross_language_loans,
  });
});

router.patch('/me', requireResidentAnyStatus, async (req, res) => {
  const { lang, elder_mode } = req.body ?? {};

  if (lang !== undefined && !LANGUAGES.includes(lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }
  if (elder_mode !== undefined && ![true, false, 0, 1].includes(elder_mode)) {
    return res.status(400).json({ error: 'elder_mode must be true or false' });
  }

  if (lang !== undefined) {
    await query('UPDATE users SET lang = $1 WHERE id = $2', [lang, req.user.id]);
  }
  if (elder_mode !== undefined) {
    await query('UPDATE users SET elder_mode = $1 WHERE id = $2', [Boolean(elder_mode), req.user.id]);
  }
  res.json(await getMe(req.user.id));
});

router.post('/leave', requireResidentAnyStatus, async (req, res) => {
  const myId = req.user.id;
  const blocked = await withTransaction(async (client) => {
    const openLoan = await query(
      `SELECT id FROM loans
       WHERE (borrower_id = $1 OR lender_id = $1) AND status IN ('accepted', 'active')
       LIMIT 1`,
      [myId],
      client
    );
    if (openLoan.rows.length > 0) {
      return true;
    }

    const itemsRes = await query(
      `SELECT id FROM items
       WHERE owner_id = $1 AND status = 'available' AND removed_at IS NULL
       FOR UPDATE`,
      [myId],
      client
    );
    for (const item of itemsRes.rows) {
      await query('UPDATE items SET removed_at = NOW() WHERE id = $1', [item.id], client);
      await declinePendingLoans(item.id, null, client);
    }

    const requestsRes = await query(
      "SELECT * FROM loans WHERE borrower_id = $1 AND status = 'pending' FOR UPDATE",
      [myId],
      client
    );
    for (const loan of requestsRes.rows) {
      await query("UPDATE loans SET status = 'cancelled' WHERE id = $1", [loan.id], client);
      await createMessage(loan, myId, loan.lender_id, 'cancel', client);
    }

    await query('DELETE FROM push_subscriptions WHERE user_id = $1', [myId], client);
    await query('DELETE FROM transfer_codes WHERE user_id = $1 AND used_at IS NULL', [myId], client);
    await query('UPDATE users SET left_at = NOW() WHERE id = $1', [myId], client);
    afterCommit(client, () => disconnectUser(myId));
    return false;
  });

  if (blocked) {
    return res.status(409).json({ error: 'Please finish your current loans first' });
  }
  res.status(204).end();
});

export default router;
