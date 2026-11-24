// Joining and leaving a neighborhood, and reading / changing "me".

import type { Request } from 'express';
import { LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toText } from '../../core/http.ts';
import { findGroupByCode } from '../group/groupModel.ts';
import { deletePhoto } from '../../core/photoFiles.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { leaveGroup } from './leaveGroup.ts';
import {
  countActiveGroupAdmins,
  getUser,
  joinGroup,
  setAvatar,
  setElderMode,
  setLang,
  setNickname,
} from './userModel.ts';
import { meView } from './userView.ts';

export async function showMe(req: Request) {
  return reply(200, await meView(req.user));
}

export async function updateMe(req: Request) {
  const { lang, elder_mode, nickname }: Record<string, unknown> = req.body ?? {};
  const cleanNickname = toText(nickname);

  if (lang !== undefined && !isOneOf(LANGUAGES, lang)) return refuse(400, 'Unknown language');
  if (elder_mode !== undefined && !isOneOf([true, false, 0, 1], elder_mode)) {
    return refuse(400, 'elder_mode must be true or false');
  }

  if (nickname !== undefined && (cleanNickname.length < 1 || cleanNickname.length > 20)) {
    return refuse(400, 'Nickname must be 1 to 20 characters');
  }

  if (nickname !== undefined) await setNickname(req.user.id, cleanNickname);
  if (lang !== undefined) await setLang(req.user.id, lang);
  if (elder_mode !== undefined) await setElderMode(req.user.id, Boolean(elder_mode));
  return reply(200, await meView(await getUser(req.user.id)));
}

// The profile photo. (It has been stored by storePhoto.)
export async function changeAvatar(req: Request) {
  const old = (await getUser(req.user.id)).avatar;
  await setAvatar(req.user.id, req.photo);
  await deletePhoto(old); // afterwards, so there is never a missing photo
  return reply(200, await meView(await getUser(req.user.id)));
}

export async function removeAvatar(req: Request) {
  await setAvatar(req.user.id, null);
  await deletePhoto(req.user.avatar);
  return reply(200, await meView(await getUser(req.user.id)));
}

// With the code from the poster. Respects building join_policy and lifecycle_status.
export async function join(req: Request) {
  const group = await findGroupByCode(req.params.code);
  if (!group) return refuse(404, 'Group not found');
  if (req.user.group_id !== null) return refuse(409, 'You are already in a neighborhood');
  if (group.lifecycle_status !== 'active') {
    return refuse(403, 'This neighborhood group is not accepting new members right now');
  }
  if (group.join_policy === 'locked') {
    return refuse(403, 'New joins are currently paused for this building');
  }

  const nickname = toText(req.body?.nickname);
  const lang: unknown = req.body?.lang;
  if (nickname.length < 1 || nickname.length > 20) return refuse(400, 'Nickname must be 1 to 20 characters');
  if (!isOneOf(LANGUAGES, lang)) return refuse(400, 'Unknown language');

  const needsApproval = group.join_policy === 'approval_required';
  await joinGroup(req.user.id, group.id, nickname, lang, needsApproval ? 'pending' : 'active');
  return reply(needsApproval ? 202 : 201, await meView(await getUser(req.user.id)));
}

// Leave the neighborhood; the account stays. Enforces active-loan and Last-Admin guardrails.
export async function leave(req: Request) {
  if (req.user.is_demo) return refuse(403, "Demo neighbors can't leave");
  if (await hasUnfinishedLoan(req.user.id)) return refuse(409, 'Please finish your current loans first');
  if (req.user.role === 'group_admin' && (await countActiveGroupAdmins(req.groupId)) <= 1) {
    return refuse(409, 'Transfer Group Admin ownership to another neighbor before leaving');
  }

  await leaveGroup(req.user.id, req.groupId);
  return reply(200, await meView(await getUser(req.user.id)));
}
