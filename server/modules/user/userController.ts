// Reading and changing "me", and joining and leaving a neighborhood.

import type { Request } from 'express';
import { LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toText } from '../../core/http.ts';
import { findGroupByCode } from '../group/groupModel.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { leaveGroup } from './leaveGroup.ts';
import { getUser, joinGroup, setElderMode, setLang } from './userModel.ts';
import { meView } from './userView.ts';

export async function showMe(req: Request) {
  return reply(200, await meView(req.user));
}

// Both fields are optional: send only what changed.
export async function updateMe(req: Request) {
  const { lang, elder_mode }: Record<string, unknown> = req.body ?? {};

  if (lang !== undefined && !isOneOf(LANGUAGES, lang)) return refuse(400, 'Unknown language');
  if (elder_mode !== undefined && !isOneOf([true, false, 0, 1], elder_mode)) {
    return refuse(400, 'elder_mode must be true or false');
  }

  if (lang !== undefined) await setLang(req.user.id, lang);
  if (elder_mode !== undefined) await setElderMode(req.user.id, Boolean(elder_mode));
  return reply(200, await meView(await getUser(req.user.id)));
}

// With the code from the poster. The nickname is all that neighbors see.
export async function join(req: Request) {
  const group = await findGroupByCode(req.params.code);
  if (!group) return refuse(404, 'Group not found');
  if (req.user.group_id !== null) return refuse(409, 'You are already in a neighborhood');

  const nickname = toText(req.body?.nickname);
  const lang: unknown = req.body?.lang;
  if (nickname.length < 1 || nickname.length > 20) return refuse(400, 'Nickname must be 1 to 20 characters');
  if (!isOneOf(LANGUAGES, lang)) return refuse(400, 'Unknown language');

  await joinGroup(req.user.id, group.id, nickname, lang);
  return reply(201, await meView(await getUser(req.user.id)));
}

// Leave the neighborhood; the account stays. Not in the middle of a loan: a neighbor is counting on it.
export async function leave(req: Request) {
  // Everybody knows the password of the demo accounts, so leaving would remove them for everybody.
  if (req.user.is_demo) return refuse(403, "Demo neighbors can't leave");
  if (await hasUnfinishedLoan(req.user.id)) return refuse(409, 'Please finish your current loans first');

  await leaveGroup(req.user.id, req.groupId);
  return reply(200, await meView(await getUser(req.user.id)));
}
