import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { closeDatabase, query } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';
import { createApp } from '../index.js';
import { checkReminders } from '../services/reminders.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('v3 Slice 1: Core upgrades, neighborhood stats, pause/edit, dup nickname, auto-expire, abuse guards', () => {
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

  async function join(code, nickname, lang = 'en') {
    const r = await req('POST', '/api/join', { body: { code, nickname, lang } });
    assert.equal(r.status, 201);
    return r.data;
  }

  before(async () => {
    prevUploadsDir = process.env.UPLOADS_DIR;
    prevDemoMode = process.env.DEMO_MODE;
    prevDisableRateLimit = process.env.DISABLE_RATE_LIMIT;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otonari-v3-core-'));
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
    process.env.DISABLE_RATE_LIMIT = 'true';
    await seedDatabase({ quiet: true });
  });

  after(async () => {
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

  it('rejects case-insensitive duplicate active nicknames per group and allows reuse after leaving', async () => {
    const rahim = await join('SAKURA-2611', 'Rahim', 'en');

    const dup = await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: '  rahim  ', lang: 'bn' } });
    assert.equal(dup.status, 409);

    // Same nickname in a different building is permitted
    const otherGroup = await req('POST', '/api/join', { body: { code: 'HAMA-3CHOME', nickname: 'Rahim', lang: 'en' } });
    assert.equal(otherGroup.status, 201);

    // After leaving, nickname can be reused in the original building
    assert.equal((await req('POST', '/api/leave', { token: rahim.token })).status, 204);
    const rejoin = await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'en' } });
    assert.equal(rejoin.status, 201);
  });

  it('edits item max_days, spot, paused and blocks borrowing while paused', async () => {
    const rahim = await join('SAKURA-2611', 'Rahim', 'en');
    const ayesha = await join('SAKURA-2611', 'Nadia', 'bn');

    const created = await req('POST', '/api/items', {
      token: rahim.token,
      body: { item_key: 'bicycle_pump', max_days: 2, spot: 'entrance' },
    });
    const itemId = created.data.id;

    // Invalid updates rejected
    assert.equal((await req('PATCH', `/api/items/${itemId}`, { token: rahim.token, body: {} })).status, 400);
    assert.equal((await req('PATCH', `/api/items/${itemId}`, { token: rahim.token, body: { max_days: 5 } })).status, 400);
    assert.equal((await req('PATCH', `/api/items/${itemId}`, { token: ayesha.token, body: { paused: true } })).status, 403);

    // Valid edit + pause
    assert.equal(
      (
        await req('PATCH', `/api/items/${itemId}`, {
          token: rahim.token,
          body: { max_days: 7, spot: 'bike_parking', paused: true },
        })
      ).status,
      204
    );

    const detail = await req('GET', `/api/items/${itemId}`, { token: ayesha.token });
    assert.equal(detail.data.max_days, 7);
    assert.equal(detail.data.spot, 'bike_parking');
    assert.equal(detail.data.paused, true);

    // Borrowing blocked while paused
    const start = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const end = new Date(Date.now() + 2 * HOUR_MS + 3 * DAY_MS).toISOString();
    assert.equal(
      (await req('POST', '/api/loans', { token: ayesha.token, body: { item_id: itemId, start_at: start, end_at: end } })).status,
      409
    );

    // Unpause -> borrowing succeeds
    assert.equal((await req('PATCH', `/api/items/${itemId}`, { token: rahim.token, body: { paused: false } })).status, 204);
    assert.equal(
      (await req('POST', '/api/loans', { token: ayesha.token, body: { item_id: itemId, start_at: start, end_at: end } })).status,
      201
    );
  });

  it('auto-expires stale pending requests past start_at and unblocks borrower', async () => {
    const rahim = await join('SAKURA-2611', 'Rahim', 'en');
    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const futonDryer = shelf.find((i) => i.item_key === 'futon_dryer');

    const start = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const end = new Date(Date.now() + 26 * HOUR_MS).toISOString();
    const loanRes = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: futonDryer.id, start_at: start, end_at: end },
    });
    const loanId = loanRes.data.loan.id;

    // Simulate start_at having passed without a response
    await query("UPDATE loans SET start_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [loanId]);
    await checkReminders();

    const updated = await req('GET', `/api/loans/${loanId}`, { token: rahim.token });
    assert.equal(updated.data.loan.status, 'expired');
    assert.ok(updated.data.messages.some((m) => m.phrase_key === 'sys.expired'));

    // Borrower is now unblocked to submit a fresh request
    const retry = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: futonDryer.id, start_at: start, end_at: end },
    });
    assert.equal(retry.status, 201);
  });

  it('returns accurate neighborhood connection stats including cross-language loans', async () => {
    const rahim = await join('SAKURA-2611', 'Rahim', 'en');
    const statsRes = await req('GET', '/api/group/stats', { token: rahim.token });
    assert.equal(statsRes.status, 200);
    assert.equal(statsRes.data.members, 6); // 5 seeded + Rahim
    assert.equal(statsRes.data.items, 12);
    assert.equal(statsRes.data.completed_loans, 1); // Maria (en) -> Tanaka (ja)
    assert.equal(statsRes.data.cross_language_loans, 1);
  });

  it('enforces max 50 active items per user', async () => {
    const rahim = await join('SAKURA-2611', 'Rahim', 'en');
    for (let i = 0; i < 50; i += 1) {
      await query(
        "INSERT INTO items (owner_id, group_id, item_key, max_days, spot) VALUES ($1, $2, 'ladder', 1, 'entrance')",
        [rahim.user.id, rahim.user.group_id]
      );
    }
    const overCap = await req('POST', '/api/items', {
      token: rahim.token,
      body: { item_key: 'ladder', max_days: 1, spot: 'entrance' },
    });
    assert.equal(overCap.status, 409);
  });

  it('supports structured issue/damage report (with optional EXIF-stripped photo) and thank-you stamps', async () => {
    const usersRes = await req('GET', '/api/demo/users');
    const mariaInfo = usersRes.data.find((u) => u.nickname === 'Maria');
    const tanakaInfo = usersRes.data.find((u) => u.nickname === 'Tanaka');
    const maria = (await req('POST', '/api/demo/login', { body: { user_id: mariaInfo.id } })).data;
    const tanaka = (await req('POST', '/api/demo/login', { body: { user_id: tanakaInfo.id } })).data;

    // Seeded returned loan (Maria borrowed Tanaka's projector)
    const loans = (await req('GET', '/api/loans', { token: maria.token })).data;
    const returnedLoanId = loans.borrowing[0].id;

    // Invalid stamp rejected
    assert.equal(
      (await req('POST', `/api/loans/${returnedLoanId}/stamp`, { token: maria.token, body: { stamp_key: 'hack' } })).status,
      400
    );

    // Valid thank-you stamp on returned loan
    const stampRes = await req('POST', `/api/loans/${returnedLoanId}/stamp`, {
      token: maria.token,
      body: { stamp_key: 'stamp.bigThanks' },
    });
    assert.equal(stampRes.status, 200);
    assert.equal(stampRes.data.messages.at(-1).phrase_key, 'stamp.bigThanks');

    // Structured issue report WITH optional PNG photo
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const form = new FormData();
    form.append('issue_key', 'issue.damaged');
    form.append('photo', new Blob([validPng], { type: 'image/png' }), 'scratch.png');
    const issueRes = await fetch(`${baseUrl}/api/loans/${returnedLoanId}/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tanaka.token}` },
      body: form,
    });
    assert.equal(issueRes.status, 200);
    const issueData = await issueRes.json();
    assert.match(issueData.loan.issue_photo, /^\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal(issueData.messages.at(-1).phrase_key, 'issue.damaged');
    assert.equal(issueData.messages.at(-1).params.photo, issueData.loan.issue_photo);

    // Issue report on pending loan rejected (409) & stamp on pending loan rejected (409)
    const rahim = await join('SAKURA-2611', 'Rahim', 'en');
    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const ladder = shelf.find((i) => i.item_key === 'ladder');
    const pendingLoan = (
      await req('POST', '/api/loans', {
        token: rahim.token,
        body: {
          item_id: ladder.id,
          start_at: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
          end_at: new Date(Date.now() + 26 * HOUR_MS).toISOString(),
        },
      })
    ).data.loan;

    assert.equal(
      (await req('POST', `/api/loans/${pendingLoan.id}/issue`, { token: rahim.token, body: { issue_key: 'issue.damaged' } })).status,
      409
    );
    assert.equal(
      (await req('POST', `/api/loans/${pendingLoan.id}/stamp`, { token: rahim.token, body: { stamp_key: 'stamp.clean' } })).status,
      409
    );
  });
});
