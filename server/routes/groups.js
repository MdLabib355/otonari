// Joining a neighborhood group, and reading / changing "me".
//   GET   /api/groups/by-code/:code   anyone   group preview for the join screen
//   POST  /api/join                   anyone   { code, nickname, lang } → { token, user, group }
//   GET   /api/me                     user     → { user, group }
//   PATCH /api/me                     user     { lang?, elder_mode? } → { user, group }

import crypto from 'node:crypto';
import express from 'express';
import { LANGUAGES } from '../allowedKeys.js';
import { requireUser } from '../auth.js';
import { db, getMe } from '../db.js';

const router = express.Router();

// Codes are printed in capitals on the poster; accept "sakura-2611" too.
function findGroupByCode(code) {
  const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  return db.prepare('SELECT * FROM groups WHERE code = ?').get(cleanCode);
}

router.get('/groups/by-code/:code', (req, res) => {
  const group = findGroupByCode(req.params.code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users WHERE group_id = ?').get(group.id);
  res.json({ name: group.name, type: group.type, city: group.city, memberCount: count });
});

// No account, no password, no email: the new random token is the user's identity
// (the client keeps it in localStorage).
router.post('/join', (req, res) => {
  const { code, nickname, lang } = req.body ?? {};

  const group = findGroupByCode(code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  // The nickname is the only free text in the whole app.
  const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';
  if (cleanNickname.length < 1 || cleanNickname.length > 20) {
    return res.status(400).json({ error: 'Nickname must be 1 to 20 characters' });
  }
  if (!LANGUAGES.includes(lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }

  const token = crypto.randomUUID();
  const result = db
    .prepare('INSERT INTO users (group_id, nickname, lang, token) VALUES (?, ?, ?, ?)')
    .run(group.id, cleanNickname, lang, token);
  res.status(201).json({ token, ...getMe(result.lastInsertRowid) });
});

router.get('/me', requireUser, (req, res) => {
  res.json(getMe(req.user.id));
});

// Both fields are optional: send only what changed.
router.patch('/me', requireUser, (req, res) => {
  const { lang, elder_mode } = req.body ?? {};

  if (lang !== undefined && !LANGUAGES.includes(lang)) {
    return res.status(400).json({ error: 'Unknown language' });
  }
  if (elder_mode !== undefined && ![true, false, 0, 1].includes(elder_mode)) {
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

export default router;
