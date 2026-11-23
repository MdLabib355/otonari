import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { closeDatabase, query } from '../db/pool.js';
import { seedDatabase } from '../db/seed.js';
import { createApp } from '../index.js';

const HOUR_MS = 60 * 60 * 1000;
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

describe('v3 Slice 3: Manager Auth, Approval Toggle, Resident Moderation & Device Transfer/Restore', () => {
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

  before(async () => {
    prevUploadsDir = process.env.UPLOADS_DIR;
    prevDemoMode = process.env.DEMO_MODE;
    prevDisableRateLimit = process.env.DISABLE_RATE_LIMIT;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otonari-mgr-test-'));
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

  it('registers, validates bounds, enforces case-insensitive email uniqueness, supports multi-device sessions and domain separation', async () => {
    // Validation bounds: short password, >128 char password, bad email
    assert.equal(
      (await req('POST', '/api/manager/register', { body: { name: 'Ken', email: 'ken@apt.jp', password: 'short' } })).status,
      400
    );
    assert.equal(
      (await req('POST', '/api/manager/register', { body: { name: 'Ken', email: 'ken@apt.jp', password: 'x'.repeat(129) } })).status,
      400
    );
    assert.equal(
      (await req('POST', '/api/manager/register', { body: { name: 'Ken', email: 'not-an-email', password: 'Password123!' } })).status,
      400
    );

    // Valid registration
    const reg = await req('POST', '/api/manager/register', {
      body: { name: 'Kenji Manager', email: 'Kenji@Nagasaki.jp', password: 'StrongPassword99!' },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.manager.email, 'kenji@nagasaki.jp');
    assert.equal(reg.data.manager.password_hash, undefined);

    // Duplicate email (different case) -> 409
    assert.equal(
      (
        await req('POST', '/api/manager/register', {
          body: { name: 'Other', email: 'KENJI@nagasaki.jp', password: 'StrongPassword99!' },
        })
      ).status,
      409
    );

    // Generic 401 on wrong password & unknown email
    const badPw = await req('POST', '/api/manager/login', {
      body: { email: 'kenji@nagasaki.jp', password: 'WrongPassword!' },
    });
    const unknownEmail = await req('POST', '/api/manager/login', {
      body: { email: 'nobody@nagasaki.jp', password: 'StrongPassword99!' },
    });
    assert.equal(badPw.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(badPw.data.error, unknownEmail.data.error);

    // Second device login -> logout device 1 -> device 2 stays active!
    const dev2 = await req('POST', '/api/manager/login', {
      body: { email: 'kenji@nagasaki.jp', password: 'StrongPassword99!' },
    });
    assert.equal(dev2.status, 200);
    assert.equal((await req('POST', '/api/manager/logout', { token: reg.data.token })).status, 204);
    assert.equal((await req('GET', '/api/manager/me', { token: reg.data.token })).status, 401);
    assert.equal((await req('GET', '/api/manager/me', { token: dev2.data.token })).status, 200);

    // Strict domain separation: manager token cannot call resident /api/me; resident token cannot call /api/manager/me
    assert.equal((await req('GET', '/api/me', { token: dev2.data.token })).status, 401);
    const resident = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'en' } })).data;
    assert.equal((await req('GET', '/api/manager/me', { token: resident.token })).status, 401);

    // Expired manager session rejected 401
    await query("UPDATE manager_sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE token = $1", [dev2.data.token]);
    assert.equal((await req('GET', '/api/manager/me', { token: dev2.data.token })).status, 401);
  });

  it('enforces group ownership, rotates join codes without breaking logged-in residents, and handles approval toggle + manager_note privacy', async () => {
    const mgrA = (
      await req('POST', '/api/manager/register', {
        body: { name: 'Manager A', email: 'a@apt.jp', password: 'Password123!' },
      })
    ).data;
    const mgrB = (
      await req('POST', '/api/manager/register', {
        body: { name: 'Manager B', email: 'b@apt.jp', password: 'Password123!' },
      })
    ).data;

    const grp = (
      await req('POST', '/api/groups', {
        token: mgrA.token,
        body: { name: 'Harbor View', type: 'building', city: 'Nagasaki', require_approval: true },
      })
    ).data;
    assert.equal(grp.require_approval, true);

    // Cross-manager isolation -> 403; invalid non-int group ID -> 404
    assert.equal((await req('GET', `/api/manager/groups/${grp.id}/members`, { token: mgrB.token })).status, 403);
    assert.equal((await req('POST', `/api/manager/groups/${grp.id}/rotate-code`, { token: mgrB.token })).status, 403);
    assert.equal((await req('GET', '/api/manager/groups/abc/members', { token: mgrA.token })).status, 404);

    // Join preview exposes require_approval: true
    const preview = await req('GET', `/api/groups/by-code/${grp.code}`);
    assert.equal(preview.data.require_approval, true);

    // Applicant joins with private manager_note -> status 'pending', blocked from shelf (403) until approved
    const rahim = (
      await req('POST', '/api/join', {
        body: { code: grp.code, nickname: 'Rahim', lang: 'en', manager_note: 'Room 304' },
      })
    ).data;
    assert.equal(rahim.user.status, 'pending');
    assert.equal(rahim.user.manager_note, undefined); // never exposed on resident publicUser!
    assert.equal((await req('GET', '/api/me', { token: rahim.token })).status, 200);
    assert.equal((await req('GET', '/api/shelf', { token: rahim.token })).status, 403);

    // Manager sees pending request WITH manager_note, approves it
    const membersBefore = (await req('GET', `/api/manager/groups/${grp.id}/members`, { token: mgrA.token })).data;
    assert.equal(membersBefore.pending.length, 1);
    assert.equal(membersBefore.pending[0].manager_note, 'Room 304');
    assert.equal(membersBefore.pending[0].token, undefined);

    assert.equal(
      (await req('POST', `/api/manager/groups/${grp.id}/members/${rahim.user.id}/approve`, { token: mgrA.token })).status,
      204
    );
    assert.equal((await req('GET', '/api/shelf', { token: rahim.token })).status, 200);

    // Rotate join code: old code returns 404, new code works, Rahim stays logged in
    const rotated = await req('POST', `/api/manager/groups/${grp.id}/rotate-code`, { token: mgrA.token });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.data.code, grp.code);
    assert.equal((await req('GET', `/api/groups/by-code/${grp.code}`)).status, 404);
    assert.equal((await req('GET', `/api/groups/by-code/${rotated.data.code}`)).status, 200);
    assert.equal((await req('GET', '/api/me', { token: rahim.token })).status, 200);

    // Reject flow: rejected user blocked from shelf & nickname freed for future applicants
    const intruder = (
      await req('POST', '/api/join', { body: { code: rotated.data.code, nickname: 'Stranger', lang: 'en' } })
    ).data;
    assert.equal(
      (await req('POST', `/api/manager/groups/${grp.id}/members/${intruder.user.id}/reject`, { token: mgrA.token })).status,
      204
    );
    assert.equal((await req('GET', '/api/shelf', { token: intruder.token })).status, 403);
    assert.equal((await req('GET', '/api/me', { token: intruder.token })).data.user.status, 'rejected');
  });

  it('moderates residents safely (blocks removal on active loan, cancels unhanded-over accepted loan, revokes token) and lists issues', async () => {
    const mgr = (await req('POST', '/api/demo/manager-login')).data;
    const mgrMe = (await req('GET', '/api/manager/me', { token: mgr.token })).data;
    const sakura = mgrMe.groups.find((g) => g.code === 'SAKURA-2611');

    const rahim = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'en' } })).data;
    const demoUsers = (await req('GET', '/api/demo/users')).data;
    const sato = (
      await req('POST', '/api/demo/login', { body: { user_id: demoUsers.find((u) => u.nickname === 'Sato').id } })
    ).data;

    const shelf = (await req('GET', '/api/shelf', { token: rahim.token })).data;
    const futonDryer = shelf.find((i) => i.item_key === 'futon_dryer');
    const start = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const end = new Date(Date.now() + 26 * HOUR_MS).toISOString();

    // Accepted WITHOUT handover photo -> manager removal atomically cancels loan, releases item, revokes token
    const loan1 = (
      await req('POST', '/api/loans', { token: rahim.token, body: { item_id: futonDryer.id, start_at: start, end_at: end } })
    ).data.loan;
    await req('POST', `/api/loans/${loan1.id}/accept`, { token: sato.token });

    assert.equal(
      (await req('POST', `/api/manager/groups/${sakura.id}/members/${rahim.user.id}/remove`, { token: mgr.token })).status,
      204
    );
    assert.equal((await req('GET', '/api/me', { token: rahim.token })).status, 401);
    assert.equal((await req('GET', `/api/items/${futonDryer.id}`, { token: sato.token })).data.status, 'available');

    // Active loan -> manager removal blocked with 409
    const tariq = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Tariq', lang: 'en' } })).data;
    const loan2 = (
      await req('POST', '/api/loans', { token: tariq.token, body: { item_id: futonDryer.id, start_at: start, end_at: end } })
    ).data.loan;
    await req('POST', `/api/loans/${loan2.id}/accept`, { token: sato.token });

    const handForm = new FormData();
    handForm.append('photo', new Blob([VALID_PNG], { type: 'image/png' }), 'h.png');
    await req('POST', `/api/loans/${loan2.id}/handover`, { token: sato.token, form: handForm });
    // Blocked even mid-handover (accepted + handover_photo)
    assert.equal(
      (await req('POST', `/api/manager/groups/${sakura.id}/members/${tariq.user.id}/remove`, { token: mgr.token })).status,
      409
    );

    await req('POST', `/api/loans/${loan2.id}/received`, { token: tariq.token });
    assert.equal(
      (await req('POST', `/api/manager/groups/${sakura.id}/members/${tariq.user.id}/remove`, { token: mgr.token })).status,
      409
    );

    // Report an issue -> visible in manager issues feed
    await req('POST', `/api/loans/${loan2.id}/issue`, { token: tariq.token, body: { issue_key: 'issue.missingOrBroken' } });
    const issues = (await req('GET', `/api/manager/groups/${sakura.id}/issues`, { token: mgr.token })).data;
    assert.equal(issues.length, 1);
    assert.equal(issues[0].phrase_key, 'issue.missingOrBroken');
    assert.equal(issues[0].reporter_nickname, 'Tariq');
  });

  it('supports self-service device transfer (keeps token) and manager lost-phone restore (rotates & revokes old token)', async () => {
    const mgr = (await req('POST', '/api/demo/manager-login')).data;
    const sakura = (await req('GET', '/api/manager/me', { token: mgr.token })).data.groups.find(
      (g) => g.code === 'SAKURA-2611'
    );
    const rahim = (await req('POST', '/api/join', { body: { code: 'SAKURA-2611', nickname: 'Rahim', lang: 'en' } })).data;

    // 1. Self-service transfer code (single-use, keeps existing token valid on Device 1)
    const selfCode = await req('POST', '/api/me/transfer-code', { token: rahim.token });
    assert.equal(selfCode.status, 201);
    assert.equal(selfCode.data.rotate_token, false);

    const restoredSelf = await req('POST', '/api/restore', { body: { code: selfCode.data.code } });
    assert.equal(restoredSelf.status, 200);
    assert.equal(restoredSelf.data.token, rahim.token);
    assert.equal(restoredSelf.data.user.id, rahim.user.id);

    // Replay of used code -> 404
    assert.equal((await req('POST', '/api/restore', { body: { code: selfCode.data.code } })).status, 404);

    // 2. Manager-assisted lost-phone restore -> rotates token so lost phone is immediately logged out (401)!
    const lostCode = await req('POST', `/api/manager/groups/${sakura.id}/members/${rahim.user.id}/transfer-code`, {
      token: mgr.token,
    });
    assert.equal(lostCode.status, 201);
    assert.equal(lostCode.data.rotate_token, true);

    const restoredNewPhone = await req('POST', '/api/restore', { body: { code: lostCode.data.code } });
    assert.equal(restoredNewPhone.status, 200);
    assert.notEqual(restoredNewPhone.data.token, rahim.token);
    assert.equal(restoredNewPhone.data.user.id, rahim.user.id);

    // Old lost phone token immediately fails 401; new phone token works 200
    assert.equal((await req('GET', '/api/me', { token: rahim.token })).status, 401);
    assert.equal((await req('GET', '/api/me', { token: restoredNewPhone.data.token })).status, 200);

    // 3. Expired transfer code -> 404
    const expCode = await req('POST', '/api/me/transfer-code', { token: restoredNewPhone.data.token });
    await query("UPDATE transfer_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE code = $1", [expCode.data.code]);
    assert.equal((await req('POST', '/api/restore', { body: { code: expCode.data.code } })).status, 404);
  });
});
