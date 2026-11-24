// The items table: what the neighbors lend.
// Removing is a "soft delete": the row stays with removed_at set, because old loans point to it.

import type { ItemDetails, ItemStatus, LoanItem, MyItem, ShelfItem } from '../../../shared/types.ts';
import { db, found } from '../../core/database.ts';
import type { ItemRow } from '../../types.ts';

// An item as SQLite returns it: SQLite has no booleans, so trusted_only is 0 or 1 (see itemView.ts).
export type Stored<T> = Omit<T, 'trusted_only'> & { trusted_only: number };
export type StoredDetails = Stored<Omit<ItemDetails, 'my_loan_id' | 'allowed_for_me'>>;

// Any item, also a removed one.
export function getItem(itemId: number): ItemRow {
  return found(db.prepare<unknown[], ItemRow>('SELECT * FROM items WHERE id = ?').get(itemId));
}

// Only items that have not been removed.
export function findItem(itemId: number): ItemRow | undefined {
  return db.prepare<unknown[], ItemRow>('SELECT * FROM items WHERE id = ? AND removed_at IS NULL').get(itemId);
}

// The part of an item that the loan page shows.
export function getLoanItem(itemId: number): LoanItem {
  return found(
    db.prepare<unknown[], LoanItem>('SELECT id, item_key, max_days, spot, status FROM items WHERE id = ?').get(itemId)
  );
}

export function getMyItem(itemId: number): Stored<MyItem> {
  return found(
    db
      .prepare<unknown[], Stored<MyItem>>(
        'SELECT id, item_key, max_days, spot, trusted_only, status FROM items WHERE id = ?'
      )
      .get(itemId)
  );
}

// One item with its owner's nickname and language.
export function findItemDetails(itemId: number): StoredDetails | undefined {
  return db
    .prepare<unknown[], StoredDetails>(
      `SELECT items.id, items.group_id, items.item_key, items.max_days, items.spot, items.trusted_only,
              items.status, items.owner_id, users.nickname AS owner_nickname, users.lang AS owner_lang
       FROM items JOIN users ON users.id = items.owner_id
       WHERE items.id = ? AND items.removed_at IS NULL`
    )
    .get(itemId);
}

export function listShelf(groupId: number): Stored<ShelfItem>[] {
  return db
    .prepare<unknown[], Stored<ShelfItem>>(
      `SELECT items.id, items.item_key, items.max_days, items.spot, items.trusted_only, items.status,
              items.owner_id, users.nickname AS owner_nickname
       FROM items JOIN users ON users.id = items.owner_id
       WHERE items.group_id = ? AND items.removed_at IS NULL
       ORDER BY items.id`
    )
    .all(groupId);
}

export function listItemsOf(ownerId: number): Stored<MyItem>[] {
  return db
    .prepare<unknown[], Stored<MyItem>>(
      `SELECT id, item_key, max_days, spot, trusted_only, status FROM items
       WHERE owner_id = ? AND removed_at IS NULL
       ORDER BY id`
    )
    .all(ownerId);
}

// Returns the new item's id.
export function createItem(
  ownerId: number,
  groupId: number,
  itemKey: string,
  maxDays: number,
  spot: string,
  trustedOnly: boolean
): number {
  const result = db
    .prepare(
      'INSERT INTO items (owner_id, group_id, item_key, max_days, spot, trusted_only) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(ownerId, groupId, itemKey, maxDays, spot, trustedOnly ? 1 : 0);
  return Number(result.lastInsertRowid);
}

export function setTrustedOnly(itemId: number, on: boolean) {
  db.prepare('UPDATE items SET trusted_only = ? WHERE id = ?').run(on ? 1 : 0, itemId);
}

export function setItemStatus(itemId: number, status: ItemStatus) {
  db.prepare('UPDATE items SET status = ? WHERE id = ?').run(status, itemId);
}

export function markRemoved(itemId: number) {
  db.prepare("UPDATE items SET removed_at = datetime('now') WHERE id = ?").run(itemId);
}
