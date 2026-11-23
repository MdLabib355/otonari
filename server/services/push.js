// Layer 3: Background Web Push (VAPID) with auto-persisted PostgreSQL keys and stale-subscription pruning.

import net from 'node:net';
import webPush from 'web-push';
import { query } from '../db/pool.js';

const MAX_SUBSCRIPTIONS_PER_USER = 10;
const MAX_KEY_LENGTH = 256;

let cachedKeys = null;
let configuredKeyId = null;
let customSender = null;

export function setPushSenderForTest(senderFn) {
  customSender = senderFn;
}

export function resetPushSender() {
  customSender = null;
}

export async function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }
  if (cachedKeys) return cachedKeys;

  const existing = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('vapid_public_key', 'vapid_private_key')"
  );
  const map = Object.fromEntries(existing.rows.map((r) => [r.key, r.value]));
  if (map.vapid_public_key && map.vapid_private_key) {
    cachedKeys = { publicKey: map.vapid_public_key, privateKey: map.vapid_private_key };
    return cachedKeys;
  }

  const generated = webPush.generateVAPIDKeys();
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('vapid_public_key', $1), ('vapid_private_key', $2)
     ON CONFLICT (key) DO NOTHING`,
    [generated.publicKey, generated.privateKey]
  );

  const reread = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('vapid_public_key', 'vapid_private_key')"
  );
  const finalMap = Object.fromEntries(reread.rows.map((r) => [r.key, r.value]));
  cachedKeys = { publicKey: finalMap.vapid_public_key, privateKey: finalMap.vapid_private_key };
  return cachedKeys;
}

export async function getVapidPublicKey() {
  const { publicKey } = await getVapidKeys();
  return publicKey;
}

function isPrivateOrBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    return true;
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    if (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    ) {
      return true;
    }
  } else if (ipVersion === 6) {
    if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function isValidEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length < 10 || endpoint.length > 1024) return false;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    return !isPrivateOrBlockedHost(parsed.hostname);
  } catch {
    return false;
  }
}

export async function saveSubscription(userId, subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (
    !isValidEndpoint(endpoint) ||
    typeof p256dh !== 'string' ||
    p256dh.length < 1 ||
    p256dh.length > MAX_KEY_LENGTH ||
    typeof auth !== 'string' ||
    auth.length < 1 ||
    auth.length > MAX_KEY_LENGTH
  ) {
    return false;
  }

  // Enforce per-user cap by keeping at most MAX_SUBSCRIPTIONS_PER_USER endpoints.
  const existing = await query('SELECT id FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  if (existing.rows.length === 0) {
    const countRes = await query('SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1', [userId]);
    if (countRes.rows[0].count >= MAX_SUBSCRIPTIONS_PER_USER) {
      await query(
        `DELETE FROM push_subscriptions
         WHERE id = (SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1)`,
        [userId]
      );
    }
  }

  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
    [userId, endpoint, p256dh, auth]
  );
  return true;
}

export async function removeSubscription(userId, endpoint) {
  if (typeof endpoint !== 'string' || !endpoint) return;
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}

export async function sendPushToUser(userId, payload) {
  const subsRes = await query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  if (subsRes.rows.length === 0) return;

  const { publicKey, privateKey } = await getVapidKeys();
  if (configuredKeyId !== publicKey) {
    const subject = process.env.VAPID_SUBJECT || 'mailto:otonari@example.com';
    webPush.setVapidDetails(subject, publicKey, privateKey);
    configuredKeyId = publicKey;
  }

  const body = JSON.stringify(payload);
  const sender =
    customSender ?? ((sub, msg) => webPush.sendNotification(sub, msg, { TTL: 3600, timeout: 10_000 }));

  for (const row of subsRes.rows) {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await sender(sub, body);
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]);
      } else {
        console.error('Web Push delivery failed:', error?.message ?? error);
      }
    }
  }
}
