// The neighborhood shelf, and managing my own items.

import type { Request } from 'express';
import { DURATIONS, SPOT_KEYS, isActiveCatalogItemKey, isActiveCategoryKey, isOneOf } from '../../core/allowedKeys.ts';
import { transaction } from '../../core/database.ts';
import { refuse, reply, toId, toText } from '../../core/http.ts';
import { deletePhoto } from '../../core/photoFiles.ts';
import { getGroupRow } from '../group/groupModel.ts';
import { findOpenLoan } from '../loan/loanModel.ts';
import { isTrusted } from '../user/userModel.ts';
import { createItem, createItemRequest, findItem, findItemWithOwner, listItemsOf, listShelf, updateItemSettings } from './itemModel.ts';
import { itemDetailsView } from './itemView.ts';
import { removeItem } from './removeItem.ts';

export async function showShelf(req: Request) {
  return reply(200, await listShelf(req.groupId));
}

export async function showMyItems(req: Request) {
  return reply(200, await listItemsOf(req.user.id));
}

export async function showItem(req: Request) {
  const item = await findItemWithOwner(toId(req.params.id));
  if (!item) return refuse(404, 'Item not found');
  if (item.group_id !== req.groupId) return refuse(403, 'Not in your neighborhood');

  const myLoan = await findOpenLoan(item.id, req.user.id);
  const allowedForMe = !item.trusted_only || (await isTrusted(req.user.id));
  return reply(200, itemDetailsView(item, myLoan?.id ?? null, allowedForMe));
}

// In a form with a photo, every value is text.
export function toFlag(value: unknown): unknown {
  return value === 'true' ? true : value === 'false' ? false : value;
}

function toDays(value: unknown): unknown {
  return typeof value === 'string' ? Number(value) : value;
}

export async function addItem(req: Request) {
  const body: Record<string, unknown> = req.body ?? {};
  const { item_key, spot } = body;
  const maxDays = toDays(body.max_days);
  const trustedOnly = toFlag(body.trusted_only ?? false);
  const group = await getGroupRow(req.groupId);
  if (group.lifecycle_status !== 'active') return refuse(403, 'This group is currently read-only');

  if (!(await isActiveCatalogItemKey(item_key))) return refuse(400, 'Unknown item');
  if (!isOneOf(DURATIONS, maxDays)) return refuse(400, `max_days must be one of ${DURATIONS.join(', ')}`);
  if (!isOneOf(SPOT_KEYS, spot)) return refuse(400, 'Unknown handover spot');
  if (typeof trustedOnly !== 'boolean') return refuse(400, 'trusted_only must be true or false');

  const photo = req.optionalPhoto ?? null;
  return reply(201, await createItem(req.user.id, req.groupId, item_key as string, maxDays, spot, trustedOnly, photo));
}

// One line of text, without line breaks or other invisible control characters.
export function toTitle(value: unknown): string {
  return toText(value)
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim();
}

export async function requestNewItem(req: Request) {
  const body: Record<string, unknown> = req.body ?? {};
  const title = toTitle(body.custom_title);
  const category = toText(body.category_key) || null; // null: the group admin decides
  const { spot } = body;
  const maxDays = toDays(body.max_days);
  const trustedOnly = toFlag(body.trusted_only ?? false);
  const group = await getGroupRow(req.groupId);
  if (group.lifecycle_status !== 'active') return refuse(403, 'This group is currently read-only');

  if (title.length < 2 || title.length > 60) return refuse(400, 'custom_title must be 2 to 60 characters');
  if (category !== null && !(await isActiveCategoryKey(category))) return refuse(400, 'Unknown category');
  if (!isOneOf(DURATIONS, maxDays)) return refuse(400, `max_days must be one of ${DURATIONS.join(', ')}`);
  if (!isOneOf(SPOT_KEYS, spot)) return refuse(400, 'Unknown handover spot');
  if (typeof trustedOnly !== 'boolean') return refuse(400, 'trusted_only must be true or false');

  const item = await createItemRequest({
    owner_id: req.user.id,
    group_id: req.groupId,
    custom_title: title,
    category_key: category,
    max_days: maxDays,
    spot,
    trusted_only: trustedOnly,
    photo: req.optionalPhoto ?? null,
  });
  return reply(202, item);
}

// The owner's settings; what is not sent stays as it is. Deleting the old photo can be slow, so it is done
// after the transaction (this is not a write() route).
export async function updateItem(req: Request) {
  const body: Record<string, unknown> = req.body ?? {};
  const clearPhoto = toFlag(body.clear_photo ?? false);
  if (typeof clearPhoto !== 'boolean') return refuse(400, 'clear_photo must be true or false');
  const fields = [body.trusted_only, body.max_days, body.spot, body.clear_photo, req.optionalPhoto];
  if (fields.every((field) => field === undefined)) return refuse(400, 'Nothing to change');

  let replaced: string | null = null;
  const answer = await transaction(async () => {
    const item = await findItem(toId(req.params.id));
    if (!item) return refuse(404, 'Item not found');
    if (item.owner_id !== req.user.id) return refuse(403, 'Not your item');

    const trusted_only = toFlag(body.trusted_only ?? item.trusted_only);
    const max_days = toDays(body.max_days ?? item.max_days);
    const spot = body.spot ?? item.spot;
    if (typeof trusted_only !== 'boolean') return refuse(400, 'trusted_only must be true or false');
    if (!isOneOf(DURATIONS, max_days)) return refuse(400, `max_days must be one of ${DURATIONS.join(', ')}`);
    if (!isOneOf(SPOT_KEYS, spot)) return refuse(400, 'Unknown handover spot');
    // The borrower of a loan that is going on was promised this spot.
    if (item.status !== 'available' && spot !== item.spot) {
      return refuse(409, 'The spot cannot change while the item is reserved or lent');
    }

    const photo = req.optionalPhoto ?? (clearPhoto ? null : item.photo);
    if (photo !== item.photo) replaced = item.photo;
    return reply(200, await updateItemSettings(item.id, { trusted_only, max_days, spot, photo }));
  });
  await deletePhoto(replaced);
  return answer;
}

export async function deleteItem(req: Request) {
  const item = await findItem(toId(req.params.id));
  if (!item) return refuse(404, 'Item not found');
  if (item.owner_id !== req.user.id) return refuse(403, 'Not your item');
  if (item.status !== 'available') return refuse(409, 'Items that are reserved or lent cannot be removed');

  await removeItem(item.id);
  return reply(204);
}
