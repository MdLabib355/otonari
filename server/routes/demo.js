// Demo-only routes. server/index.js mounts them ONLY when DEMO_MODE=true (in server/.env),
// because the login route hands out any user's token.
//   GET  /api/demo/users   everyone you can "continue as", with their group
//   POST /api/demo/login   { user_id } → { token, user, group }  (same shape as /api/join)

import express from 'express';
import { db, getMe, publicUser } from '../db.js';

const router = express.Router();

router.get('/demo/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT users.*, groups.name AS group_name, groups.code AS group_code
       FROM users JOIN groups ON groups.id = users.group_id
       ORDER BY users.group_id, users.id`
    )
    .all();
  res.json(
    users.map((user) => ({
      ...publicUser(user),
      group_name: user.group_name,
      group_code: user.group_code,
    }))
  );
});

router.post('/demo/login', (req, res) => {
  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'user_id must be a number' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ token: user.token, ...getMe(user.id) });
});

export default router;
