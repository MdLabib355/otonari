// Login check: "Authorization: Bearer <token>" → req.user (the full row from the users table).
// There are no passwords: the random token from /api/join IS the identity.
//
// Add it to each route that needs a user:  router.get('/me', requireUser, (req, res) => ...)
// (Not with router.use(requireUser): all routers are mounted at /api, so that would also
// block the public routes in the routers mounted after it.)

import { db } from './db.js';

export function requireUser(req, res, next) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const user = token ? db.prepare('SELECT * FROM users WHERE token = ?').get(token) : undefined;

  // No token, or an unknown one (e.g. after `npm run seed`): the client should go to /join.
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.user = user;
  next();
}
