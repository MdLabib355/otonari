// The notification inbox: messages to me that I haven't read yet.
// The client asks every 5 seconds (simple polling, no push notifications).
//   GET  /api/inbox        user   my unread messages, oldest first, with sender + loan + item
//   POST /api/inbox/read   user   { ids } → mark those messages (only ones sent to me) as read

import express from 'express';
import { requireUser } from '../auth.js';
import { db } from '../db.js';

const router = express.Router();

router.get('/inbox', requireUser, (req, res) => {
  const messages = db
    .prepare(
      `SELECT messages.id, messages.loan_id, messages.from_user_id, messages.phrase_key,
              messages.params, messages.created_at,
              sender.nickname AS from_nickname, sender.lang AS from_lang,  -- NULL for system reminders
              items.item_key
       FROM messages
       JOIN loans ON loans.id = messages.loan_id
       JOIN items ON items.id = loans.item_id
       LEFT JOIN users AS sender ON sender.id = messages.from_user_id
       WHERE messages.to_user_id = ? AND messages.read_at IS NULL
       ORDER BY messages.created_at, messages.id`
    )
    .all(req.user.id);
  res.json(messages.map((message) => ({ ...message, params: JSON.parse(message.params) })));
});

router.post('/inbox/read', requireUser, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: 'ids must be a list of message ids' });
  }

  // "AND to_user_id = ?" means nobody can mark someone else's messages as read.
  const markRead = db.prepare(
    "UPDATE messages SET read_at = datetime('now') WHERE id = ? AND to_user_id = ? AND read_at IS NULL"
  );
  let updated = 0;
  const markAll = db.transaction(() => {
    for (const id of ids) updated += markRead.run(id, req.user.id).changes;
  });
  markAll();
  res.json({ updated });
});

export default router;
