// The neighborhood shelf, and managing my own items.

import type { Request, Response } from 'express';
import { DURATIONS, ITEM_KEYS, SPOT_KEYS, isOneOf } from '../../core/allowedKeys.ts';
import {
  createItem,
  findItem,
  findItemDetails,
  getMyItem,
  listItemsOf,
  listShelf,
  setTrustedOnly,
} from './itemModel.ts';
import { removeItem } from './removeItem.ts';
import { findOpenLoan } from '../loan/loanModel.ts';
import { isTrusted } from '../user/userModel.ts';
import { itemDetailsView, myItemView, shelfItemView } from './itemView.ts';

export function showShelf(req: Request, res: Response) {
  res.json(listShelf(req.user.group_id).map(shelfItemView));
}

export function showMyItems(req: Request, res: Response) {
  res.json(listItemsOf(req.user.id).map(myItemView));
}

export function showItem(req: Request, res: Response) {
  const item = findItemDetails(Number(req.params.id));
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.group_id !== req.user.group_id) {
    return res.status(403).json({ error: 'Not in your neighborhood' });
  }
  const myLoanId = findOpenLoan(item.id, req.user.id)?.id ?? null;
  const allowedForMe = item.trusted_only === 0 || isTrusted(req.user.id);
  res.json(itemDetailsView(item, myLoanId, allowedForMe));
}

export function addItem(req: Request, res: Response) {
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

  const itemId = createItem(req.user.id, req.user.group_id, item_key, max_days, spot, trusted_only);
  res.status(201).json(myItemView(getMyItem(itemId)));
}

// Requests that are already waiting stay: the owner can still answer them with No.
export function updateItem(req: Request, res: Response) {
  const trustedOnly: unknown = req.body?.trusted_only;
  if (typeof trustedOnly !== 'boolean') {
    return res.status(400).json({ error: 'trusted_only must be true or false' });
  }
  const item = findItem(Number(req.params.id));
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your item' });
  }
  setTrustedOnly(item.id, trustedOnly);
  res.status(204).end();
}

export function deleteItem(req: Request, res: Response) {
  const item = findItem(Number(req.params.id));
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your item' });
  }
  if (item.status !== 'available') {
    return res.status(409).json({ error: 'Items that are reserved or lent cannot be removed' });
  }
  removeItem(item.id);
  res.status(204).end();
}
