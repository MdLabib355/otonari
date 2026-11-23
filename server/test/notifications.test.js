import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { afterCommit, closeDatabase, query, withTransaction } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';
import { createApp } from '../index.js';
import { activeStreamCount, disconnectAll } from '../services/events.js';
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
    disconnectAll();
    await seedDatabase({ quiet: true });
  });

  after(async () => {
    resetPushSender();
    disconnectAll();
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

  it('pushes instant SSE updates on authenticated fetch stream, enforces max-5 stream cap, and supports mark-all-read', async () => {
    assert.equal((await fetch(`${baseUrl}/api/events`)).status, 401);

    const demoUsers = (await req('GET', '/api/demo/users')).data;
    const sato = (
      await req('POST', '/api/demo/login', { body: { user_id: demoUsers.find((u) => u.nickname === 'Sato').id } })
    ).data;
    const rahim = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'en' } })).data;

    // Open 6 concurrent streams -> oldest is evicted so active count stays capped at 5
    const controllers = [];
    const readers = [];
    const decoder = new TextDecoder();
    for (let i = 0; i < 6; i += 1) {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const sseRes = await fetch(`${baseUrl}/api/events`, {
        headers: { Authorization: `Bearer ${sato.token}` },
        signal: ctrl.signal,
      });
      assert.equal(sseRes.status, 200);
      assert.match(sseRes.headers.get('content-type'), /text\/event-stream/);
      const reader = sseRes.body.getReader();
      const first = await reader.read();
      assert.ok(decoder.decode(first.value).includes(': connected'));
      readers.push(reader);
    }
    assert.equal(activeStreamCount(sato.user.id), 5);

    // Rahim sends borrow request -> Sato's active stream immediately receives SSE 'event: update'
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

    const eventChunk = await readers[5].read();
    const eventText = decoder.decode(eventChunk.value);
    assert.ok(eventText.includes('event: update'));
    assert.ok(eventText.includes('"phrase_key":"request"'));

    for (const ctrl of controllers) ctrl.abort();
    disconnectAll();
    assert.equal(activeStreamCount(sato.user.id), 0);

    // Mark-all-read clears all piled-up unread notifications
    const unreadBefore = (await req('GET', '/api/inbox', { token: sato.token })).data;
    assert.equal(unreadBefore.length, 1);
    const readAll = await req('POST', '/api/inbox/read-all', { token: sato.token });
    assert.equal(readAll.status, 200);
    assert.equal(readAll.data.updated, 1);
    assert.equal((await req('GET', '/api/inbox', { token: sato.token })).data.length, 0);
  });

  it('auto-generates & persists VAPID keys, blocks SSRF endpoints, fans out localized push, prunes 410s, and revokes push + SSE on lost-phone restore', async () => {
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

    // SSRF & invalid endpoints rejected 400
    for (const badEndpoint of [
      'ftp://evil.example/push',
      'http://localhost:3001/api/health',
      'https://127.0.0.1/push',
      'https://169.254.169.254/latest/meta-data',
      'https://10.0.0.5/internal',
      'https://db.internal/push',
    ]) {
      assert.equal(
        (
          await req('POST', '/api/push/subscribe', {
            token: rahim.token,
            body: { endpoint: badEndpoint, keys: { p256dh: 'abc', auth: 'xyz' } },
          })
        ).status,
        400,
        `Expected 400 for blocked endpoint ${badEndpoint}`
      );
    }

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

    // Deterministic waiter (zero timing flakiness)
    const delivered = [];
    let attemptedCount = 0;
    let resolveDone;
    const allPushSettled = new Promise((resolve) => {
      resolveDone = resolve;
    });

    setPushSenderForTest(async (sub, body) => {
      attemptedCount += 1;
      try {
        if (sub.endpoint === staleEndpoint) {
          const err = new Error('Gone');
          err.statusCode = 410;
          throw err;
        }
        delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
      } finally {
        if (attemptedCount === 2) resolveDone();
      }
    });

    const item = (await query('SELECT * FROM items WHERE owner_id = $1 LIMIT 1', [sato.user.id])).rows[0];
    await query(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status)
       VALUES ($1, $2, $3, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 hour', 'active')`,
      [item.id, rahim.user.id, sato.user.id]
    );

    await checkReminders();
    await allPushSettled;
    // Wait one microtask tick for 410 DELETE query to finish
    await new Promise((r) => setImmediate(r));

    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].endpoint, goodEndpoint);
    assert.ok(delivered[0].payload.body.includes('রিমাইন্ডার'));
    assert.match(delivered[0].payload.url, /^\/loan\/\d+$/);

    // Verify 410 stale subscription was automatically pruned from PostgreSQL
    let remainingSubs = await query('SELECT endpoint FROM push_subscriptions WHERE user_id = $1', [rahim.user.id]);
    assert.deepEqual(
      remainingSubs.rows.map((r) => r.endpoint),
      [goodEndpoint]
    );

    // Lost-phone restore via manager revokes SSE stream (event: revoked) AND deletes push_subscriptions!
    const mgr = (await req('POST', '/api/demo/manager-login')).data;
    const mgrGroups = (await req('GET', '/api/manager/me', { token: mgr.token })).data.groups;
    const sakura = mgrGroups.find((g) => g.code === 'SAKURA-2611');

    const ctrl = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/events`, {
      headers: { Authorization: `Bearer ${rahim.token}` },
      signal: ctrl.signal,
    });
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // ': connected'

    const restoreCode = (
      await req('POST', `/api/manager/groups/${sakura.id}/members/${rahim.user.id}/transfer-code`, {
        token: mgr.token,
      })
    ).data.code;
    const restored = await req('POST', '/api/restore', { body: { code: restoreCode } });
    assert.equal(restored.status, 200);

    const revokedChunk = await reader.read();
    assert.ok(decoder.decode(revokedChunk.value).includes('event: revoked'));
    ctrl.abort();

    remainingSubs = await query('SELECT endpoint FROM push_subscriptions WHERE user_id = $1', [rahim.user.id]);
    assert.equal(remainingSubs.rows.length, 0);
  });

  it('never fires afterCommit hooks on rolled-back transactions and hides join code from pending/rejected applicants', async () => {
    let hookRan = false;
    await assert.rejects(
      () =>
        withTransaction(async (client) => {
          afterCommit(client, () => {
            hookRan = true;
          });
          throw new Error('simulated failure');
        }),
      /simulated failure/
    );
    assert.equal(hookRan, false);

    // Enable approval on Sakura Heights, join as pending applicant, verify /api/me hides group.code & manager_id
    const mgr = (await req('POST', '/api/demo/manager-login')).data;
    const sakura = (await req('GET', '/api/manager/me', { token: mgr.token })).data.groups.find(
      (g) => g.code === 'SAKURA-2611'
    );
    assert.equal(
      (
        await req('PATCH', `/api/manager/groups/${sakura.id}`, {
          token: mgr.token,
          body: { require_approval: true },
        })
      ).status,
      200
    );

    const applicant = (
      await req('POST', '/api/join', {
        body: { code: 'SAKURA-2611', nickname: 'PendingGuest', lang: 'en' },
      })
    ).data;
    assert.equal(applicant.user.status, 'pending');
    assert.equal(applicant.group.code, undefined);
    assert.equal(applicant.group.manager_id, undefined);

    // Reject & rotate code: applicant calling GET /api/me still cannot see rotated code
    await req('POST', `/api/manager/groups/${sakura.id}/members/${applicant.user.id}/reject`, { token: mgr.token });
    await req('POST', `/api/manager/groups/${sakura.id}/rotate-code`, { token: mgr.token });
    const meAfter = await req('GET', '/api/me', { token: applicant.token });
    assert.equal(meAfter.status, 200);
    assert.equal(meAfter.data.user.status, 'rejected');
    assert.equal(meAfter.data.group.code, undefined);
    assert.equal(meAfter.data.group.manager_id, undefined);
  });
});
