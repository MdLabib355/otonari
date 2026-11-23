// The neighborhood shelf, and managing my own items.
//   GET    /api/shelf       user    every item on my group's shelf, with the owner's nickname
//   GET    /api/my-items    user    my own items
//   GET    /api/items/:id   user    one item of my group, with the owner's nickname and language
//                                   (the item page shows the request in the OWNER's language)
//                                   and my_loan_id if I already asked for it (else null)
//   POST   /api/items       user    { item_key, max_days, spot } → put a new item on the shelf
//   DELETE /api/items/:id   owner   take it off the shelf (not while it is reserved or lent)
//
// Removing is a "soft delete": the row stays with removed_at set, because old loans point to it.

import express from 'express';
import { DURATIONS, ITEM_KEYS, SPOT_KEYS } from '../allowedKeys.js';
import { requireUser } from '../auth.js';
import { db, declinePendingLoans, findOpenLoan } from '../db.js';

const router = express.Router();

router.get('/shelf', requireUser, (req, res) => {
  const items = db
    .prepare(
      `SELECT items.id, items.item_key, items.max_days, items.spot, items.status,
              items.owner_id, users.nickname AS owner_nickname
       FROM items JOIN users ON users.id = items.owner_id
       WHERE items.group_id = ? AND items.removed_at IS NULL
       ORDER BY items.id`
    )
    .all(req.user.group_id);
  res.json(items);
});

router.get('/my-items', requireUser, (req, res) => {
  const items = db
    .prepare(
      `SELECT id, item_key, max_days, spot, status FROM items
       WHERE owner_id = ? AND removed_at IS NULL
       ORDER BY id`
    )
    .all(req.user.id);
  res.json(items);
});

router.get('/items/:id', requireUser, (req, res) => {
  const item = db
    .prepare(
      `SELECT items.id, items.group_id, items.item_key, items.max_days, items.spot, items.status,
              items.owner_id, users.nickname AS owner_nickname, users.lang AS owner_lang
       FROM items JOIN users ON users.id = items.owner_id
       WHERE items.id = ? AND items.removed_at IS NULL`
    )
    .get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.group_id !== req.user.group_id) {
    return res.status(403).json({ error: 'Not in your neighborhood' });
  }
  res.json({ ...item, my_loan_id: findOpenLoan(item.id, req.user.id)?.id ?? null });
});

router.post('/items',requireUser, (req, res) => {
  const { item_key, max_days, spot } = req.body ?? {};

  // Only keys from the catalog: that is what makes every item name translatable.
  if (!ITEM_KEYS.includes(item_key)) {
    return res.status(400).json({ error: 'Unknown item' });
  }
  if (!DURATIONS.includes(max_days)) {
    return res.status(400).json({ error: `max_days must be one of ${DURATIONS.join(', ')}` });
  }
  if (!SPOT_KEYS.includes(spot)) {
    return res.status(400).json({ error: 'Unknown handover spot' });
  }

  const result = db
    .prepare('INSERT INTO items (owner_id, group_id, item_key, max_days, spot) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, req.user.group_id, item_key, max_days, spot);
  const item = db
    .prepare('SELECT id, item_key, max_days, spot, status FROM items WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(item);
});

router.delete('/items/:id', requireUser, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND removed_at IS NULL').get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your item' });
  }
  if (item.status !== 'available') {
    return res.status(409).json({ error: 'Items that are reserved or lent cannot be removed' });
  }

  // Take it off the shelf, and politely decline anyone still waiting for an answer.
  const removeItem = db.transaction(() => {
    db.prepare("UPDATE items SET removed_at = datetime('now') WHERE id = ?").run(item.id);
    declinePendingLoans(item.id);
  });
  removeItem();
  res.status(204).end();
});

export default router;
