// Looking up and starting neighborhoods.

import type { Request } from 'express';
import { GROUP_TYPES, isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toText } from '../../core/http.ts';
import { countMembers } from '../user/userModel.ts';
import { getActiveAnnouncement } from '../groupAdmin/groupAdminModel.ts';
import { createGroup, findGroupByCode, findSimilarGroup } from './groupModel.ts';
import { groupPreviewView, newGroupView } from './groupView.ts';

export async function showGroupAnnouncement(req: Request) {
  return reply(200, await getActiveAnnouncement(req.user.group_id));
}

export async function previewGroup(req: Request) {
  const group = await findGroupByCode(req.params.code);
  if (!group) return refuse(404, 'Group not found');
  return reply(200, groupPreviewView(group, await countMembers(group.id)));
}

// Start a new neighborhood: for a building manager or a neighborhood association leader.
export async function startGroup(req: Request) {
  const { type, create_anyway }: Record<string, unknown> = req.body ?? {};
  const name = toText(req.body?.name);
  const city = toText(req.body?.city);

  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return refuse(400, 'The name must be 1 to 60 characters, the city 1 to 40');
  }
  if (!isOneOf(GROUP_TYPES, type)) return refuse(400, "type must be 'building' or 'block'");

  // Tell only the name of the similar group, never its code: codes are for people who see the poster.
  const similar = await findSimilarGroup(name, city);
  if (similar && create_anyway !== true) {
    return reply(409, { error: 'There is a similar group in this city', existing_name: similar.name });
  }

  const code = await createGroup(name, type, city);
  return reply(201, newGroupView({ code, name, type, city }));
}
