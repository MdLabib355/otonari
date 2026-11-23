// The neighborhood shelf and managing my own items.
//   GET    /api/shelf       user    every item on my group's shelf, with owner's nickname, paused & photo_url
//   GET    /api/my-items    user    my own items
//   GET    /api/items/:id   user    one item of my group, with owner info, my_loan_id, allowed_for_me
//   POST   /api/items       user    JSON or multipart { item_key, max_days, spot, trusted_only?, photo? }
//   PATCH  /api/items/:id   owner   { trusted_only?, max_days?, spot?, paused? }
//   DELETE /api/items/:id   owner   soft-delete from shelf (not while reserved or lent)

import express from 'express';
import { DURATIONS, ITEM_KEYS, SPOT_KEYS } from '../config/constants.js';
import { query, withTransaction } from '../db/pool.js';
import { requireUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { declinePendingLoans, findOpenLoan, isTrusted } from '../services/loans.js';
import { deletePhotoFile, receiveOptionalPhoto, savePhoto } from '../services/photos.js';

const router = express.Router();
const MAX_ACTIVE_ITEMS_PER_USER = 50;

const itemCreateLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 20,
  keyFn: (req) => `item:${req.user?.id ?? req.ip}`,
});

function parsePositiveInt(raw) {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function parseOptionalBoolean(raw, defaultValue) {
  if (raw === undefined) return defaultValue;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function publicItem(item) {
  return {
    ...item,
    trusted_only: Boolean(item.trusted_only),
    paused: Boolean(item.paused),
    photo_url: item.photo_url ?? null,
  };
}

router.get('/shelf', requireUser, async (req, res) => {
  const result = await query(
    `SELECT items.id, items.item_key, items.max_days, items.spot, items.trusted_only,
            items.paused, items.photo_url, items.status, items.owner_id,
            users.nickname AS owner_nickname
     FROM items
     JOIN users ON users.id = items.owner_id
     WHERE items.group_id = $1 AND items.removed_at IS NULL
     ORDER BY items.id`,
    [req.user.group_id]
  );
  res.json(result.rows.map(publicItem));
});

router.get('/my-items', requireUser, async (req, res) => {
  const result = await query(
    `SELECT id, item_key, max_days, spot, trusted_only, paused, photo_url, status
     FROM items
     WHERE owner_id = $1 AND removed_at IS NULL
     ORDER BY id`,
    [req.user.id]
  );
  res.json(result.rows.map(publicItem));
});

router.get('/items/:id', requireUser, async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(404).json({ error: 'Item not found' });
  }
  const result = await query(
    `SELECT items.id, items.group_id, items.item_key, items.max_days, items.spot,
            items.trusted_only, items.paused, items.photo_url, items.status, items.owner_id,
            users.nickname AS owner_nickname, users.lang AS owner_lang
     FROM items
     JOIN users ON users.id = items.owner_id
     WHERE items.id = $1 AND items.removed_at IS NULL`,
    [itemId]
  );
  const item = result.rows[0];
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.group_id !== req.user.group_id) {
    return res.status(403).json({ error: 'Not in your neighborhood' });
  }
  const [openLoan, trusted] = await Promise.all([
    findOpenLoan(item.id, req.user.id),
    item.trusted_only ? isTrusted(req.user.id) : Promise.resolve(true),
  ]);
  res.json({
    ...publicItem(item),
    my_loan_id: openLoan?.id ?? null,
    allowed_for_me: !item.trusted_only || trusted,
  });
});

