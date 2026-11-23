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

function makeJpegWithExif() {
  const soi = Buffer.from([0xff, 0xd8]);
  const exifPayload = Buffer.from('Exif\0\0GPS_SECRET_COORDS', 'ascii');
  const app1Len = Buffer.alloc(2);
  app1Len.writeUInt16BE(exifPayload.length + 2, 0);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), app1Len, exifPayload]);
  const sosAndEoi = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xbb, 0xff, 0xd9]);
  return Buffer.concat([soi, app1, sosAndEoi]);
}

const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

describe('Slice 3: End-to-end API integration tests (T01-T38)', () => {
  let server;
  let baseUrl;
  let tempDir;
  let prevUploadsDir;
  let prevDemoMode;
  let prevDisableRateLimit;

  async function req(method, urlPath, { token, body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
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

  async function joinUser(code, nickname, lang = 'en') {
    const res = await req('POST', '/api/join', { body: { code, nickname, lang } });
    assert.equal(res.status, 201);
    return res.data;
  }

  async function demoLogin(nickname) {
    const usersRes = await req('GET', '/api/demo/users');
    const target = usersRes.data.find((u) => u.nickname === nickname);
    assert.ok(target, `demo user ${nickname} not found`);
    const loginRes = await req('POST', '/api/demo/login', { body: { user_id: target.id } });
    assert.equal(loginRes.status, 200);
    return loginRes.data;
  }

  before(async () => {
    prevUploadsDir = process.env.UPLOADS_DIR;
    prevDemoMode = process.env.DEMO_MODE;
    prevDisableRateLimit = process.env.DISABLE_RATE_LIMIT;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otonari-api-test-'));
    process.env.UPLOADS_DIR = tempDir;
    process.env.DEMO_MODE = 'true';
    process.env.DISABLE_RATE_LIMIT = 'true';

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
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

  it('T01-T02: health check, security headers, and JSON 404 for unknown API paths', async () => {
    const health = await req('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.data, { ok: true, db: 'ok', demo_mode: true });
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.equal(health.headers.get('referrer-policy'), 'same-origin');

    const missing = await req('GET', '/api/unknown-endpoint');
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.data, { error: 'Not found' });
  });

  it('T03-T09: group creation (manager auth), NFKC duplicate warning, lookup, join, and /api/me', async () => {
    // Unauthenticated group creation must fail 401
    assert.equal(
      (await req('POST', '/api/groups', { body: { name: 'NoAuth Apt', type: 'building', city: 'Nagasaki' } })).status,
      401
    );
    const mgr = (await req('POST', '/api/demo/manager-login')).data;

    const created = await req('POST', '/api/groups', {
      token: mgr.token,
      body: { name: 'Dejima Mansion', type: 'building', city: 'Nagasaki' },
    });
    assert.equal(created.status, 201);
    assert.match(created.data.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);

    // Duplicate warning must not leak join code.
    const dup = await req('POST', '/api/groups', {
      token: mgr.token,
      body: { name: 'dejima   mansion', type: 'building', city: 'NAGASAKI' },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.existing_name, 'Dejima Mansion');
    assert.equal(dup.data.code, undefined);

    const dupForced = await req('POST', '/api/groups', {
      token: mgr.token,
      body: { name: 'dejima mansion', type: 'building', city: 'Nagasaki', create_anyway: true },
    });
    assert.equal(dupForced.status, 201);

    const lookup = await req('GET', '/api/groups/by-code/sakura-2611');
    assert.equal(lookup.status, 200);
    assert.equal(lookup.data.name, 'Sakura Heights');
    assert.equal(lookup.data.memberCount, 5);
    assert.equal((await req('GET', '/api/groups/by-code/NOPE-0000')).status, 404);

    // Join validation
    assert.equal((await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: '', lang: 'en' } })).status, 400);
    assert.equal((await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'fr' } })).status, 400);
    assert.equal((await req('POST', '/api/join', { body: { code: 'BAD-CODE', nickname: 'Rahim', lang: 'en' } })).status, 404);

    const rahim = await joinUser('SAKURA-2611', 'Rahim', 'en');
    assert.equal((await req('GET', '/api/me')).status, 401);
    assert.equal((await req('GET', '/api/me', { token: 'invalid-token' })).status, 401);

    const patched = await req('PATCH', '/api/me', {
      token: rahim.token,
      body: { lang: 'ja-easy', elder_mode: true },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.data.user.lang, 'ja-easy');
    assert.equal(patched.data.user.elder_mode, true);
  });

  it('T10-T15: shelf, optional item photo with EXIF stripping, cross-group auth, trusted toggle, delete', async () => {
    const rahim = await joinUser('SAKURA-2611', 'Rahim', 'en');
    const hamaUser = await joinUser('HAMA-3CHOME', 'Kenji', 'ja');

    // Invalid item payloads
    assert.equal(
      (await req('POST', '/api/items', { token: rahim.token, body: { item_key: 'custom_hack', max_days: 3, spot: 'entrance' } })).status,
      400
    );

    // JSON item without photo
    const plain = await req('POST', '/api/items', {
      token: rahim.token,
      body: { item_key: 'bicycle_pump', max_days: 2, spot: 'bike_parking' },
    });
    assert.equal(plain.status, 201);
    assert.equal(plain.data.photo_url, null);

    // Multipart item WITH EXIF JPEG photo
    const form = new FormData();
    form.append('item_key', 'blender');
    form.append('max_days', '3');
    form.append('spot', 'entrance');
    form.append('trusted_only', 'true');
    form.append('photo', new Blob([makeJpegWithExif()], { type: 'image/jpeg' }), 'blender.jpg');
    const withPhoto = await req('POST', '/api/items', { token: rahim.token, form });
    assert.equal(withPhoto.status, 201);
    assert.equal(withPhoto.data.trusted_only, true);
    assert.match(withPhoto.data.photo_url, /^\/uploads\/[0-9a-f-]{36}\.jpg$/);

    // Served photo must have EXIF stripped
    const photoRes = await fetch(`${baseUrl}${withPhoto.data.photo_url}`);
    assert.equal(photoRes.status, 200);
    const bytes = Buffer.from(await photoRes.arrayBuffer());
    assert.equal(bytes.includes(Buffer.from('GPS_SECRET_COORDS')), false);

    // Spoofed photo rejected
    const badForm = new FormData();
    badForm.append('item_key', 'blender');
    badForm.append('max_days', '3');
    badForm.append('spot', 'entrance');
    badForm.append('photo', new Blob(['plain text not image'], { type: 'image/jpeg' }), 'fake.jpg');
    assert.equal((await req('POST', '/api/items', { token: rahim.token, form: badForm })).status, 400);

    // Cross-group access blocked
    assert.equal((await req('GET', `/api/items/${withPhoto.data.id}`, { token: hamaUser.token })).status, 403);
    assert.equal(
      (await req('PATCH', `/api/items/${withPhoto.data.id}`, { token: hamaUser.token, body: { trusted_only: false } })).status,
      403
    );

    // Owner toggles trusted_only and deletes available item
    assert.equal(
      (await req('PATCH', `/api/items/${withPhoto.data.id}`, { token: rahim.token, body: { trusted_only: false } })).status,
      204
    );
    assert.equal((await req('DELETE', `/api/items/${withPhoto.data.id}`, { token: rahim.token })).status, 204);
    assert.equal((await req('GET', `/api/items/${withPhoto.data.id}`, { token: rahim.token })).status, 404);
  });

  it('T16-T26: exact future dates, auto-decline, cancel-accepted anti-deadlock, handover/return, trust, quick replies', async () => {
    const rahim = await joinUser('SAKURA-2611', 'Rahim', 'en');
    const sato = await demoLogin('Sato');
    const maria = await demoLogin('Maria');

    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const futonDryer = shelf.find((i) => i.item_key === 'futon_dryer');
    const projector = shelf.find((i) => i.item_key === 'projector'); // trusted_only

    // Untrusted Rahim blocked from trusted_only projector
    const start5d = new Date(Date.now() + 5 * DAY_MS).toISOString();
    const end7d = new Date(Date.now() + 7 * DAY_MS).toISOString();
    assert.equal(
      (await req('POST', '/api/loans', { token: rahim.token, body: { item_id: projector.id, start_at: start5d, end_at: end7d } })).status,
      403
    );

    // Past date & >14 days ahead rejected
    assert.equal(
      (
        await req('POST', '/api/loans', {
          token: rahim.token,
          body: {
            item_id: futonDryer.id,
            start_at: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
            end_at: new Date(Date.now() + 21 * HOUR_MS).toISOString(),
          },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await req('POST', '/api/loans', {
          token: rahim.token,
          body: {
            item_id: futonDryer.id,
            start_at: new Date(Date.now() + 20 * DAY_MS).toISOString(),
            end_at: new Date(Date.now() + 21 * DAY_MS).toISOString(),
          },
        })
      ).status,
      400
    );

    // Borrowing own item blocked
    assert.equal(
      (await req('POST', '/api/loans', { token: sato.token, body: { item_id: futonDryer.id, start_at: start5d, end_at: end7d } })).status,
      403
    );

    // Valid exact +5 day borrow request by Rahim + competing request by Maria
    const reqRahim = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: futonDryer.id, start_at: start5d, end_at: end7d },
    });
    assert.equal(reqRahim.status, 201);
    const loanId = reqRahim.data.loan.id;

    // Duplicate request blocked with existing loan_id
    const dupReq = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: futonDryer.id, start_at: start5d, end_at: end7d },
    });
    assert.equal(dupReq.status, 409);
    assert.equal(dupReq.data.loan_id, loanId);

    const reqMaria = await req('POST', '/api/loans', {
      token: maria.token,
      body: { item_id: futonDryer.id, start_at: start5d, end_at: end7d },
    });
    assert.equal(reqMaria.status, 201);

    // Sato accepts Rahim -> Maria auto-declined
    const accepted = await req('POST', `/api/loans/${loanId}/accept`, { token: sato.token });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.loan.status, 'accepted');
    assert.equal(accepted.data.item.status, 'reserved');

    const mariaLoan = await req('GET', `/api/loans/${reqMaria.data.loan.id}`, { token: maria.token });
    assert.equal(mariaLoan.data.loan.status, 'declined');
    assert.ok(mariaLoan.data.messages.some((m) => m.phrase_key === 'decline'));

    // Test cancel-accepted anti-deadlock (lender cancels before handover photo -> item becomes available again)
    const cancelledAcc = await req('POST', `/api/loans/${loanId}/cancel`, { token: sato.token });
    assert.equal(cancelledAcc.status, 200);
    assert.equal(cancelledAcc.data.loan.status, 'cancelled');
    assert.equal(cancelledAcc.data.item.status, 'available');

    // Re-request & complete full handover -> active -> return -> return-confirmed flow
    const req2 = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: futonDryer.id, start_at: start5d, end_at: end7d },
    });
    assert.equal(req2.status, 201);
    const loan2Id = req2.data.loan.id;
    assert.equal((await req('POST', `/api/loans/${loan2Id}/accept`, { token: sato.token })).status, 200);

    // Received before handover photo -> 409
    assert.equal((await req('POST', `/api/loans/${loan2Id}/received`, { token: rahim.token })).status, 409);

    // Handover photo by borrower -> 403; by lender -> 200
    const handForm1 = new FormData();
    handForm1.append('photo', new Blob([VALID_PNG], { type: 'image/png' }), 'handover.png');
    assert.equal((await req('POST', `/api/loans/${loan2Id}/handover`, { token: rahim.token, form: handForm1 })).status, 403);

    const handForm2 = new FormData();
    handForm2.append('photo', new Blob([VALID_PNG], { type: 'image/png' }), 'handover.png');
    const handRes = await req('POST', `/api/loans/${loan2Id}/handover`, { token: sato.token, form: handForm2 });
    assert.equal(handRes.status, 200);
    assert.match(handRes.data.loan.handover_photo, /^\/uploads\/[0-9a-f-]{36}\.png$/);

    // Cancel after handover photo -> 409
    assert.equal((await req('POST', `/api/loans/${loan2Id}/cancel`, { token: rahim.token })).status, 409);

    // Received -> active
    const recRes = await req('POST', `/api/loans/${loan2Id}/received`, { token: rahim.token });
    assert.equal(recRes.status, 200);
    assert.equal(recRes.data.loan.status, 'active');
    assert.equal(recRes.data.item.status, 'lent');

    // Quick reply validation
    assert.equal(
      (await req('POST', `/api/loans/${loan2Id}/quick-reply`, { token: rahim.token, body: { phrase_key: 'free text!' } })).status,
      400
    );
    assert.equal(
      (await req('POST', `/api/loans/${loan2Id}/quick-reply`, { token: maria.token, body: { phrase_key: 'qr.thanks' } })).status,
      403
    );
    assert.equal(
      (await req('POST', `/api/loans/${loan2Id}/quick-reply`, { token: rahim.token, body: { phrase_key: 'qr.thanks' } })).status,
      200
    );

    // Return photo + confirm -> returned on time -> Rahim now trusted for projector!
    const retForm = new FormData();
    retForm.append('photo', new Blob([makeJpegWithExif()], { type: 'image/jpeg' }), 'return.jpg');
    const retRes = await req('POST', `/api/loans/${loan2Id}/return`, { token: rahim.token, form: retForm });
    assert.equal(retRes.status, 200);
    assert.ok(retRes.data.loan.returned_at);

    const confRes = await req('POST', `/api/loans/${loan2Id}/return-confirmed`, { token: sato.token });
    assert.equal(confRes.status, 200);
    assert.equal(confRes.data.loan.status, 'returned');
    assert.equal(confRes.data.item.status, 'available');

    const projDetail = await req('GET', `/api/items/${projector.id}`, { token: rahim.token });
    assert.equal(projDetail.data.allowed_for_me, true);
  });

  it('T27-T34: reminders, sticky due-loans, lender polite ping + cooldown, inbox isolation, demo fast-forward auth', async () => {
    const rahim = await joinUser('SAKURA-2611', 'Rahim', 'en');
    const sato = await demoLogin('Sato');
    const maria = await demoLogin('Maria');

    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const futonDryer = shelf.find((i) => i.item_key === 'futon_dryer');

    const start = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const end = new Date(Date.now() + 50 * HOUR_MS).toISOString();
    const created = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: futonDryer.id, start_at: start, end_at: end },
    });
    const loanId = created.data.loan.id;
    await req('POST', `/api/loans/${loanId}/accept`, { token: sato.token });

    const handForm = new FormData();
    handForm.append('photo', new Blob([VALID_PNG], { type: 'image/png' }), 'h.png');
    await req('POST', `/api/loans/${loanId}/handover`, { token: sato.token, form: handForm });
    await req('POST', `/api/loans/${loanId}/received`, { token: rahim.token });

    // Demo login refused for non-demo real user Rahim
    assert.equal((await req('POST', '/api/demo/login', { body: { user_id: rahim.user.id } })).status, 403);

    // Demo fast-forward auth guard: 401 unauth, 403 outsider Maria, 204 participant Rahim
    assert.equal((await req('POST', `/api/demo/fast-forward/${loanId}`, { body: { to: 'dueSoon' } })).status, 401);
    assert.equal(
      (await req('POST', `/api/demo/fast-forward/${loanId}`, { token: maria.token, body: { to: 'dueSoon' } })).status,
      403
    );
    assert.equal(
      (await req('POST', `/api/demo/fast-forward/${loanId}`, { token: rahim.token, body: { to: 'dueSoon' } })).status,
      204
    );

    // Sticky due-loans shows dueSoon (overdue: false)
    const dueSoonList = await req('GET', '/api/due-loans', { token: rahim.token });
    assert.equal(dueSoonList.status, 200);
    assert.equal(dueSoonList.data.length, 1);
    assert.equal(dueSoonList.data[0].id, loanId);
    assert.equal(dueSoonList.data[0].overdue, false);

    // Lender polite ping BEFORE overdue -> pingNeedBack + immediate 429 cooldown
    assert.equal((await req('POST', `/api/loans/${loanId}/ping`, { token: rahim.token })).status, 403);
    const ping1 = await req('POST', `/api/loans/${loanId}/ping`, { token: sato.token });
    assert.equal(ping1.status, 200);
    assert.equal(ping1.data.messages.at(-1).phrase_key, 'pingNeedBack');

    const pingCooldown = await req('POST', `/api/loans/${loanId}/ping`, { token: sato.token });
    assert.equal(pingCooldown.status, 429);
    assert.ok(pingCooldown.data.retry_after_seconds >= 1);

    // Fast-forward to overdue -> sticky due-loans overdue: true; clear last_pinged_at to test pingOverdue
    assert.equal(
      (await req('POST', `/api/demo/fast-forward/${loanId}`, { token: sato.token, body: { to: 'overdue' } })).status,
      204
    );
    const overdueList = await req('GET', '/api/due-loans', { token: rahim.token });
    assert.equal(overdueList.data[0].overdue, true);

    await query("UPDATE loans SET last_pinged_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [loanId]);
    const ping2 = await req('POST', `/api/loans/${loanId}/ping`, { token: sato.token });
    assert.equal(ping2.status, 200);
    assert.equal(ping2.data.messages.at(-1).phrase_key, 'pingOverdue');

    // Inbox isolation: Maria cannot mark Rahim's unread messages as read
    const rahimInbox = await req('GET', '/api/inbox', { token: rahim.token });
    assert.ok(rahimInbox.data.length > 0);
    const rahimMsgIds = rahimInbox.data.map((m) => m.id);
    const stolenRead = await req('POST', '/api/inbox/read', { token: maria.token, body: { ids: rahimMsgIds } });
    assert.equal(stolenRead.data.updated, 0);

    // Once return photo uploaded, due-loans clears and ping returns 409
    const retForm = new FormData();
    retForm.append('photo', new Blob([VALID_PNG], { type: 'image/png' }), 'r.png');
    await req('POST', `/api/loans/${loanId}/return`, { token: rahim.token, form: retForm });
    await checkReminders();

    const afterReturnDue = await req('GET', '/api/due-loans', { token: rahim.token });
    assert.equal(afterReturnDue.data.length, 0);
    assert.equal((await req('POST', `/api/loans/${loanId}/ping`, { token: sato.token })).status, 409);
  });

  it('T35-T38: safe leaving, path traversal blocking, and rate limiting', async () => {
    const rahim = await joinUser('SAKURA-2611', 'Rahim', 'en');
    const sato = await demoLogin('Sato');
    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const ladder = shelf.find((i) => i.item_key === 'ladder');

    const start = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const end = new Date(Date.now() + 26 * HOUR_MS).toISOString();
    const loanRes = await req('POST', '/api/loans', {
      token: rahim.token,
      body: { item_id: ladder.id, start_at: start, end_at: end },
    });
    const loanId = loanRes.data.loan.id;
    await req('POST', `/api/loans/${loanId}/accept`, { token: sato.token });

    // Blocked while accepted loan exists
    assert.equal((await req('POST', '/api/leave', { token: rahim.token })).status, 409);

    // Cancel accepted loan -> now Rahim can leave cleanly
    assert.equal((await req('POST', `/api/loans/${loanId}/cancel`, { token: rahim.token })).status, 200);
    assert.equal((await req('POST', '/api/leave', { token: rahim.token })).status, 204);
    assert.equal((await req('GET', '/api/me', { token: rahim.token })).status, 401);

    // Path traversal blocked on /uploads
    assert.equal((await req('GET', '/uploads/..%2F..%2Fetc%2Fpasswd')).status, 400);
    assert.equal((await req('GET', '/uploads/not-a-uuid.jpg')).status, 400);

    // Rate limiting active when DISABLE_RATE_LIMIT is off (POST /api/groups limit = 10/hr)
    const mgr = (await req('POST', '/api/demo/manager-login')).data;
    process.env.DISABLE_RATE_LIMIT = 'false';
    let got429 = false;
    for (let i = 0; i < 12; i += 1) {
      const r = await req('POST', '/api/groups', {
        token: mgr.token,
        body: { name: `RateTest ${i}`, type: 'building', city: 'Nagasaki' },
      });
      if (r.status === 429) {
        got429 = true;
        assert.ok(r.headers.get('retry-after'));
        break;
      }
    }
    assert.equal(got429, true, 'Expected 429 from group creation rate limiter');
  });
});
