// Time-boxed, HMAC-SHA256 signed Break-Glass tokens scoped to one Super Admin session, dispute, and loan.

import crypto from 'node:crypto';

export const DEFAULT_BREAK_GLASS_TTL_SECONDS = 15 * 60;

const SIGNING_SECRET = process.env.BREAK_GLASS_SECRET || crypto.randomBytes(32).toString('hex');

interface BreakGlassPayload {
  sid: string; // hashed superAdmin session token
  did: number; // dispute id
  lid: number; // loan id
  exp: number; // epoch ms
}

function hashSession(sessionToken: string): string {
  return crypto.createHash('sha256').update(sessionToken).digest('base64url');
}

function signEncoded(encodedPayload: string): string {
  return crypto.createHmac('sha256', SIGNING_SECRET).update(encodedPayload).digest('base64url');
}

export function issueBreakGlassToken(
  sessionToken: string,
  disputeId: number,
  loanId: number,
  ttlSeconds = DEFAULT_BREAK_GLASS_TTL_SECONDS
): { token: string; expiresAt: string; ttlSeconds: number } {
  const safeTtl = Math.max(1, Math.min(ttlSeconds, DEFAULT_BREAK_GLASS_TTL_SECONDS));
  const exp = Date.now() + safeTtl * 1000;
  const payload: BreakGlassPayload = {
    sid: hashSession(sessionToken),
    did: disputeId,
    lid: loanId,
    exp,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signEncoded(encoded);
  return {
    token: `${encoded}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
    ttlSeconds: safeTtl,
  };
}

export function verifyBreakGlassToken(
  token: string,
  sessionToken: string,
  disputeId: number,
  loanId: number
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return false;

  const expectedSig = signEncoded(encoded);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BreakGlassPayload;
    if (payload.did !== disputeId || payload.lid !== loanId) return false;
    if (payload.sid !== hashSession(sessionToken)) return false;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
