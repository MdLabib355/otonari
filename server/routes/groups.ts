// Starting, joining and leaving a neighborhood group, and reading / changing "me".
//   GET   /api/groups/by-code/:code   anyone   group preview for the join screen and the poster
//   POST  /api/groups                 anyone   { name, type, city, create_anyway? } → the new group with
//                                              its join code (the creator does NOT become a member)
//   POST  /api/join                   anyone   { code, nickname, lang } → { token, user, group }
//   GET   /api/me                     user     → { user, group }
//   PATCH /api/me                     user     { lang?, elder_mode? } → { user, group }
//   POST  /api/leave                  user     leave the group (not while a loan is accepted or active)

import crypto from 'node:crypto';
import express from 'express';
import type { Group, GroupPreview, Login, NewGroupAnswer } from '../../shared/types.ts';
import { GROUP_TYPES, LANGUAGES, isOneOf } from '../allowedKeys.ts';
import { requireUser } from '../auth.ts';
import { createMessage, db, declinePendingLoans, found, getMe } from '../db.ts';
import type { CountRow, LoanRow } from '../types.ts';

const router = express.Router();

// Join codes have no I, L, O, 0 or 1: those are easily mixed up when typing a code from a poster.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Codes are printed in capitals on the poster; accept "sakura-2611" too.
function findGroupByCode(code: unknown) {
  const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  return db.prepare<unknown[], Group>('SELECT * FROM groups WHERE code = ?').get(cleanCode);
}

router.get('/groups/by-code/:code', (req, res) => {
  const group = findGroupByCode(req.params.code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const { count } = found(
    db
      .prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM users WHERE group_id = ? AND left_at IS NULL')
      .get(group.id)
  );
  const preview: GroupPreview = { name: group.name, type: group.type, city: group.city, memberCount: count };
  res.json(preview);
});

// A random join code like 'K7PW-3XQD' that no other group has.
function newJoinCode(): string {
  let code: string;
  do {
    let chars = '';
    while (chars.length < 8) chars += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  } while (findGroupByCode(code));
  return code;
}

// For comparing names: "Sakura Heights" and "SAKURAHEIGHTS" count as the same.
// (NFKC does the same for Japanese full-width typing: "３丁目" and "3丁目".)
function simplified(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

function findSimilarGroup(name: string, city: string) {
  const groups = db.prepare<unknown[], Group>('SELECT * FROM groups').all();
  return groups.find(
    (group) => simplified(group.city) === simplified(city) && simplified(group.name) === simplified(name)
  );
}

// Anything that isn't text (missing, a number, ...) counts as empty.
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Start a new neighborhood: for a building manager or a neighborhood association leader.
router.post('/groups', (req, res) => {
  const { type, create_anyway }: Record<string, unknown> = req.body ?? {};
  const name = trimmed(req.body?.name);
  const city = trimmed(req.body?.city);

  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return res.status(400).json({ error: 'The name must be 1 to 60 characters, the city 1 to 40' });
  }
  if (!isOneOf(GROUP_TYPES, type)) {
    return res.status(400).json({ error: "type must be 'building' or 'block'" });
  }

  // Tell only the name of the similar group, never its code: codes are for people who see the poster.
  const similar = findSimilarGroup(name, city);
  if (similar && create_anyway !== true) {
    return res.status(409).json({ error: 'There is a similar group in this city', existing_name: similar.name });
  }

  const code = newJoinCode();
  db.prepare('INSERT INTO groups (code, name, type, city) VALUES (?, ?, ?, ?)').run(code, name, type, city);
  const answer: NewGroupAnswer = { code, name, type, city };
  res.status(201).json(answer);
});

// No account, no password, no email: the new random token is the user's identity
// (the client keeps it in localStorage).
router.post('/join', (req, res) => {
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

  const token = crypto.randomUUID();
  const result = db
    .prepare('INSERT INTO users (group_id, nickname, lang, token) VALUES (?, ?, ?, ?)')
    .run(group.id, cleanNickname, lang, token);
  const answer: Login = { token, ...getMe(Number(result.lastInsertRowid)) };
  res.status(201).json(answer);
});

router.get('/me', requireUser, (req, res) => {
  res.json(getMe(req.user.id));
});

// Both fields are optional: send only what changed.
router.patch('/me', requireUser, (req, res) => {
  const { lang, elder_mode }: Record<string, unknown> = req.body ?? {};

  if (lang !== undefined && !isOneOf(LANGUAGES, lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }
  if (elder_mode !== undefined && !isOneOf([true, false, 0, 1], elder_mode)) {
    return res.status(400).json({ error: 'elder_mode must be true or false' });
  }

  if (lang !== undefined) {
    db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang, req.user.id);
  }
  if (elder_mode !== undefined) {
    db.prepare('UPDATE users SET elder_mode = ? WHERE id = ?').run(elder_mode ? 1 : 0, req.user.id);
  }
  res.json(getMe(req.user.id));
});

// Leave the neighborhood. Not in the middle of a loan: a neighbor is counting on it.
router.post('/leave', requireUser, (req, res) => {
  // Anyone can "continue as" a demo neighbor, so leaving would remove them for everybody.
  if (req.user.is_demo === 1) {
    return res.status(403).json({ error: "Demo neighbors can't leave" });
  }

  const myId = req.user.id;
  const openLoan = db
    .prepare("SELECT id FROM loans WHERE (borrower_id = ? OR lender_id = ?) AND status IN ('accepted', 'active')")
    .get(myId, myId);
  if (openLoan) {
    return res.status(409).json({ error: 'Please finish your current loans first' });
  }

  const leave = db.transaction(() => {
    // My items leave the shelf, and whoever was waiting for one of them gets a polite no.
    const items = db
      .prepare<unknown[], { id: number }>("SELECT id FROM items WHERE owner_id = ? AND status = 'available' AND removed_at IS NULL")
      .all(myId);
    for (const item of items) {
      db.prepare("UPDATE items SET removed_at = datetime('now') WHERE id = ?").run(item.id);
      declinePendingLoans(item.id);
    }

    // My own requests are cancelled.
    const requests = db
      .prepare<unknown[], LoanRow>("SELECT * FROM loans WHERE borrower_id = ? AND status = 'pending'")
      .all(myId);
    for (const loan of requests) {
      db.prepare("UPDATE loans SET status = 'cancelled' WHERE id = ?").run(loan.id);
      createMessage(loan, myId, loan.lender_id, 'cancel');
    }

    db.prepare("UPDATE users SET left_at = datetime('now') WHERE id = ?").run(myId); // my token stops working
  });
  leave();
  res.status(204).end();
});

export default router;
