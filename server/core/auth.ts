// Login check: "Authorization: Bearer <token>" → req.user (the full row from the users table).
// The steps are the first ones of every route that needs them (see http.ts):
//   requireUser         anyone who is logged in
//   requireMember       ... and is in a neighborhood group (also sets req.groupId)
//   requireGroupAdmin   ... and manages that group
//   requireSuperAdmin   the people who run Otonari

import type { Request } from 'express';
import { findUserByToken } from '../modules/auth/sessionModel.ts';
import { refuse } from './http.ts';
import { DEMO_MODE } from './settings.ts';

// "Bearer abc" → "abc"; '' if there is none.
export function tokenOf(req: Request): string {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

export async function requireUser(req: Request) {
  const token = tokenOf(req);
  const user = token ? await findUserByToken(token) : undefined;
  // No token, or an unknown or expired one: the client should log in again.
  // The password of the demo accounts is public, so they exist only in demo mode.
  if (!user || (user.is_demo && !DEMO_MODE)) return refuse(401, 'Not logged in');
  req.user = user;
  return null;
}

export async function requireMember(req: Request) {
  const refusal = await requireUser(req);
  if (refusal) return refusal;
  if (req.user.group_id === null) return refuse(403, 'Join a neighborhood first');
  req.groupId = req.user.group_id;
  return null;
}

export async function requireGroupAdmin(req: Request) {
  const refusal = await requireMember(req);
  if (refusal) return refusal;
  return req.user.role === 'user' ? refuse(403, 'Only for group admins') : null;
}

export async function requireSuperAdmin(req: Request) {
  const refusal = await requireUser(req);
  if (refusal) return refusal;
  return req.user.role === 'super_admin' ? null : refuse(403, 'Only for super admins');
}
