// Group admins: approve or reject what is not in the catalog, and edit any item of their group.
// Not write() routes: deleting a replaced photo can be slow, so it is done after the transaction.

import type { Request } from 'express';
import { CUSTOM_ITEM_KEY, isActiveCatalogItemKey, isActiveCategoryKey } from '../../core/allowedKeys.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { transaction } from '../../core/database.ts';
import { refuse, reply, toId, toText, type Answer } from '../../core/http.ts';
import { deletePhoto } from '../../core/photoFiles.ts';
import type { ItemRow } from '../../types.ts';
import { toFlag, toTitle } from '../item/itemController.ts';
import { findGroupItem, listGroupItemsForAdmin, markItemRejected, updateGroupItem } from './groupAdminModel.ts';

async function log(req: Request, item: ItemRow, action: string, detail: string) {
  const isSuperAdmin = req.user.role === 'super_admin';
  await writeAuditLog({
    actorId: req.user.id,
    actorLabel: `${isSuperAdmin ? 'SuperAdmin' : 'GroupAdmin'} · ${req.user.nickname || req.user.email}`,
    actorRole: isSuperAdmin ? 'super_admin' : 'group_admin',
    scopeGroupId: req.groupId,
    category: 'Shelf',
    action,
    targetType: 'item',
    targetId: item.id,
    detail,
    ipAddress: req.ip ?? null,
  });
}

function titleOf(item: Pick<ItemRow, 'custom_title' | 'item_key'>): string {
  return item.custom_title ?? item.item_key;
}

export async function approveItem(req: Request) {
  return changeItem(req, 'approve');
}

export async function editItem(req: Request) {
  return changeItem(req, 'edit');
}

// The new name and category: from the catalog, or a custom title with a category. What is not sent stays as it is.
// Returns what is wrong instead, if something is.
async function newIdentity(body: Record<string, unknown>, item: ItemRow) {
  const item_key = toText(body.item_key) || item.item_key;
  const mapped = item_key !== item.item_key; // to another item of the catalog, whose name and category it then has
  if (mapped && !(await isActiveCatalogItemKey(item_key))) return 'Unknown item';

  const oldTitle = mapped ? null : item.custom_title;
  const custom_title = body.custom_title === undefined ? oldTitle : toTitle(body.custom_title) || null;
  if (custom_title !== null && custom_title.length > 60) return 'custom_title must be 60 characters at most';

  const oldCategory = mapped ? null : item.category_key;
  const category_key = body.category_key === undefined ? oldCategory : toText(body.category_key) || null;
  // A category that it already has may be disabled by now.
  const keepsCategory = category_key === item.category_key && item.approval_status === 'approved';
  if (category_key !== null && !keepsCategory && !(await isActiveCategoryKey(category_key))) return 'Unknown category';

  if (item_key === CUSTOM_ITEM_KEY) {
    if (custom_title === null || custom_title.length < 2) return 'custom_title must be 2 to 60 characters';
    if (category_key === null && item.approval_status !== 'pending') return 'A custom item needs a category';
  }
  return { item_key, custom_title, category_key };
}

async function changeItem(req: Request, what: 'approve' | 'edit'): Promise<Answer> {
  const body: Record<string, unknown> = req.body ?? {};
  const clearPhoto = toFlag(body.clear_photo ?? false);
  if (typeof clearPhoto !== 'boolean') return refuse(400, 'clear_photo must be true or false');
  const fields = [body.item_key, body.custom_title, body.category_key, body.clear_photo, req.optionalPhoto];
  if (what === 'edit' && fields.every((field) => field === undefined)) return refuse(400, 'Nothing to change');

  let replaced: string | null = null;
  const answer = await transaction(async () => {
    const item = await findGroupItem(req.groupId, toId(req.params.itemId));
    if (!item) return refuse(404, 'Item not found');
    if (what === 'approve' && item.approval_status !== 'pending') return refuse(409, 'Item is not awaiting approval');

    const identity = await newIdentity(body, item);
    if (typeof identity === 'string') return refuse(400, identity);
    if (what === 'approve' && identity.item_key === CUSTOM_ITEM_KEY && identity.category_key === null) {
      return refuse(400, 'Choose a category before approving');
    }

    const photo = req.optionalPhoto ?? (clearPhoto ? null : item.photo);
    if (photo !== item.photo) replaced = item.photo;
    const approval_status = what === 'approve' ? 'approved' : item.approval_status;
    await updateGroupItem(item.id, { ...identity, photo, approval_status });

    if (what === 'approve') {
      await log(req, item, 'item.approved', `Approved "${titleOf(item)}" as "${titleOf(identity)}".`);
    } else {
      const photoNote = photo === item.photo ? '' : photo ? ' New photo.' : ' Photo removed.';
      await log(req, item, 'item.edited', `Edited "${titleOf(item)}" (now "${titleOf(identity)}").${photoNote}`);
    }
    const updated = (await listGroupItemsForAdmin(req.groupId)).find((row) => row.id === item.id);
    return reply(200, updated);
  });
  await deletePhoto(replaced);
  return answer;
}

export async function rejectItem(req: Request) {
  const item = await findGroupItem(req.groupId, toId(req.params.itemId));
  if (!item) return refuse(404, 'Item not found');
  if (item.approval_status !== 'pending') return refuse(409, 'Item is not awaiting approval');

  await markItemRejected(item.id);
  await log(req, item, 'item.rejected', `Rejected "${titleOf(item)}".`);
  return reply(204);
}
