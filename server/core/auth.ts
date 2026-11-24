// Authentication & RBAC route steps for residents, Group Admins, and Super Admins.
// Residents: "Authorization: Bearer <token>" -> req.user
// Super Admins: "Authorization: Bearer <sa-token>" -> req.superAdmin (strictly isolated table)

import type { Request } from 'express';
import { getGroupRow } from '../modules/group/groupModel.ts';
import { findMemberByToken } from '../modules/user/userModel.ts';
import { query, queryOne } from './database.ts';
import { refuse } from './http.ts';

const SUPER_ADMIN_IDLE_MINUTES = 30;

function extractBearerToken(req: Request): string {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

export async function requireUser(req: Request) {
  const token = extractBearerToken(req);
  const user = token ? await findMemberByToken(token) : undefined;

  // No token, an unknown one (e.g. after `npm run seed`), or they left: the client should go to /join.
  if (!user) return refuse(401, 'Not logged in');
  if (user.member_status === 'suspended') {
    return refuse(403, 'Your membership in this group is currently suspended');
  }

  const group = await getGroupRow(user.group_id);
  if (group.lifecycle_status === 'suspended' || group.lifecycle_status === 'archived') {
    return refuse(403, 'This neighborhood group is currently unavailable');
  }

  req.user = user;
  return null;
}

// Blocks pending join applicants from browsing items/loans until approved by a Group Admin.
export async function requireActiveMember(req: Request) {
  if (req.user.member_status === 'pending') {
    return refuse(403, 'Waiting for building admin approval');
  }
  return null;
}

// Group Admin or Co-Admin, scoped strictly to req.user.group_id.
export async function requireGroupAdmin(req: Request) {
  const userError = await requireUser(req);
  if (userError) return userError;
  if (req.user.member_status !== 'active') {
    return refuse(403, 'Admin privileges require an active membership');
  }
  if (req.user.group_role !== 'group_admin' && req.user.group_role !== 'co_admin') {
    return refuse(403, 'Group Admin access required');
  }
  return null;
}

// Primary Group Admin only (for promoting/demoting Co-Admins or transferring ownership).
export async function requirePrimaryGroupAdmin(req: Request) {
  const adminError = await requireGroupAdmin(req);
  if (adminError) return adminError;
  if (req.user.group_role !== 'group_admin') {
    return refuse(403, 'Primary Group Admin access required');
  }
  return null;
}

// Dedicated Super Admin session guard. Resident & demo tokens are never valid here.
export async function requireSuperAdmin(req: Request) {
  const token = extractBearerToken(req);
  if (!token) return refuse(401, 'Super Admin authentication required');

  const session = await queryOne<{ token: string; admin_label: string; expires_at: string }>(
    `SELECT token, admin_label, expires_at
     FROM super_admin_sessions
     WHERE token = $1 AND expires_at > now()`,
    [token]
  );

  if (!session) return refuse(401, 'Invalid or expired Super Admin session');

  // Sliding 30-minute idle timeout.
  const nextExpiry = new Date(Date.now() + SUPER_ADMIN_IDLE_MINUTES * 60 * 1000).toISOString();
  await query('UPDATE super_admin_sessions SET last_seen_at = now(), expires_at = $1 WHERE token = $2', [
    nextExpiry,
    token,
  ]);

  req.superAdmin = { label: session.admin_label, token: session.token, expiresAt: nextExpiry };
  return null;
}
