// Login check: "Authorization: Bearer <token>" -> req.user (full row from users).

import { query } from '../db/pool.js';

export async function requireUser(req, res, next) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const result = await query('SELECT * FROM users WHERE token = $1 AND left_at IS NULL', [token]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.user = user;
  next();
}
