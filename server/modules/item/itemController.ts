// The neighborhood shelf, and managing my own items.

import type { Request } from 'express';
import { DURATIONS, ITEM_KEYS, SPOT_KEYS, isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toId } from '../../core/http.ts';
import { findOpenLoan } from '../loan/loanModel.ts';
import { isTrusted } from '../user/userModel.ts';
import { createItem, findItem, findItemWithOwner, listItemsOf, listShelf, setTrustedOnly } from './itemModel.ts';
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

export async function addItem(req: Request) {
  const { item_key, max_days, spot, trusted_only = false }: Record<string, unknown> = req.body ?? {};

  // Only keys from the catalog: that is what makes every item name translatable.
  if (!isOneOf(ITEM_KEYS, item_key)) return refuse(400, 'Unknown item');
  if (!isOneOf(DURATIONS, max_days)) return refuse(400, `max_days must be one of ${DURATIONS.join(', ')}`);
  if (!isOneOf(SPOT_KEYS, spot)) return refuse(400, 'Unknown handover spot');
  if (typeof trusted_only !== 'boolean') return refuse(400, 'trusted_only must be true or false');

  return reply(201, await createItem(req.user.id, req.groupId, item_key, max_days, spot, trusted_only));
}

// Requests that are already waiting stay: the owner can still answer them with No.
export async function updateItem(req: Request) {
  const trustedOnly: unknown = req.body?.trusted_only;
  if (typeof trustedOnly !== 'boolean') return refuse(400, 'trusted_only must be true or false');

  const item = await findItem(toId(req.params.id));
  if (!item) return refuse(404, 'Item not found');
  if (item.owner_id !== req.user.id) return refuse(403, 'Not your item');

  await setTrustedOnly(item.id, trustedOnly);
  return reply(204);
}

export async function deleteItem(req: Request) {
  const item = await findItem(toId(req.params.id));
  if (!item) return refuse(404, 'Item not found');
  if (item.owner_id !== req.user.id) return refuse(403, 'Not your item');
  if (item.status !== 'available') return refuse(409, 'Items that are reserved or lent cannot be removed');

  await removeItem(item.id);
  return reply(204);
}
