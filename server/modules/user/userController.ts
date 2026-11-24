// Joining and leaving a neighborhood, and reading / changing "me".

import type { Request } from 'express';
import { LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { refuse, reply, toText } from '../../core/http.ts';
import { findGroupByCode } from '../group/groupModel.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { leaveGroup } from './leaveGroup.ts';
import { createUser, getUser, setElderMode, setLang } from './userModel.ts';
import { loginView, meView } from './userView.ts';

// No account, no password, no email: a nickname and a language are enough.
export async function join(req: Request) {
  const { nickname, lang }: Record<string, unknown> = req.body ?? {};

  const group = await findGroupByCode(req.params.code);
  if (!group) return refuse(404, 'Group not found');

  // The only free text a member ever types.
  const cleanNickname = toText(nickname);
  if (cleanNickname.length < 1 || cleanNickname.length > 20) {
    return refuse(400, 'Nickname must be 1 to 20 characters');
  }
  if (!isOneOf(LANGUAGES, lang)) return refuse(400, 'Unknown language');

  return reply(201, await loginView(await createUser(group.id, cleanNickname, lang)));
}

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

// Leave the neighborhood. Not in the middle of a loan: a neighbor is counting on it.
export async function leave(req: Request) {
  // Anyone can "continue as" a demo neighbor, so leaving would remove them for everybody.
  if (req.user.is_demo) return refuse(403, "Demo neighbors can't leave");
  if (await hasUnfinishedLoan(req.user.id)) return refuse(409, 'Please finish your current loans first');

  await leaveGroup(req.user.id);
  return reply(204);
}