router.post('/items', requireUser, itemCreateLimiter, receiveOptionalPhoto, async (req, res) => {
  const body = req.body ?? {};
  const itemKey = body.item_key;
  const maxDays = typeof body.max_days === 'string' ? Number(body.max_days) : body.max_days;
  const spot = body.spot;
  const trustedOnly = parseOptionalBoolean(body.trusted_only, false);

  if (!ITEM_KEYS.includes(itemKey)) {
    return res.status(400).json({ error: 'Unknown item' });
  }
  if (!Number.isInteger(maxDays) || !DURATIONS.includes(maxDays)) {
    return res.status(400).json({ error: `max_days must be one of ${DURATIONS.join(', ')}` });
  }
  if (!SPOT_KEYS.includes(spot)) {
    return res.status(400).json({ error: 'Unknown handover spot' });
  }
  if (trustedOnly === null) {
    return res.status(400).json({ error: 'trusted_only must be true or false' });
  }

  const countRes = await query(
    'SELECT COUNT(*)::int AS count FROM items WHERE owner_id = $1 AND removed_at IS NULL',
    [req.user.id]
  );
  if (countRes.rows[0].count >= MAX_ACTIVE_ITEMS_PER_USER) {
    return res.status(409).json({ error: `Maximum ${MAX_ACTIVE_ITEMS_PER_USER} active items per neighbor` });
  }

  let photoUrl = null;
  if (req.file) {
    photoUrl = await savePhoto(req.file);
  }

  try {
    const insertRes = await query(
      `INSERT INTO items (owner_id, group_id, item_key, max_days, spot, trusted_only, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, item_key, max_days, spot, trusted_only, paused, photo_url, status`,
      [req.user.id, req.user.group_id, itemKey, maxDays, spot, trustedOnly, photoUrl]
    );
    res.status(201).json(publicItem(insertRes.rows[0]));
  } catch (error) {
    if (photoUrl) await deletePhotoFile(photoUrl);
    throw error;
  }
});

router.patch('/items/:id', requireUser, async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  const { trusted_only, max_days, spot, paused } = req.body ?? {};

  if (
    trusted_only === undefined &&
    max_days === undefined &&
    spot === undefined &&
    paused === undefined
  ) {
    return res.status(400).json({ error: 'Provide at least one field to update' });
  }
  if (trusted_only !== undefined && typeof trusted_only !== 'boolean') {
    return res.status(400).json({ error: 'trusted_only must be true or false' });
  }
  if (paused !== undefined && typeof paused !== 'boolean') {
    return res.status(400).json({ error: 'paused must be true or false' });
  }
  if (max_days !== undefined && (!Number.isInteger(max_days) || !DURATIONS.includes(max_days))) {
    return res.status(400).json({ error: `max_days must be one of ${DURATIONS.join(', ')}` });
  }
  if (spot !== undefined && !SPOT_KEYS.includes(spot)) {
    return res.status(400).json({ error: 'Unknown handover spot' });
  }

  if (!itemId) {
    return res.status(404).json({ error: 'Item not found' });
  }
  const result = await query('SELECT * FROM items WHERE id = $1 AND removed_at IS NULL', [itemId]);
  const item = result.rows[0];
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your item' });
  }

  const nextTrusted = trusted_only ?? item.trusted_only;
  const nextMaxDays = max_days ?? item.max_days;
  const nextSpot = spot ?? item.spot;
  const nextPaused = paused ?? item.paused;

  await query(
    `UPDATE items
     SET trusted_only = $1, max_days = $2, spot = $3, paused = $4
     WHERE id = $5`,
    [nextTrusted, nextMaxDays, nextSpot, nextPaused, item.id]
  );
  res.status(204).end();
});

router.delete('/items/:id', requireUser, async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const outcome = await withTransaction(async (client) => {
    const result = await query(
      'SELECT * FROM items WHERE id = $1 AND removed_at IS NULL FOR UPDATE',
      [itemId],
      client
    );
    const item = result.rows[0];
    if (!item) return { status: 404, error: 'Item not found' };
    if (item.owner_id !== req.user.id) return { status: 403, error: 'Not your item' };
    if (item.status !== 'available') {
      return { status: 409, error: 'Items that are reserved or lent cannot be removed' };
    }

    await query('UPDATE items SET removed_at = NOW() WHERE id = $1', [item.id], client);
    await declinePendingLoans(item.id, null, client);
    return { status: 204 };
  });

  if (outcome.status !== 204) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.status(204).end();
});

export default router;
