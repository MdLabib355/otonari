// The items table: what the neighbors lend.
// Removing is a "soft delete": the row stays with removed_at set, because old loans point to it.

import type { ItemDetails, ItemStatus, LoanItem, MyItem, ShelfItem } from '../../../shared/types.ts';
import { found, query, queryOne } from '../../core/database.ts';
import type { ItemRow } from '../../types.ts';

export type ItemWithOwner = Omit<ItemDetails, 'my_loan_id' | 'allowed_for_me'>;

const MY_ITEM_COLUMNS = 'id, item_key, max_days, spot, trusted_only, status';

// Any item, also a removed one.
export async function getItem(itemId: number): Promise<ItemRow> {
  return found(await queryOne<ItemRow>('SELECT * FROM items WHERE id = $1', [itemId]));
}

// Only items that have not been removed.
export async function findItem(itemId: number): Promise<ItemRow | undefined> {
  return queryOne<ItemRow>('SELECT * FROM items WHERE id = $1 AND removed_at IS NULL', [itemId]);
}

// The part of an item that the loan page shows.
export async function getLoanItem(itemId: number): Promise<LoanItem> {
  const item = await queryOne<LoanItem>(
    'SELECT id, item_key, max_days, spot, status FROM items WHERE id = $1',
    [itemId]
  );
  return found(item);
}

// One item with its owner's nickname and language (visible on shelf only).
export async function findItemWithOwner(itemId: number): Promise<ItemWithOwner | undefined> {
  return queryOne<ItemWithOwner>(
    `SELECT items.id, items.group_id, items.item_key, items.max_days, items.spot, items.trusted_only,
            items.status, items.owner_id, users.nickname AS owner_nickname, users.lang AS owner_lang
     FROM items JOIN users ON users.id = items.owner_id
     WHERE items.id = $1 AND items.removed_at IS NULL AND items.hidden_at IS NULL`,
    [itemId]
  );
}

export async function listShelf(groupId: number): Promise<ShelfItem[]> {
  return query<ShelfItem>(
    `SELECT items.id, items.item_key, items.max_days, items.spot, items.trusted_only, items.status,
            items.owner_id, users.nickname AS owner_nickname
     FROM items JOIN users ON users.id = items.owner_id
     WHERE items.group_id = $1 AND items.removed_at IS NULL AND items.hidden_at IS NULL
     ORDER BY items.id`,
    [groupId]
  );
}

export async function listItemsOf(ownerId: number): Promise<MyItem[]> {
  return query<MyItem>(
    `SELECT ${MY_ITEM_COLUMNS} FROM items WHERE owner_id = $1 AND removed_at IS NULL ORDER BY id`,
    [ownerId]
  );
}

export async function createItem(
  ownerId: number,
  groupId: number,
  itemKey: string,
  maxDays: number,
  spot: string,
  trustedOnly: boolean
): Promise<MyItem> {
  const item = await queryOne<MyItem>(
    `INSERT INTO items (owner_id, group_id, item_key, max_days, spot, trusted_only)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${MY_ITEM_COLUMNS}`,
    [ownerId, groupId, itemKey, maxDays, spot, trustedOnly]
  );
  return found(item);
}

export async function setTrustedOnly(itemId: number, on: boolean) {
  await query('UPDATE items SET trusted_only = $1 WHERE id = $2', [on, itemId]);
}

export async function setItemStatus(itemId: number, status: ItemStatus) {
  await query('UPDATE items SET status = $1 WHERE id = $2', [status, itemId]);
}

export async function markRemoved(itemId: number) {
  await query('UPDATE items SET removed_at = now() WHERE id = $1', [itemId]);
}
