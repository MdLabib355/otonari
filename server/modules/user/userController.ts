// Joining and leaving a neighborhood, and reading / changing "me".

import type { Request, Response } from 'express';
import { LANGUAGES, isOneOf } from '../../core/allowedKeys.ts';
import { findGroupByCode } from '../group/groupModel.ts';
import { leaveGroup } from './leaveGroup.ts';
import { hasUnfinishedLoan } from '../loan/loanModel.ts';
import { createUser, getUser, setElderMode, setLang } from './userModel.ts';
import { loginView, meView } from './userView.ts';

// No account, no password, no email: a nickname and a language are enough.
export function join(req: Request, res: Response) {
  const { code, nickname, lang }: Record<string, unknown> = req.body ?? {};

  const group = findGroupByCode(code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  // The only free text a member ever types.
  const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';
  if (cleanNickname.length < 1 || cleanNickname.length > 20) {
    return res.status(400).json({ error: 'Nickname must be 1 to 20 characters' });
  }
  if (!isOneOf(LANGUAGES, lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }

  res.status(201).json(loginView(createUser(group.id, cleanNickname, lang)));
}

export function showMe(req: Request, res: Response) {
  res.json(meView(req.user));
}

// Both fields are optional: send only what changed.
export function updateMe(req: Request, res: Response) {
  const { lang, elder_mode }: Record<string, unknown> = req.body ?? {};

  if (lang !== undefined && !isOneOf(LANGUAGES, lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }
  if (elder_mode !== undefined && !isOneOf([true, false, 0, 1], elder_mode)) {
    return res.status(400).json({ error: 'elder_mode must be true or false' });
  }

  if (lang !== undefined) setLang(req.user.id, lang);
  if (elder_mode !== undefined) setElderMode(req.user.id, Boolean(elder_mode));
  res.json(meView(getUser(req.user.id)));
}

// Leave the neighborhood. Not in the middle of a loan: a neighbor is counting on it.
export function leave(req: Request, res: Response) {
  // Anyone can "continue as" a demo neighbor, so leaving would remove them for everybody.
  if (req.user.is_demo === 1) {
    return res.status(403).json({ error: "Demo neighbors can't leave" });
  }
  if (hasUnfinishedLoan(req.user.id)) {
    return res.status(409).json({ error: 'Please finish your current loans first' });
  }
  leaveGroup(req.user.id);
  res.status(204).end();
}
