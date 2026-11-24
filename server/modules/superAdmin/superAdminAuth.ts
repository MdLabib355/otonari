// Dedicated Super Admin authentication using Node's crypto.scryptSync + 30-min server-side sessions.
// Completely isolated from resident tokens and demoRoutes.ts.

import crypto from 'node:crypto';
import type { Request } from 'express';
import type { SuperAdminLoginResponse, SuperAdminSessionInfo } from '../../../shared/types.ts';
import { writeAuditLog } from '../../core/audit.ts';
import { query } from '../../core/database.ts';
import { refuse, reply, toText } from '../../core/http.ts';

const SESSION_TTL_MS = 30 * 60 * 1000;
const DEV_FALLBACK_USER = 'admin';
const DEV_FALLBACK_PASS = 'otonari-admin-2026';

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashPasswordScrypt(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derivedHex = crypto.scryptSync(password, salt, 64).toString('hex');
  return constantTimeEquals(derivedHex, expectedHex);
}

function resolveConfiguredCredentials(): {
  username: string;
  passwordHash: string;
  adminLabel: string;
} | null {
  const isProd = process.env.NODE_ENV === 'production';
  const username = process.env.SUPER_ADMIN_USERNAME || (isProd ? '' : DEV_FALLBACK_USER);
  const adminLabel = process.env.SUPER_ADMIN_LABEL || 'Super Admin (Platform)';
  const envHash = process.env.SUPER_ADMIN_PASSWORD_HASH;
  const envPlain = process.env.SUPER_ADMIN_PASSWORD || (isProd ? '' : DEV_FALLBACK_PASS);

  if (!username) return null;
  if (envHash) {
    return { username, passwordHash: envHash, adminLabel };
  }
  if (envPlain) {
    // Deterministic per-process salt for env plaintext verification via scrypt.
    return { username, passwordHash: hashPasswordScrypt(envPlain, 'otonari-sa-salt'), adminLabel };
  }
  return null;
}

export async function loginSuperAdmin(req: Request) {
  const username = toText(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return refuse(400, 'username and password are required');
  }

  const creds = resolveConfiguredCredentials();
  if (!creds) {
    return refuse(503, 'Super Admin credentials are not configured on this server');
  }

  const userOk = constantTimeEquals(username, creds.username);
  const passOk = verifyPasswordScrypt(password, creds.passwordHash);
  if (!userOk || !passOk) {
    return refuse(401, 'Invalid Super Admin credentials');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  // Opportunistically clear expired sessions.
  await query('DELETE FROM super_admin_sessions WHERE expires_at <= now()');
  await query(
    'INSERT INTO super_admin_sessions (token, admin_label, expires_at) VALUES ($1, $2, $3)',
    [token, creds.adminLabel, expiresAt]
  );

  await writeAuditLog({
    actorLabel: creds.adminLabel,
    actorRole: 'super_admin',
    category: 'System',
    action: 'super_admin.login',
    targetType: 'session',
    targetId: creds.username,
    detail: `Super Admin authenticated (${creds.username}) with 30-minute idle session.`,
    ipAddress: req.ip ?? null,
  });

  const payload: SuperAdminLoginResponse = {
    token,
    admin_label: creds.adminLabel,
    expires_at: expiresAt,
  };
  return reply(200, payload);
}

export async function logoutSuperAdmin(req: Request) {
  if (req.superAdmin) {
    await query('DELETE FROM super_admin_sessions WHERE token = $1', [req.superAdmin.token]);
  }
  return reply(204);
}

export async function showSuperAdminMe(req: Request) {
  const info: SuperAdminSessionInfo = {
    admin_label: req.superAdmin!.label,
    expires_at: req.superAdmin!.expiresAt,
  };
  return reply(200, info);
}
