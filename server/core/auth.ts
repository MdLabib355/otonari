// Login check: "Authorization: Bearer <token>" → req.user (the full row from the users table).
// There are no passwords: the random token from /api/join IS the identity.
//
// Add it to each route that needs a user:  router.get('/me', requireUser, showMe)
// (Not with router.use(requireUser): all routers are mounted at /api, so that would also
// block the public routes in the routers mounted after it.)

import type { NextFunction, Request, Response } from 'express';
import { findMemberByToken } from '../modules/user/userModel.ts';

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const user = token ? findMemberByToken(token) : undefined;

  // No token, an unknown one (e.g. after `npm run seed`), or they left: the client should go to /join.
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.user = user;
  next();
}
