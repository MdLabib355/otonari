// Login check: "Authorization: Bearer <token>" → req.user (the full row from the users table).
// There are no passwords: the random token from /api/v1/groups/:code/members IS the identity.
// It is the first step of every route that needs a user (see http.ts).

import type { Request } from 'express';
import { findMemberByToken } from '../modules/user/userModel.ts';
import { refuse } from './http.ts';

export async function requireUser(req: Request) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const user = token ? await findMemberByToken(token) : undefined;

  // No token, an unknown one (e.g. after `npm run seed`), or they left: the client should go to /join.
  if (!user) return refuse(401, 'Not logged in');
  req.user = user;
  return null;
}
