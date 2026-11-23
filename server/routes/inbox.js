// Notification inbox & sticky return-due loans.
//   GET  /api/inbox       user   my unread messages, oldest first, with sender + loan + item + borrower_trust
//   POST /api/inbox/read  user   { ids } -> mark those messages (only ones sent to me) as read
//   GET  /api/due-loans   user   my active borrowed loans due within 24h or overdue (no return photo yet)

import express from 'express';
import { requireUser } from '../auth.js';
import { query, withTransaction } from '../db.js';

const router = express.Router();

router.get('/inbox', requireUser, async (req, res) => {
  const result = await query(
    `SELECT messages.id, messages.loan_id, messages.from_user_id, messages.phrase_key,
            messages.params, messages.created_at,
            sender.nickname AS from_nickname, sender.lang AS from_lang,
            items.item_key,
            CASE WHEN messages.phrase_key = 'request' AND sender.id IS NOT NULL THEN
              GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - sender.created_at)) / 86400))::int
            END AS trust_joined_days,
            CASE WHEN messages.phrase_key = 'request' AND sender.id IS NOT NULL THEN
              COALESCE(trust_stats.on_time, 0)::int
            END AS trust_on_time,
            CASE WHEN messages.phrase_key = 'request' AND sender.id IS NOT NULL THEN
              COALESCE(trust_stats.late, 0)::int
            END AS trust_late
     FROM messages
     JOIN loans ON loans.id = messages.loan_id
     JOIN items ON items.id = loans.item_id
     LEFT JOIN users AS sender ON sender.id = messages.from_user_id
     LEFT JOIN LATERAL (
       SELECT COUNT(CASE WHEN l.returned_at <= l.end_at THEN 1 END) AS on_time,
              COUNT(CASE WHEN l.returned_at > l.end_at THEN 1 END) AS late
       FROM loans l
       WHERE l.borrower_id = messages.from_user_id AND l.status = 'returned'
     ) AS trust_stats ON messages.phrase_key = 'request' AND messages.from_user_id IS NOT NULL
     WHERE messages.to_user_id = $1 AND messages.read_at IS NULL
     ORDER BY messages.created_at, messages.id`,
    [req.user.id]
  );

  res.json(
    result.rows.map((row) => {
      const { trust_joined_days, trust_on_time, trust_late, ...message } = row;
      return {
        ...message,
        params: typeof message.params === 'string' ? JSON.parse(message.params) : message.params,
        borrower_trust:
          message.phrase_key === 'request' && trust_joined_days !== null
            ? { joined_days: trust_joined_days, on_time: trust_on_time, late: trust_late }
            : null,
      };
    })
  );
});

router.post('/inbox/read', requireUser, async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: 'ids must be a list of message ids' });
  }
  if (ids.length === 0) {
    return res.json({ updated: 0 });
  }

  const updated = await withTransaction(async (client) => {
    const result = await query(
      `UPDATE messages
       SET read_at = NOW()
       WHERE id = ANY($1::int[]) AND to_user_id = $2 AND read_at IS NULL`,
      [ids, req.user.id],
      client
    );
    return result.rowCount;
  });

  res.json({ updated });
});

router.get('/due-loans', requireUser, async (req, res) => {
  const result = await query(
    `SELECT loans.id, loans.end_at, items.item_key, items.spot,
            lender.nickname AS lender_nickname,
            (loans.end_at < NOW()) AS overdue
     FROM loans
     JOIN items ON items.id = loans.item_id
     JOIN users AS lender ON lender.id = loans.lender_id
     WHERE loans.borrower_id = $1
       AND loans.status = 'active'
       AND loans.return_photo IS NULL
       AND loans.end_at <= NOW() + INTERVAL '24 hours'
     ORDER BY loans.end_at ASC`,
    [req.user.id]
  );
  res.json(result.rows);
});

export default router;
