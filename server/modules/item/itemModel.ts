// The items table: what the neighbors lend.
// Removing is a "soft delete": the row stays with removed_at set, because old loans point to it.

import type { ItemDetails, ItemStatus, LoanItem, MyItem, ShelfItem } from '../../../shared/types.ts';
import { CUSTOM_ITEM_KEY } from '../../core/allowedKeys.ts';
import { found, query, queryOne } from '../../core/database.ts';
import { photoUrl } from '../../core/photoFiles.ts';
import type { ItemRow } from '../../types.ts';

export type ItemWithOwner = Omit<ItemDetails, 'my_loan_id' | 'allowed_for_me'>;

const MY_ITEM_COLUMNS = 'id, item_key, max_days, spot, trusted_only, status, photo, custom_title, category_key, approval_status';

// The client gets URLs, never where a photo is stored.
export async function withPhotoUrl<T extends { photo: string | null }>(item: T): Promise<T> {
  return { ...item, photo: await photoUrl(item.photo) };
}

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
    'SELECT id, item_key, max_days, spot, status, photo, custom_title, category_key FROM items WHERE id = $1',
    [itemId]
  );
  return withPhotoUrl(found(item));
}

// One item with its owner's nickname and language (visible on shelf only).
export async function findItemWithOwner(itemId: number): Promise<ItemWithOwner | undefined> {
  const item = await queryOne<ItemWithOwner>(
    `SELECT items.id, items.group_id, items.item_key, items.max_days, items.spot, items.trusted_only,
            items.status, items.photo, items.custom_title, items.category_key, items.approval_status,
            items.owner_id, users.nickname AS owner_nickname, users.lang AS owner_lang
     FROM items JOIN users ON users.id = items.owner_id
     WHERE items.id = $1 AND items.removed_at IS NULL AND items.hidden_at IS NULL
       AND items.approval_status = 'approved'`,
    [itemId]
  );
  return item && withPhotoUrl(item);
}

export async function listShelf(groupId: number): Promise<ShelfItem[]> {
  const items = await query<ShelfItem>(
    `SELECT items.id, items.item_key, items.max_days, items.spot, items.trusted_only, items.status, items.photo,
            items.custom_title, items.category_key, items.approval_status, items.owner_id, users.nickname AS owner_nickname
     FROM items JOIN users ON users.id = items.owner_id
     WHERE items.group_id = $1 AND items.removed_at IS NULL AND items.hidden_at IS NULL
       AND items.approval_status = 'approved'
     ORDER BY items.id`,
    [groupId]
  );
  return Promise.all(items.map(withPhotoUrl));
}

export async function listItemsOf(ownerId: number): Promise<MyItem[]> {
  const items = await query<MyItem>(
    `SELECT ${MY_ITEM_COLUMNS} FROM items
     WHERE owner_id = $1 AND removed_at IS NULL AND approval_status IN ('approved', 'pending') ORDER BY id`,
    [ownerId]
  );
  return Promise.all(items.map(withPhotoUrl));
}

export async function createItem(
  ownerId: number,
  groupId: number,
  itemKey: string,
  maxDays: number,
  spot: string,
  trustedOnly: boolean,
  photo: string | null = null
): Promise<MyItem> {
  const item = await queryOne<MyItem>(
    `INSERT INTO items (owner_id, group_id, item_key, max_days, spot, trusted_only, photo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${MY_ITEM_COLUMNS}`,
    [ownerId, groupId, itemKey, maxDays, spot, trustedOnly, photo]
  );
  return withPhotoUrl(found(item));
}

export async function setTrustedOnly(itemId: number, on: boolean) {
  await query('UPDATE items SET trusted_only = $1 WHERE id = $2', [on, itemId]);
}

// Something that is not in the catalog. It is on the shelf once a group admin has approved it.
export async function createItemRequest(
  item: Pick<ItemRow, 'owner_id' | 'group_id' | 'custom_title' | 'category_key' | 'max_days' | 'spot' | 'trusted_only' | 'photo'>
): Promise<MyItem> {
  const row = await queryOne<MyItem>(
    `INSERT INTO items (owner_id, group_id, item_key, custom_title, category_key, max_days, spot, trusted_only, photo,
                        approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING ${MY_ITEM_COLUMNS}`,
    [
      item.owner_id,
      item.group_id,
      CUSTOM_ITEM_KEY,
      item.custom_title,
      item.category_key,
      item.max_days,
      item.spot,
      item.trusted_only,
      item.photo,
    ]
  );
  return withPhotoUrl(found(row));
}

export type OwnerChanges = Pick<ItemRow, 'trusted_only' | 'max_days' | 'spot' | 'photo'>;

export async function updateItemSettings(itemId: number, changes: OwnerChanges): Promise<MyItem> {
  const item = await queryOne<MyItem>(
    `UPDATE items SET trusted_only = $2, max_days = $3, spot = $4, photo = $5 WHERE id = $1
     RETURNING ${MY_ITEM_COLUMNS}`,
    [itemId, changes.trusted_only, changes.max_days, changes.spot, changes.photo]
  );
  return withPhotoUrl(found(item));
}

export async function setItemStatus(itemId: number, status: ItemStatus) {
  await query('UPDATE items SET status = $1 WHERE id = $2', [status, itemId]);
}

export async function markRemoved(itemId: number) {
  await query('UPDATE items SET removed_at = now() WHERE id = $1', [itemId]);
}
