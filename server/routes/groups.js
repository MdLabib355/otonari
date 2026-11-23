// Starting, joining and leaving a neighborhood group, and reading / changing "me".
//   GET   /api/groups/by-code/:code   anyone   group preview for the join screen and the poster
//   POST  /api/groups                 anyone   { name, type, city, create_anyway? } -> new group + join code
//   POST  /api/join                   anyone   { code, nickname, lang } -> { token, user, group }
//   GET   /api/me                     user     -> { user, group }
//   PATCH /api/me                     user     { lang?, elder_mode? } -> { user, group }
//   POST  /api/leave                  user     leave the group (blocked while accepted/active loan exists)

import crypto from 'node:crypto';
import express from 'express';
import { GROUP_TYPES, LANGUAGES } from '../config/constants.js';
import { query, withTransaction } from '../db/pool.js';
import { requireUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createMessage, declinePendingLoans, getMe } from '../services/loans.js';

const router = express.Router();

// Join codes exclude I, L, O, 0, and 1 to avoid ambiguity when reading from a printed poster.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const lookupLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const createGroupLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });
const joinLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });

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
    'SELECT COUNT(*)::int AS count FROM users WHERE group_id = $1 AND left_at IS NULL',
    [group.id]
  );
  res.json({ name: group.name, type: group.type, city: group.city, memberCount: countRes.rows[0].count });
});

async function newJoinCode(client = null) {
  let code;
  do {
    let chars = '';
    while (chars.length < 8) chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  } while (await findGroupByCode(code, client));
  return code;
}

// NFKC normalizes full-width Japanese characters (e.g. "３丁目" -> "3丁目") for duplicate checks.
function simplified(text) {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

async function findSimilarGroup(name, city) {
  const res = await query('SELECT name, city FROM groups');
  return res.rows.find(
    (group) => simplified(group.city) === simplified(city) && simplified(group.name) === simplified(name)
  );
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

router.post('/groups', createGroupLimiter, async (req, res) => {
  const { type, create_anyway } = req.body ?? {};
  const name = trimmed(req.body?.name);
  const city = trimmed(req.body?.city);

  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return res.status(400).json({ error: 'The name must be 1 to 60 characters, the city 1 to 40' });
  }
  if (!GROUP_TYPES.includes(type)) {
    return res.status(400).json({ error: "type must be 'building' or 'block'" });
  }

  // Return only the similar group's name, never its code.
  const similar = await findSimilarGroup(name, city);
  if (similar && create_anyway !== true) {
    return res.status(409).json({ error: 'There is a similar group in this city', existing_name: similar.name });
  }

  const code = await newJoinCode();
  await query('INSERT INTO groups (code, name, type, city) VALUES ($1, $2, $3, $4)', [code, name, type, city]);
  res.status(201).json({ code, name, type, city });
});

router.post('/join', joinLimiter, async (req, res) => {
  const { code, nickname, lang } = req.body ?? {};

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

  const token = crypto.randomUUID();
  const insertRes = await query(
    'INSERT INTO users (group_id, nickname, lang, token) VALUES ($1, $2, $3, $4) RETURNING id',
    [group.id, cleanNickname, lang, token]
  );
  const me = await getMe(insertRes.rows[0].id);
  res.status(201).json({ token, ...me });
});

router.get('/me', requireUser, async (req, res) => {
  res.json(await getMe(req.user.id));
});

router.patch('/me', requireUser, async (req, res) => {
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

router.post('/leave', requireUser, async (req, res) => {
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

    await query('UPDATE users SET left_at = NOW() WHERE id = $1', [myId], client);
    return false;
  });

  if (blocked) {
    return res.status(409).json({ error: 'Please finish your current loans first' });
  }
  res.status(204).end();
});

export default router;
