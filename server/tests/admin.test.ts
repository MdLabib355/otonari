// Comprehensive deterministic integration & guardrail tests for Group Admin & Super Admin.
// Run with: node --test server/tests/*.test.ts

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { createV1 } from '../api/v1.ts';
import { closeDatabase, createTables, query } from '../core/database.ts';
import { issueBreakGlassToken, verifyBreakGlassToken } from '../modules/superAdmin/breakGlass.ts';
import { hashPasswordScrypt, verifyPasswordScrypt } from '../modules/superAdmin/superAdminAuth.ts';
import { seed } from '../seedData.ts';

let server: http.Server;
let baseUrl = '';

async function apiReq(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function tokenForNickname(nickname: string): Promise<{ id: number; token: string; group_id: number }> {
  const rows = await query<{ id: number; token: string; group_id: number }>(
    'SELECT id, token, group_id FROM users WHERE nickname = $1 AND left_at IS NULL',
    [nickname]
  );
  assert.equal(rows.length, 1, `Expected unique user ${nickname}`);
  return rows[0];
}

describe('Otonari Admin Panels — Guardrails, RBAC, Break-Glass & Catalog', () => {
  before(async () => {
    process.env.DEMO_MODE = 'true';
    process.env.SUPER_ADMIN_USERNAME = 'admin';
    process.env.SUPER_ADMIN_PASSWORD = 'test-super-secret-password';

    await createTables();
    await seed(false);

    const app = express();
    app.use(express.json());
    app.use('/api/v1', createV1());

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        assert(addr && typeof addr !== 'string');
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Re-seed clean demo state before exiting.
    await seed(false);
    await closeDatabase();
  });

  it('verifies scrypt password hashing deterministically', () => {
    const hash = hashPasswordScrypt('otonari-secret');
    assert.equal(verifyPasswordScrypt('otonari-secret', hash), true);
    assert.equal(verifyPasswordScrypt('wrong-secret', hash), false);
  });

  it('enforces strict cross-group isolation (404 on foreign user/item/loan)', async () => {
    const sato = await tokenForNickname('Sato'); // Sakura Heights group_admin
    const kobayashi = await tokenForNickname('Kobayashi'); // Hamaguchi-machi member

    const foreignItems = await query<{ id: number }>('SELECT id FROM items WHERE group_id = $1 LIMIT 1', [
      kobayashi.group_id,
    ]);
    assert.ok(foreignItems.length > 0);

    const userRes = await apiReq('PATCH', `/group-admin/members/${kobayashi.id}/trust`, {
      token: sato.token,
      body: { trusted: true },
    });
    assert.equal(userRes.status, 404);

    const itemRes = await apiReq('PATCH', `/group-admin/items/${foreignItems[0].id}/moderate`, {
      token: sato.token,
      body: { hidden: true },
    });
    assert.equal(itemRes.status, 404);

    // Regular member (Maria) cannot access /group-admin/*
    const maria = await tokenForNickname('Maria');
    const forbidden = await apiReq('GET', '/group-admin/dashboard', { token: maria.token });
    assert.equal(forbidden.status, 403);
  });

  it('enforces Last-Admin protection (409 on self-leave, demote, or removal of sole group_admin)', async () => {
    const sato = await tokenForNickname('Sato');
    const inoue = await tokenForNickname('Inoue');

    // Create a non-demo sole group_admin in a fresh group to test self-leave guardrail
    const grp = await apiReq('POST', '/groups', {
      body: { name: 'Sole Admin Test Building', type: 'building', city: 'Nagasaki' },
    });
    assert.equal(grp.status, 201);
    const joined = await apiReq('POST', `/groups/${grp.data.code}/members`, {
      body: { nickname: 'SoleLeader', lang: 'en' },
    });
    assert.equal(joined.status, 201);
    await query("UPDATE users SET group_role = 'group_admin' WHERE id = $1", [joined.data.user.id]);

    const leaveSelf = await apiReq('DELETE', '/me', { token: joined.data.token });
    assert.equal(leaveSelf.status, 409);

    // Sole group_admin cannot demote themselves
    const demoteSelf = await apiReq('PATCH', `/group-admin/members/${sato.id}/role`, {
      token: sato.token,
      body: { role: 'member' },
    });
    assert.equal(demoteSelf.status, 409);

    // Co-Admin (Tanaka) cannot suspend or remove Primary Group Admin (Sato)
    const tanaka = await tokenForNickname('Tanaka');
    const coSuspend = await apiReq('PATCH', `/group-admin/members/${sato.id}/status`, {
      token: tanaka.token,
      body: { status: 'suspended' },
    });
    assert.equal(coSuspend.status, 403);

    // Primary Group Admin Inoue cannot remove himself
    const selfRemove = await apiReq('DELETE', `/group-admin/members/${inoue.id}`, { token: inoue.token });
    assert.equal(selfRemove.status, 400);
  });

  it('enforces lent-item hide lock (409) and allows hiding/restoring available items', async () => {
    const sato = await tokenForNickname('Sato');
    const itemsRes = await apiReq('GET', '/group-admin/items', { token: sato.token });
    assert.equal(itemsRes.status, 200);

    const lentItem = itemsRes.data.find((i: { status: string }) => i.status === 'lent');
    const availItem = itemsRes.data.find((i: { status: string }) => i.status === 'available');
    assert.ok(lentItem, 'Expected seeded lent item');
    assert.ok(availItem, 'Expected seeded available item');

    const blockedHide = await apiReq('PATCH', `/group-admin/items/${lentItem.id}/moderate`, {
      token: sato.token,
      body: { hidden: true },
    });
    assert.equal(blockedHide.status, 409);

    const hideOk = await apiReq('PATCH', `/group-admin/items/${availItem.id}/moderate`, {
      token: sato.token,
      body: { hidden: true },
    });
    assert.equal(hideOk.status, 200);
    assert.ok(hideOk.data.hidden_at);

    // Hidden item must disappear from resident shelf
    const maria = await tokenForNickname('Maria');
    const shelfRes = await apiReq('GET', '/items', { token: maria.token });
    assert.equal(shelfRes.status, 200);
    assert.equal(
      shelfRes.data.some((i: { id: number }) => i.id === availItem.id),
      false
    );

    const restoreOk = await apiReq('PATCH', `/group-admin/items/${availItem.id}/moderate`, {
      token: sato.token,
      body: { hidden: false },
    });
    assert.equal(restoreOk.status, 200);
    assert.equal(restoreOk.data.hidden_at, null);
  });

  it('enforces 24h nudge rate limit (429), Safe Remove active-loan lock (409 -> 204 after force-return)', async () => {
    const sato = await tokenForNickname('Sato');
    const yamamoto = await tokenForNickname('Yamamoto');

    const loansRes = await apiReq('GET', '/group-admin/loans', { token: sato.token });
    assert.equal(loansRes.status, 200);
    const overdueLoan = loansRes.data.find((l: { is_overdue: boolean }) => l.is_overdue);
    assert.ok(overdueLoan, 'Expected seeded overdue loan');

    // Safe Remove must be blocked while Yamamoto has an active overdue loan
    const blockedRemove = await apiReq('DELETE', `/group-admin/members/${yamamoto.id}`, { token: sato.token });
    assert.equal(blockedRemove.status, 409);

    // First gentle nudge succeeds
    const nudge1 = await apiReq('POST', `/group-admin/loans/${overdueLoan.id}/nudge`, {
      token: sato.token,
      body: { phrase_key: 'admin.gentleReminder' },
    });
    assert.equal(nudge1.status, 200);

    // Second gentle nudge within 24h must return 429
    const nudge2 = await apiReq('POST', `/group-admin/loans/${overdueLoan.id}/nudge`, {
      token: sato.token,
      body: { phrase_key: 'admin.spotAssist' },
    });
    assert.equal(nudge2.status, 429);

    // Force-return resolves the loan and restores item availability
    const resolved = await apiReq('POST', `/group-admin/loans/${overdueLoan.id}/resolve`, {
      token: sato.token,
      body: { resolution: 'force_return' },
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.data.status, 'returned');

    // Now Safe Remove succeeds (204)
    const removedOk = await apiReq('DELETE', `/group-admin/members/${yamamoto.id}`, { token: sato.token });
    assert.equal(removedOk.status, 204);
  });

  it('enforces borrow-mute (403 on new borrow) and approval-required join workflow', async () => {
    const sato = await tokenForNickname('Sato');
    const ayesha = await tokenForNickname('Ayesha');

    // Mute Ayesha
    const muted = await apiReq('PATCH', `/group-admin/members/${ayesha.id}/status`, {
      token: sato.token,
      body: { status: 'borrow_muted' },
    });
    assert.equal(muted.status, 200);
    assert.equal(muted.data.member_status, 'borrow_muted');

    // Muted resident cannot request a new loan
    const satoItems = await query<{ id: number }>(
      "SELECT id FROM items WHERE owner_id = $1 AND status = 'available' AND removed_at IS NULL LIMIT 1",
      [sato.id]
    );
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
    const borrowBlocked = await apiReq('POST', '/loans', {
      token: ayesha.token,
      body: { item_id: satoItems[0].id, start_at: start, end_at: end },
    });
    assert.equal(borrowBlocked.status, 403);

    // Unmute Ayesha
    const unmuted = await apiReq('PATCH', `/group-admin/members/${ayesha.id}/status`, {
      token: sato.token,
      body: { status: 'active' },
    });
    assert.equal(unmuted.status, 200);

    // Switch join policy to approval_required and test pending -> approve flow
    const policyRes = await apiReq('PATCH', '/group-admin/settings', {
      token: sato.token,
      body: { join_policy: 'approval_required' },
    });
    assert.equal(policyRes.status, 200);

    const pendingJoin = await apiReq('POST', '/groups/SAKURA-2611/members', {
      body: { nickname: 'Rahim', lang: 'bn' },
    });
    assert.equal(pendingJoin.status, 202);
    assert.equal(pendingJoin.data.user.member_status, 'pending');

    // Pending resident cannot browse /items
    const blockedShelf = await apiReq('GET', '/items', { token: pendingJoin.data.token });
    assert.equal(blockedShelf.status, 403);

    // Sato approves Rahim
    const approved = await apiReq('POST', `/group-admin/members/${pendingJoin.data.user.id}/approve`, {
      token: sato.token,
      body: { grant_trust: true },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.member_status, 'active');
    assert.equal(approved.data.is_trusted, true);

    // Approved resident can now browse /items
    const unlockedShelf = await apiReq('GET', '/items', { token: pendingJoin.data.token });
    assert.equal(unlockedShelf.status, 200);
  });

  it('enforces Super Admin auth isolation, Break-Glass token verification/expiry, and 4-locale catalog validation', async () => {
    const sato = await tokenForNickname('Sato');

    // Resident/GroupAdmin token must NEVER work on Super Admin endpoints
    const rejectedResident = await apiReq('GET', '/super-admin/overview', { token: sato.token });
    assert.equal(rejectedResident.status, 401);

    // Wrong password rejected
    const badLogin = await apiReq('POST', '/super-admin/auth/login', {
      body: { username: 'admin', password: 'wrong' },
    });
    assert.equal(badLogin.status, 401);

    // Valid Super Admin login
    const loginRes = await apiReq('POST', '/super-admin/auth/login', {
      body: { username: 'admin', password: 'test-super-secret-password' },
    });
    assert.equal(loginRes.status, 200);
    const saToken: string = loginRes.data.token;
    assert.ok(saToken);

    // Overview works
    const overview = await apiReq('GET', '/super-admin/overview', { token: saToken });
    assert.equal(overview.status, 200);
    assert.ok(overview.data.open_disputes >= 1);

    // Break-Glass evidence must be rejected without a valid scoped token
    const disputes = await apiReq('GET', '/super-admin/disputes', { token: saToken });
    assert.equal(disputes.status, 200);
    const dispute = disputes.data[0];
    assert.ok(dispute);

    const noTokenEvidence = await apiReq('GET', `/super-admin/disputes/${dispute.id}/evidence`, {
      token: saToken,
    });
    assert.equal(noTokenEvidence.status, 403);

    // Unlock requires mandatory reason
    const blankReason = await apiReq('POST', `/super-admin/disputes/${dispute.id}/break-glass`, {
      token: saToken,
      body: { reason: '' },
    });
    assert.equal(blankReason.status, 400);

    // Valid unlock grants 15-min token and logs audit record
    const unlock = await apiReq('POST', `/super-admin/disputes/${dispute.id}/break-glass`, {
      token: saToken,
      body: { reason: 'Damaged Item Claim' },
    });
    assert.equal(unlock.status, 200);
    assert.ok(unlock.data.break_glass_token);

    const evidence = await apiReq('GET', `/super-admin/disputes/${dispute.id}/evidence`, {
      token: saToken,
      headers: { 'X-Break-Glass-Token': unlock.data.break_glass_token },
    });
    assert.equal(evidence.status, 200);
    assert.equal(evidence.data.loan_id, dispute.loan_id);

    // Verify deterministic token expiry & wrong-scope rejection
    const shortToken = issueBreakGlassToken(saToken, dispute.id, dispute.loan_id, 1);
    assert.equal(verifyBreakGlassToken(shortToken.token, saToken, dispute.id, dispute.loan_id), true);
    assert.equal(verifyBreakGlassToken(shortToken.token, saToken, dispute.id + 999, dispute.loan_id), false);
    assert.equal(verifyBreakGlassToken(shortToken.token, 'different-session', dispute.id, dispute.loan_id), false);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(verifyBreakGlassToken(shortToken.token, saToken, dispute.id, dispute.loan_id), false);

    // Verify break_glass.unlocked audit entry exists
    const audits = await apiReq('GET', '/super-admin/audit-logs?category=Break-Glass', { token: saToken });
    assert.equal(audits.status, 200);
    assert.ok(
      audits.data.some((a: { action: string }) => a.action === 'break_glass.unlocked'),
      'Expected immutable break_glass.unlocked audit record'
    );

    // Catalog 4-locale completeness validation (missing bn -> 400)
    const missingLocale = await apiReq('POST', '/super-admin/catalog', {
      token: saToken,
      body: {
        item_key: 'hand_mixer',
        emoji: '🥣',
        category: 'kitchen',
        label_en: 'Hand mixer',
        label_ja: 'ハンドミキサー',
        label_ja_easy: 'まぜる きかい',
        label_bn: '',
      },
    });
    assert.equal(missingLocale.status, 400);

    // Complete 4-locale catalog item succeeds and appears on public /catalog
    const validCatalog = await apiReq('POST', '/super-admin/catalog', {
      token: saToken,
      body: {
        item_key: 'hand_mixer',
        emoji: '🥣',
        category: 'kitchen',
        label_en: 'Hand mixer',
        label_ja: 'ハンドミキサー',
        label_ja_easy: 'まぜる きかい',
        label_bn: 'হ্যান্ড মিক্সার',
      },
    });
    assert.equal(validCatalog.status, 201);

    const publicCatalog = await apiReq('GET', '/catalog');
    assert.equal(publicCatalog.status, 200);
    assert.ok(publicCatalog.data.some((c: { item_key: string }) => c.item_key === 'hand_mixer'));
  });
});
