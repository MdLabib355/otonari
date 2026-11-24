// The neighborhood shelf, and managing my own items.
//   GET    /api/shelf       user    every item on my group's shelf, with the owner's nickname
//   GET    /api/my-items    user    my own items
//   GET    /api/items/:id   user    one item of my group, with the owner's nickname and language
//                                   (the item page shows the request in the OWNER's language),
//                                   my_loan_id if I already asked for it (else null), and
//                                   allowed_for_me (false: trusted neighbors only, and I'm not one yet)
//   POST   /api/items       user    { item_key, max_days, spot, trusted_only? } → a new item on the shelf
//   PATCH  /api/items/:id   owner   { trusted_only } → "trusted neighbors only" on or off
//   DELETE /api/items/:id   owner   take it off the shelf (not while it is reserved or lent)
//
// Removing is a "soft delete": the row stays with removed_at set, because old loans point to it.

import express from 'express';
import type { ItemDetails, MyItem, ShelfItem } from '../../shared/types.ts';
import { DURATIONS, ITEM_KEYS, SPOT_KEYS, isOneOf } from '../allowedKeys.ts';
import { requireUser } from '../auth.ts';
import { db, declinePendingLoans, findOpenLoan, found, isTrusted } from '../db.ts';
import type { ItemRow } from '../types.ts';

const router = express.Router();

// An item as SQLite returns it. SQLite has no booleans: 0 / 1 → false / true.
type Stored<T> = Omit<T, 'trusted_only'> & { trusted_only: number };

function publicItem<T extends { trusted_only: number }>(
  item: T
): Omit<T, 'trusted_only'> & { trusted_only: boolean } {
  return { ...item, trusted_only: item.trusted_only === 1 };
}

router.get('/shelf', requireUser, (req, res) => {
  const items = db
    .prepare<unknown[], Stored<ShelfItem>>(
      `SELECT items.id, items.item_key, items.max_days, items.spot, items.trusted_only, items.status,
              items.owner_id, users.nickname AS owner_nickname
       FROM items JOIN users ON users.id = items.owner_id
       WHERE items.group_id = ? AND items.removed_at IS NULL
       ORDER BY items.id`
    )
    .all(req.user.group_id);
  const answer: ShelfItem[] = items.map(publicItem);
  res.json(answer);
});

router.get('/my-items', requireUser, (req, res) => {
  const items = db
    .prepare<unknown[], Stored<MyItem>>(
      `SELECT id, item_key, max_days, spot, trusted_only, status FROM items
       WHERE owner_id = ? AND removed_at IS NULL
       ORDER BY id`
    )
    .all(req.user.id);
  const answer: MyItem[] = items.map(publicItem);
  res.json(answer);
});

router.get('/items/:id', requireUser, (req, res) => {
  const item = db
    .prepare<unknown[], Stored<Omit<ItemDetails, 'my_loan_id' | 'allowed_for_me'>>>(
      `SELECT items.id, items.group_id, items.item_key, items.max_days, items.spot, items.trusted_only,
              items.status, items.owner_id, users.nickname AS owner_nickname, users.lang AS owner_lang
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
  const answer: ItemDetails = {
    ...publicItem(item),
    my_loan_id: findOpenLoan(item.id, req.user.id)?.id ?? null,
    allowed_for_me: item.trusted_only === 0 || isTrusted(req.user.id),
  };
  res.json(answer);
});

router.post('/items', requireUser, (req, res) => {
  const { item_key, max_days, spot, trusted_only = false }: Record<string, unknown> = req.body ?? {};

  // Only keys from the catalog: that is what makes every item name translatable.
  if (!isOneOf(ITEM_KEYS, item_key)) {
    return res.status(400).json({ error: 'Unknown item' });
  }
  if (!isOneOf(DURATIONS, max_days)) {
    return res.status(400).json({ error: `max_days must be one of ${DURATIONS.join(', ')}` });
  }
  if (!isOneOf(SPOT_KEYS, spot)) {
    return res.status(400).json({ error: 'Unknown handover spot' });
  }
  if (typeof trusted_only !== 'boolean') {
    return res.status(400).json({ error: 'trusted_only must be true or false' });
  }

  const result = db
    .prepare(
      'INSERT INTO items (owner_id, group_id, item_key, max_days, spot, trusted_only) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(req.user.id, req.user.group_id, item_key, max_days, spot, trusted_only ? 1 : 0);
  const item = found(
    db
      .prepare<unknown[], Stored<MyItem>>(
        'SELECT id, item_key, max_days, spot, trusted_only, status FROM items WHERE id = ?'
      )
      .get(result.lastInsertRowid)
  );
  const answer: MyItem = publicItem(item);
  res.status(201).json(answer);
});

// Requests that are already waiting stay: the owner can still answer them with No.
router.patch('/items/:id', requireUser, (req, res) => {
  const trustedOnly: unknown = req.body?.trusted_only;
  if (typeof trustedOnly !== 'boolean') {
    return res.status(400).json({ error: 'trusted_only must be true or false' });
  }
  const item = db
    .prepare<unknown[], ItemRow>('SELECT * FROM items WHERE id = ? AND removed_at IS NULL')
    .get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your item' });
  }
  db.prepare('UPDATE items SET trusted_only = ? WHERE id = ?').run(trustedOnly ? 1 : 0, item.id);
  res.status(204).end();
});

router.delete('/items/:id', requireUser, (req, res) => {
  const item = db
    .prepare<unknown[], ItemRow>('SELECT * FROM items WHERE id = ? AND removed_at IS NULL')
    .get(req.params.id);
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
