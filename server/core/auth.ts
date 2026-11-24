// Login & RBAC checks: "Authorization: Bearer <token>" -> req.user (validated via sessions table).
//   requireUser              anyone logged in (account active)
//   requireMember            logged in, active member of an active/read-only group (sets req.groupId)
//   requireGroupAdmin        group_admin, co_admin, or super_admin in that group
//   requirePrimaryGroupAdmin primary group_admin (or super_admin) in that group
//   requireSuperAdmin        platform super_admin account (role === 'super_admin')

import type { Request } from 'express';
import { findUserByToken } from '../modules/auth/sessionModel.ts';
import { getGroupRow } from '../modules/group/groupModel.ts';
import { refuse } from './http.ts';
import { DEMO_MODE } from './settings.ts';

// "Bearer abc" -> "abc"; '' if there is none.
export function tokenOf(req: Request): string {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

export async function requireUser(req: Request) {
  const token = tokenOf(req);
  const user = token ? await findUserByToken(token) : undefined;
  // No token, unknown/expired, or deactivated: the client should log in again.
  // The password of demo accounts is public, so they work only in demo mode.
  if (!user || (user.is_demo && !DEMO_MODE)) return refuse(401, 'Not logged in');
  req.user = user;
  return null;
}

export async function requireMember(req: Request) {
  const refusal = await requireUser(req);
  if (refusal) return refusal;
  if (req.user.group_id === null) return refuse(403, 'Join a neighborhood first');
  if (req.user.member_status === 'pending') {
    return refuse(403, 'Waiting for building admin approval');
  }
  if (req.user.member_status === 'suspended') {
    return refuse(403, 'Your membership in this group is currently suspended');
  }

  const group = await getGroupRow(req.user.group_id);
  if (group.lifecycle_status === 'suspended' || group.lifecycle_status === 'archived') {
    return refuse(403, 'This neighborhood group is currently unavailable');
  }

  req.groupId = req.user.group_id;
  return null;
}

export async function requireGroupAdmin(req: Request) {
  const refusal = await requireMember(req);
  if (refusal) return refusal;
  if (req.user.member_status !== 'active') {
    return refuse(403, 'Admin privileges require an active membership');
  }
  return req.user.role === 'user' ? refuse(403, 'Only for group admins') : null;
}

export async function requirePrimaryGroupAdmin(req: Request) {
  const refusal = await requireGroupAdmin(req);
  if (refusal) return refusal;
  return req.user.role === 'group_admin' || req.user.role === 'super_admin'
    ? null
    : refuse(403, 'Primary Group Admin access required');
}

export async function requireSuperAdmin(req: Request) {
  const refusal = await requireUser(req);
  if (refusal) return refusal;
  return req.user.role === 'super_admin' ? null : refuse(403, 'Only for super admins');
}
