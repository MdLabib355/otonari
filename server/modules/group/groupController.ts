// Looking up, starting and managing neighborhoods.

import type { Request } from 'express';
import { GROUP_TYPES, LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { found } from '../../core/database.ts';
import { refuse, reply, toId, toText } from '../../core/http.ts';
import { getActiveAnnouncement } from '../groupAdmin/groupAdminModel.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { leaveGroup } from '../user/leaveGroup.ts';
import { countMembers, findUser, getUser, joinGroup, listMembers, setRole } from '../user/userModel.ts';
import { meView, memberView } from '../user/userView.ts';
import { changeJoinCode, createGroup, findGroupByCode, findSimilarGroup } from './groupModel.ts';
import { groupPreviewView } from './groupView.ts';

export async function previewGroup(req: Request) {
  const group = await findGroupByCode(req.params.code);
  if (!group) return refuse(404, 'Group not found');
  return reply(200, groupPreviewView(group, await countMembers(group.id)));
}

export async function showGroupAnnouncement(req: Request) {
  return reply(200, await getActiveAnnouncement(req.groupId));
}

// Start a new neighborhood. Whoever starts it is its first member and its admin.
export async function startGroup(req: Request) {
  const { type, lang, create_anyway }: Record<string, unknown> = req.body ?? {};
  const name = toText(req.body?.name);
  const city = toText(req.body?.city);
  const nickname = toText(req.body?.nickname);

  if (req.user.group_id !== null) return refuse(409, 'You are already in a neighborhood');
  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return refuse(400, 'The name must be 1 to 60 characters, the city 1 to 40');
  }
  if (!isOneOf(GROUP_TYPES, type)) return refuse(400, "type must be 'building' or 'block'");
  if (nickname.length < 1 || nickname.length > 20) return refuse(400, 'Nickname must be 1 to 20 characters');
  if (!isOneOf(LANGUAGES, lang)) return refuse(400, 'Unknown language');

  const similar = await findSimilarGroup(name, city);
  if (similar && create_anyway !== true) {
    return reply(409, { error: 'There is a similar group in this city', existing_name: similar.name });
  }

  const group = found(await findGroupByCode(await createGroup(name, type, city)));
  await joinGroup(req.user.id, group.id, nickname, lang, 'active');
  if (req.user.role === 'user') await setRole(req.user.id, 'group_admin');
  return reply(201, await meView(await getUser(req.user.id)));
}

export async function showMembers(req: Request) {
  const members = await listMembers(req.groupId);
  return reply(200, await Promise.all(members.map(memberView)));
}

export async function removeMember(req: Request) {
  const member = await findUser(toId(req.params.id));
  if (!member || member.group_id !== req.groupId) return refuse(404, 'Not a member of your group');
  if (member.role !== 'user') return refuse(403, 'Admins cannot be removed');
  if (member.is_demo) return refuse(403, 'Demo neighbors cannot be removed');
  if (await hasUnfinishedLoan(member.id)) return refuse(409, 'This neighbor still has an unfinished loan');

  await leaveGroup(member.id, req.groupId);
  return reply(204);
}

export async function changeCode(req: Request) {
  await changeJoinCode(req.groupId);
  return reply(200, await meView(req.user));
}
