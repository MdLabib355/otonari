import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { closeDatabase, query } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';
import { createApp } from '../index.js';
import { activeStreamCount } from '../services/events.js';
import { resetPushSender, setPushSenderForTest } from '../services/push.js';
import { checkReminders } from '../services/reminders.js';

const HOUR_MS = 60 * 60 * 1000;

describe('v3 Slice 4: 3-Layer Notification Pipeline (Inbox read-all, Authenticated SSE, Web Push + VAPID)', () => {
  let server;
  let baseUrl;
  let tempDir;
  let prevUploadsDir;
  let prevDemoMode;
  let prevDisableRateLimit;

  async function req(method, urlPath, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${urlPath}`, { method, headers, body: payload });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data };
  }

  before(async () => {
    prevUploadsDir = process.env.UPLOADS_DIR;
    prevDemoMode = process.env.DEMO_MODE;
    prevDisableRateLimit = process.env.DISABLE_RATE_LIMIT;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otonari-notif-test-'));
    process.env.UPLOADS_DIR = tempDir;
    process.env.DEMO_MODE = 'true';
    process.env.DISABLE_RATE_LIMIT = 'true';

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => {
    resetPushSender();
    await seedDatabase({ quiet: true });
  });

  after(async () => {
    resetPushSender();
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    if (prevUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prevUploadsDir;
    if (prevDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = prevDemoMode;
    if (prevDisableRateLimit === undefined) delete process.env.DISABLE_RATE_LIMIT;
    else process.env.DISABLE_RATE_LIMIT = prevDisableRateLimit;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('pushes instant SSE updates on authenticated fetch stream and enforces max-5 streams + mark-all-read', async () => {
    // Unauthenticated SSE rejected 401
    assert.equal((await fetch(`${baseUrl}/api/events`)).status, 401);

    const demoUsers = (await req('GET', '/api/demo/users')).data;
    const sato = (
      await req('POST', '/api/demo/login', { body: { user_id: demoUsers.find((u) => u.nickname === 'Sato').id } })
    ).data;
    const rahim = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'en' } })).data;

    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/events`, {
      headers: { Authorization: `Bearer ${sato.token}` },
      signal: controller.signal,
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get('content-type'), /text\/event-stream/);

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();

    // Read initial ': connected' comment
    const first = await reader.read();
    assert.ok(decoder.decode(first.value).includes(': connected'));
    assert.equal(activeStreamCount(sato.user.id), 1);

    // Rahim sends borrow request -> Sato immediately receives SSE 'event: update'
    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const futonDryer = shelf.find((i) => i.item_key === 'futon_dryer');
    await req('POST', '/api/loans', {
      token: rahim.token,
      body: {
        item_id: futonDryer.id,
        start_at: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
        end_at: new Date(Date.now() + 26 * HOUR_MS).toISOString(),
      },
    });

    const eventChunk = await reader.read();
    const eventText = decoder.decode(eventChunk.value);
    assert.ok(eventText.includes('event: update'));
    assert.ok(eventText.includes('"phrase_key":"request"'));

    controller.abort();

    // Mark-all-read clears all piled-up unread notifications
    const unreadBefore = (await req('GET', '/api/inbox', { token: sato.token })).data;
    assert.equal(unreadBefore.length, 1);
    const readAll = await req('POST', '/api/inbox/read-all', { token: sato.token });
    assert.equal(readAll.status, 200);
    assert.equal(readAll.data.updated, 1);
    assert.equal((await req('GET', '/api/inbox', { token: sato.token })).data.length, 0);
  });

  it('auto-generates & persists VAPID keys, fans out localized Web Push on reminder expiry, and prunes 410 subscriptions', async () => {
    const rahim = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'bn' } })).data;
    const demoUsers = (await req('GET', '/api/demo/users')).data;
    const sato = (
      await req('POST', '/api/demo/login', { body: { user_id: demoUsers.find((u) => u.nickname === 'Sato').id } })
    ).data;

    // Auto-generated VAPID key stays stable across calls
    const k1 = await req('GET', '/api/push/vapid-key', { token: rahim.token });
    const k2 = await req('GET', '/api/push/vapid-key', { token: rahim.token });
    assert.equal(k1.status, 200);
    assert.ok(k1.data.publicKey.length > 20);
    assert.equal(k1.data.publicKey, k2.data.publicKey);

    // Invalid endpoint rejected 400
    assert.equal(
      (
        await req('POST', '/api/push/subscribe', {
          token: rahim.token,
          body: { endpoint: 'ftp://evil.example/push', keys: { p256dh: 'abc', auth: 'xyz' } },
        })
      ).status,
      400
    );

    // Register valid subscription for Rahim + a stale subscription that returns 410
    const goodEndpoint = 'https://push.example.com/sub/rahim-good';
    const staleEndpoint = 'https://push.example.com/sub/rahim-stale';
    assert.equal(
      (
        await req('POST', '/api/push/subscribe', {
          token: rahim.token,
          body: { endpoint: goodEndpoint, keys: { p256dh: 'key1', auth: 'auth1' } },
        })
      ).status,
      201
    );
    assert.equal(
      (
        await req('POST', '/api/push/subscribe', {
          token: rahim.token,
          body: { endpoint: staleEndpoint, keys: { p256dh: 'key2', auth: 'auth2' } },
        })
      ).status,
      201
    );

    const delivered = [];
    setPushSenderForTest(async (sub, body) => {
      if (sub.endpoint === staleEndpoint) {
        const err = new Error('Gone');
        err.statusCode = 410;
        throw err;
      }
      delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
    });

    // Insert overdue active loan for Rahim -> checkReminders() fires localized Bengali push & prunes 410 sub
    const item = (await query("SELECT * FROM items WHERE owner_id = $1 LIMIT 1", [sato.user.id])).rows[0];
    await query(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status)
       VALUES ($1, $2, $3, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 hour', 'active')`,
      [item.id, rahim.user.id, sato.user.id]
    );

    await checkReminders();
    // Allow async post-commit push hooks to settle
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].endpoint, goodEndpoint);
    assert.ok(delivered[0].payload.body.includes('রিমাইন্ডার')); // Bengali localized overdue push!
    assert.match(delivered[0].payload.url, /^\/loan\/\d+$/);

    // Verify 410 stale subscription was automatically pruned from PostgreSQL
    const remainingSubs = await query('SELECT endpoint FROM push_subscriptions WHERE user_id = $1', [rahim.user.id]);
    assert.deepEqual(
      remainingSubs.rows.map((r) => r.endpoint),
      [goodEndpoint]
    );

    // Unsubscribe cleanly
    assert.equal(
      (await req('DELETE', '/api/push/subscribe', { token: rahim.token, body: { endpoint: goodEndpoint } })).status,
      204
    );
    const afterDelete = await query('SELECT endpoint FROM push_subscriptions WHERE user_id = $1', [rahim.user.id]);
    assert.equal(afterDelete.rows.length, 0);
  });
});
