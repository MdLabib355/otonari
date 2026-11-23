// 3-Layer Notification Routes:
//   GET    /api/inbox           user          all piled-up unread notifications (oldest first)
//   POST   /api/inbox/read      user          { ids } -> mark specific unread messages read
//   POST   /api/inbox/read-all  user          mark all unread messages read
//   GET    /api/due-loans       user          active borrowed loans due within 24h or overdue
//   GET    /api/events          resident-any  authenticated SSE live event stream
//   GET    /api/push/vapid-key  user          VAPID public key for browser PushManager
//   POST   /api/push/subscribe  user          register/update Web Push subscription
//   DELETE /api/push/subscribe  user          remove Web Push subscription

import express from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireResidentAnyStatus, requireUser } from '../middleware/auth.js';
import { subscribeUser } from '../services/events.js';
import { getVapidPublicKey, removeSubscription, saveSubscription } from '../services/push.js';

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

router.post('/inbox/read-all', requireUser, async (req, res) => {
  const result = await query(
    'UPDATE messages SET read_at = NOW() WHERE to_user_id = $1 AND read_at IS NULL',
    [req.user.id]
  );
  res.json({ updated: result.rowCount });
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

router.get('/events', requireResidentAnyStatus, (req, res) => {
  subscribeUser(req.user.id, res);
});

router.get('/push/vapid-key', requireUser, async (req, res) => {
  const publicKey = await getVapidPublicKey();
  res.json({ publicKey });
});

router.post('/push/subscribe', requireUser, async (req, res) => {
  const ok = await saveSubscription(req.user.id, req.body);
  if (!ok) {
    return res.status(400).json({ error: 'Valid push subscription (endpoint + keys.p256dh + keys.auth) required' });
  }
  res.status(201).json({ ok: true });
});

router.delete('/push/subscribe', requireUser, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ error: 'endpoint is required' });
  }
  await removeSubscription(req.user.id, endpoint);
  res.status(204).end();
});

export default router;
