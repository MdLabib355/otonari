// Comprehensive deterministic integration & guardrail tests for Group Admin & Super Admin
// unified with Otonari's account/session auth, S3/local storage, and Break-Glass governance.
// Run with: DEMO_MODE=true node --test server/tests/*.test.ts

import './testEnv.ts'; // first: it sets the settings that the other imports read
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { createV1 } from '../api/v1.ts';
import { addNewColumns, closeDatabase, query } from '../core/database.ts';
import { hashSecret, matchesHash } from '../modules/auth/password.ts';
import { createSession } from '../modules/auth/sessionModel.ts';
import { issueBreakGlassToken, verifyBreakGlassToken } from '../modules/superAdmin/breakGlass.ts';
import { createUser, setPassword, setRole } from '../modules/user/userModel.ts';
import { DEMO_PASSWORD, seed } from '../seedData.ts';

let server: http.Server;
let baseUrl = '';
const tokenCache = new Map<string, { id: number; email: string; token: string; group_id: number }>();

const TEST_SUPER_ADMIN_EMAIL = 'superadmin@otonari.test';
const TEST_SUPER_ADMIN_PASSWORD = 'test-super-secret-password';

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

async function loginNickname(nickname: string): Promise<{ id: number; email: string; token: string; group_id: number }> {
  const cached = tokenCache.get(nickname);
  if (cached) return cached;

  const rows = await query<{ id: number; email: string; group_id: number }>(
    'SELECT id, email, group_id FROM users WHERE nickname = $1 AND deactivated_at IS NULL',
    [nickname]
  );
  assert.equal(rows.length, 1, `Expected unique active user ${nickname}`);
  const row = rows[0];

  const loginRes = await apiReq('POST', '/auth/login', {
    body: { email: row.email, password: DEMO_PASSWORD },
  });
  assert.equal(loginRes.status, 200, `Login failed for ${nickname} (${row.email})`);
  const session = { id: row.id, email: row.email, token: loginRes.data.token as string, group_id: row.group_id };
  tokenCache.set(nickname, session);
  return session;
}

async function formReq(method: string, path: string, token: string, fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

// Only the first bytes are checked, so this is enough of a PNG.
function pngFile(n: number): Blob {
  return new Blob([Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, n)], { type: 'image/png' });
}

const uploadsDir = path.join(import.meta.dirname, '..', 'uploads');
const uploadPath = (photo: string) => path.join(uploadsDir, path.basename(photo));
const uploadExists = (photo: string) => fs.existsSync(uploadPath(photo));
const countUploads = () => fs.readdirSync(uploadsDir).length;
const makeUploadOld = (photo: string) => fs.utimesSync(uploadPath(photo), 0, 0);

async function until(condition: () => boolean) {
  for (let tries = 0; tries < 40 && !condition(); tries += 1) await new Promise((r) => setTimeout(r, 25));
  assert.equal(condition(), true);
}

async function superAdminToken(): Promise<string> {
  const login = await apiReq('POST', '/auth/login', {
    body: { email: TEST_SUPER_ADMIN_EMAIL, password: TEST_SUPER_ADMIN_PASSWORD },
  });
  assert.equal(login.status, 200);
  return login.data.token;
}

async function createVerifiedAccount(email: string, nickname = '') {
  const user = await createUser({ email, lang: 'en', nickname });
  await setPassword(user.id, await hashSecret('test-user-password-123'));
  const token = await createSession(user.id);
  return { id: user.id, email, token };
}

describe('Otonari Admin Panels — Guardrails, RBAC, Break-Glass, Catalog & Unified Auth', () => {
  before(async () => {
    await seed(false);
    await addNewColumns();

    // Ensure deterministic super_admin test account
    const sa = await createUser({ email: TEST_SUPER_ADMIN_EMAIL, lang: 'en', nickname: 'Platform Admin' });
    await setPassword(sa.id, await hashSecret(TEST_SUPER_ADMIN_PASSWORD));
    await setRole(sa.id, 'super_admin');

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

  it('verifies scrypt password hashing deterministically', async () => {
    const hash = await hashSecret('otonari-secret');
    assert.equal(await matchesHash('otonari-secret', hash), true);
    assert.equal(await matchesHash('wrong-secret', hash), false);
  });

  it('enforces strict cross-group isolation (404 on foreign user/item/loan)', async () => {
    const sato = await loginNickname('Sato'); // Sakura Heights group_admin
    const kobayashi = await loginNickname('Kobayashi'); // Hamaguchi-machi member

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
    const maria = await loginNickname('Maria');
    const forbidden = await apiReq('GET', '/group-admin/dashboard', { token: maria.token });
    assert.equal(forbidden.status, 403);
  });

  it('enforces Last-Admin protection (409 on self-leave, demote, or removal of sole group_admin)', async () => {
    const sato = await loginNickname('Sato');
    const inoue = await loginNickname('Inoue');

    // Create a non-demo sole group_admin + another active member in a fresh group to test self-leave guardrail
    const leader = await createVerifiedAccount('sole-leader@otonari.test', 'SoleLeader');
    const neighbor = await createVerifiedAccount('sole-neighbor@otonari.test', 'SoleNeighbor');

    const grp = await apiReq('POST', '/groups', {
      token: leader.token,
      body: { name: 'Sole Admin Test Building', type: 'building', city: 'Nagasaki', nickname: 'SoleLeader', lang: 'en' },
    });
    assert.equal(grp.status, 201);

    const joined = await apiReq('POST', `/groups/${grp.data.group.code}/members`, {
      token: neighbor.token,
      body: { nickname: 'SoleNeighbor', lang: 'en' },
    });
    assert.equal(joined.status, 201);

    // Sole group_admin cannot leave while other active members remain
    const leaveSelf = await apiReq('DELETE', '/me/group', { token: leader.token });
    assert.equal(leaveSelf.status, 409);

    // Sole group_admin cannot demote themselves
    const demoteSelf = await apiReq('PATCH', `/group-admin/members/${sato.id}/role`, {
      token: sato.token,
      body: { role: 'user' },
    });
    assert.equal(demoteSelf.status, 409);

    // A resident (Tanaka) cannot suspend a Group Admin
    const tanaka = await loginNickname('Tanaka');
    const residentSuspend = await apiReq('PATCH', `/group-admin/members/${sato.id}/status`, {
      token: tanaka.token,
      body: { status: 'suspended' },
    });
    assert.equal(residentSuspend.status, 403);

    // Group Admin Inoue cannot remove themselves
    const selfRemove = await apiReq('DELETE', `/group-admin/members/${inoue.id}`, { token: inoue.token });
    assert.equal(selfRemove.status, 400);
  });

  it('has exactly 3 roles: co_admin is refused (400), group admins are equal, the last one is locked (409)', async () => {
    const sato = await loginNickname('Sato');
    const tanaka = await loginNickname('Tanaka');
    const setRoleOf = (token: string, userId: number, role: string) =>
      apiReq('PATCH', `/group-admin/members/${userId}/role`, { token, body: { role } });

    assert.equal((await setRoleOf(sato.token, tanaka.id, 'co_admin')).status, 400);
    assert.equal((await setRoleOf(tanaka.token, sato.id, 'user')).status, 403);

    const promoted = await setRoleOf(sato.token, tanaka.id, 'group_admin');
    assert.equal(promoted.status, 200);
    assert.equal(promoted.data.role, 'group_admin');
    const me = await apiReq('GET', '/me', { token: sato.token });
    assert.equal(me.data.user.role, 'group_admin', 'Promoting somebody does not demote the promoter');

    // The equal admin can demote the first one, and is then the last one.
    assert.equal((await setRoleOf(tanaka.token, sato.id, 'user')).status, 200);
    assert.equal((await setRoleOf(tanaka.token, tanaka.id, 'user')).status, 409);
    assert.equal((await setRoleOf(tanaka.token, sato.id, 'group_admin')).status, 200);
    assert.equal((await setRoleOf(tanaka.token, tanaka.id, 'user')).status, 200);
    assert.equal((await setRoleOf(sato.token, sato.id, 'user')).status, 409);

    // The database refuses the old role as well.
    await assert.rejects(query("UPDATE users SET role = 'co_admin' WHERE id = $1", [tanaka.id]), /users_role_check/);
  });

  it('migrates co_admin rows of an existing database to group_admin, as often as it runs', async () => {
    const maria = await loginNickname('Maria');
    await query('ALTER TABLE users DROP CONSTRAINT users_role_check');
    await query('ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_role_check');
    await query("UPDATE users SET role = 'co_admin' WHERE id = $1", [maria.id]);
    await query("UPDATE audit_logs SET actor_role = 'co_admin' WHERE actor_role = 'group_admin'");
    await addNewColumns();
    await addNewColumns();

    const users = await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [maria.id]);
    assert.equal(users[0].role, 'group_admin');
    assert.equal((await query("SELECT 1 FROM audit_logs WHERE actor_role = 'co_admin'")).length, 0);
    await query("UPDATE users SET role = 'user' WHERE id = $1", [maria.id]);
  });

  it('lets only super admins manage 4-locale categories, which the catalog then uses', async () => {
    const sato = await loginNickname('Sato');
    const token = await superAdminToken();
    const garden = {
      category_key: 'garden_care',
      icon_key: 'garden',
      label_en: 'Garden care',
      label_ja: '庭の手入れ',
      label_ja_easy: 'にわの ていれ',
      label_bn: 'বাগানের যত্ন',
    };
    const post = (body: object) => apiReq('POST', '/super-admin/categories', { token, body });

    assert.equal((await apiReq('POST', '/super-admin/categories', { token: sato.token, body: garden })).status, 403);
    assert.equal((await post({ ...garden, label_bn: ' ' })).status, 400);
    assert.equal((await post({ ...garden, category_key: 'Garden care!' })).status, 400);
    assert.equal((await post({ ...garden, icon_key: 'unknown' })).status, 400);
    assert.equal((await post(garden)).status, 201);
    assert.equal((await post(garden)).status, 409);

    const item = {
      item_key: 'watering_can',
      emoji: '-',
      category: 'garden_care',
      label_en: 'Watering can',
      label_ja: 'じょうろ',
      label_ja_easy: 'じょうろ',
      label_bn: 'পানির ঝাঁঝরি',
    };
    assert.equal((await apiReq('POST', '/super-admin/catalog', { token, body: { ...item, category: 'none' } })).status, 400);
    assert.equal((await apiReq('POST', '/super-admin/catalog', { token, body: item })).status, 201);

    const isPublic = async () =>
      (await apiReq('GET', '/categories')).data.some((c: { category_key: string }) => c.category_key === 'garden_care');
    assert.equal(await isPublic(), true);

    const disable = await apiReq('PATCH', '/super-admin/categories/garden_care', { token, body: { is_active: false } });
    assert.equal(disable.status, 200);
    assert.equal(disable.data.label_ja, garden.label_ja);
    assert.equal(await isPublic(), false);
    const inDisabled = { ...item, item_key: 'garden_hose' };
    assert.equal((await apiReq('POST', '/super-admin/catalog', { token, body: inDisabled })).status, 400);
    const emptied = { label_en: '' };
    assert.equal((await apiReq('PATCH', '/super-admin/categories/garden_care', { token, body: emptied })).status, 400);
    const enabled = { is_active: true };
    assert.equal((await apiReq('PATCH', '/super-admin/categories/garden_care', { token, body: enabled })).status, 200);

    const audits = await apiReq('GET', '/super-admin/audit-logs?category=Catalog', { token });
    assert.ok(audits.data.some((a: { action: string }) => a.action === 'catalog.category_added'));
  });

  it('stores a photo per item: distinct on the shelf, owner replaces and clears it, orphan cleanup keeps it', async () => {
    const maria = await loginNickname('Maria');
    const ayesha = await loginNickname('Ayesha');
    const add = async (token: string, extra: Record<string, string | Blob> = {}) =>
      formReq('POST', '/items', token, { item_key: 'blender', max_days: '2', spot: 'mailbox', trusted_only: 'false', ...extra });

    const one = await add(maria.token, { photo: pngFile(1) });
    const two = await add(ayesha.token, { photo: pngFile(2) });
    const plain = await apiReq('POST', '/items', {
      token: maria.token,
      body: { item_key: 'blender', max_days: 2, spot: 'mailbox' },
    });
    assert.deepEqual([one.status, two.status, plain.status], [201, 201, 201]);
    assert.equal(plain.data.photo, null);
    assert.equal(one.data.trusted_only, false);

    const photosOnShelf = async () => {
      const shelf = await apiReq('GET', '/items', { token: ayesha.token });
      return new Map<number, string | null>(shelf.data.map((i: { id: number; photo: string | null }) => [i.id, i.photo]));
    };
    const shelf = await photosOnShelf();
    assert.ok(shelf.get(one.data.id) && shelf.get(two.data.id));
    assert.notEqual(shelf.get(one.data.id), shelf.get(two.data.id));
    assert.equal(uploadExists(one.data.photo), true);

    // Not an image, too large, wrong values: refused, and nothing is left behind
    const filesBefore = countUploads();
    assert.equal((await add(maria.token, { photo: new Blob(['hello']) })).status, 400);
    assert.equal((await add(maria.token, { photo: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]) })).status, 413);
    assert.equal((await add(maria.token, { photo: pngFile(3), spot: 'room 203' })).status, 400);
    assert.equal((await formReq('PATCH', `/items/${one.data.id}`, ayesha.token, { photo: pngFile(4) })).status, 403);
    await until(() => countUploads() === filesBefore);

    // The owner replaces the photo and changes the settings; the old file is deleted
    const replaced = await formReq('PATCH', `/items/${one.data.id}`, maria.token, {
      photo: pngFile(5),
      max_days: '7',
      spot: 'entrance',
      trusted_only: 'true',
    });
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.data.photo, one.data.photo);
    assert.deepEqual([replaced.data.max_days, replaced.data.spot, replaced.data.trusted_only], [7, 'entrance', true]);
    assert.equal(uploadExists(one.data.photo), false);

    const badDays = await apiReq('PATCH', `/items/${one.data.id}`, { token: maria.token, body: { max_days: 5 } });
    assert.equal(badDays.status, 400);

    // The cleanup of unused files keeps photos of items, people and groups
    const avatar = await formReq('POST', '/me/avatar', maria.token, { photo: pngFile(6) });
    const image = await formReq('POST', '/group-admin/image', (await loginNickname('Sato')).token, { photo: pngFile(7) });
    const kept = [replaced.data.photo, avatar.data.user.avatar, image.data.image];
    for (const photo of kept) makeUploadOld(photo);
    const cleanup = await apiReq('POST', '/super-admin/operations/cleanup-uploads', {
      token: await superAdminToken(),
      body: { dry_run: false },
    });
    assert.equal(cleanup.status, 200);
    for (const photo of kept) assert.equal(uploadExists(photo), true, `${photo} is in use`);

    const cleared = await apiReq('PATCH', `/items/${one.data.id}`, { token: maria.token, body: { clear_photo: true } });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.photo, null);
    assert.equal(uploadExists(replaced.data.photo), false);
    assert.equal((await photosOnShelf()).get(one.data.id), null);
  });

  it('takes custom items through request, approval, editing and promotion', async () => {
    const maria = await loginNickname('Maria');
    const sato = await loginNickname('Sato');
    const inoue = await loginNickname('Inoue');
    const ayesha = await loginNickname('Ayesha');
    const sa = await superAdminToken();
    const request = (extra: Record<string, string | Blob> = {}) =>
      formReq('POST', '/items/request', maria.token, { custom_title: 'Karaoke  machine', max_days: '2', spot: 'mailbox', ...extra });
    const onShelf = async (id: number) =>
      (await apiReq('GET', '/items', { token: ayesha.token })).data.find((i: { id: number }) => i.id === id);
    const dashboard = async () => (await apiReq('GET', '/group-admin/dashboard', { token: sato.token })).data;

    assert.equal((await request({ custom_title: ' x ' })).status, 400);
    assert.equal((await request({ custom_title: 'x'.repeat(61) })).status, 400);
    assert.equal((await request({ category_key: 'unknown' })).status, 400);
    const asCatalog = { item_key: 'custom', max_days: 2, spot: 'mailbox' };
    assert.equal((await apiReq('POST', '/items', { token: maria.token, body: asCatalog })).status, 400);

    const before = (await dashboard()).pending_item_count;
    const requested = await request({ photo: pngFile(20) });
    assert.equal(requested.status, 202);
    assert.equal(requested.data.custom_title, 'Karaoke machine');
    assert.equal(requested.data.approval_status, 'pending');
    const id: number = requested.data.id;
    assert.equal((await dashboard()).pending_item_count, before + 1);

    // Only the owner and the group admin see it, and nobody can borrow it
    assert.equal(await onShelf(id), undefined);
    assert.equal((await apiReq('GET', `/items/${id}`, { token: ayesha.token })).status, 404);
    const mine = await apiReq('GET', '/me/items', { token: maria.token });
    assert.ok(mine.data.some((i: { id: number; approval_status: string }) => i.id === id && i.approval_status === 'pending'));
    const dates = {
      start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      end_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    };
    assert.equal((await apiReq('POST', '/loans', { token: ayesha.token, body: { item_id: id, ...dates } })).status, 404);

    // Other groups and residents can't touch it
    const category = { category_key: 'living' };
    for (const [token, status] of [[inoue.token, 404], [maria.token, 403]] as const) {
      assert.equal((await apiReq('POST', `/group-admin/items/${id}/approve`, { token, body: category })).status, status);
      assert.equal((await apiReq('POST', `/group-admin/items/${id}/reject`, { token })).status, status);
      assert.equal((await apiReq('PATCH', `/group-admin/items/${id}`, { token, body: category })).status, status);
    }

    // Approving needs a category; title and photo can be changed at the same time
    assert.equal((await apiReq('POST', `/group-admin/items/${id}/approve`, { token: sato.token, body: {} })).status, 400);
    const approved = await formReq('POST', `/group-admin/items/${id}/approve`, sato.token, {
      custom_title: 'Karaoke set',
      category_key: 'living',
      photo: pngFile(21),
    });
    assert.equal(approved.status, 200);
    assert.equal(uploadExists(requested.data.photo), false);
    const shown = await onShelf(id);
    assert.deepEqual([shown.custom_title, shown.category_key, shown.photo], ['Karaoke set', 'living', approved.data.photo]);
    assert.equal((await apiReq('POST', `/group-admin/items/${id}/approve`, { token: sato.token, body: category })).status, 409);
    assert.equal((await dashboard()).pending_item_count, before);

    // Messages of a loan have the title
    const loan = await apiReq('POST', '/loans', { token: ayesha.token, body: { item_id: id, ...dates } });
    assert.equal(loan.status, 201);
    assert.equal(loan.data.messages[0].params.item_label, 'Karaoke set');

    const customItems = await apiReq('GET', '/super-admin/custom-items', { token: sa });
    assert.equal(customItems.status, 200);
    assert.ok(
      customItems.data.some(
        (i: { id: number; custom_title: string; group_name: string }) =>
          i.id === id && i.custom_title === 'Karaoke set' && i.group_name === 'Sakura Heights'
      )
    );
    assert.equal((await apiReq('GET', '/super-admin/custom-items', { token: sato.token })).status, 403);

    // Editing afterwards
    const edit = (body: object) => apiReq('PATCH', `/group-admin/items/${id}`, { token: sato.token, body });
    assert.equal((await edit({ custom_title: '' })).status, 400); // a custom item needs a title
    assert.equal((await edit({ category_key: 'unknown' })).status, 400);
    assert.equal((await edit({ item_key: 'unknown' })).status, 400);
    const edited = await edit({ custom_title: 'Karaoke box', category_key: 'outdoor', clear_photo: true });
    assert.deepEqual([edited.data.custom_title, edited.data.category_key, edited.data.photo], ['Karaoke box', 'outdoor', null]);
    assert.equal(uploadExists(approved.data.photo), false);
    const mapped = await edit({ item_key: 'bluetooth_speaker' });
    assert.deepEqual([mapped.data.item_key, mapped.data.custom_title, mapped.data.category_key], ['bluetooth_speaker', null, null]);
    const titled = await edit({ custom_title: 'Loud speaker' });
    assert.equal((await edit({ custom_title: '' })).data.custom_title, null);
    assert.equal(titled.data.custom_title, 'Loud speaker');

    const rejected = await request();
    assert.equal((await apiReq('POST', `/group-admin/items/${rejected.data.id}/reject`, { token: sato.token })).status, 204);
    const mineNow = await apiReq('GET', '/me/items', { token: maria.token });
    assert.equal(mineNow.data.some((i: { id: number }) => i.id === rejected.data.id), false);

    const log = await apiReq('GET', '/group-admin/activity-log', { token: sato.token });
    for (const action of ['item.approved', 'item.edited', 'item.rejected']) {
      assert.ok(log.data.some((a: { action: string; category: string }) => a.action === action && a.category === 'Shelf'));
    }
  });

  it('enforces lent-item hide lock (409) and allows hiding/restoring available items', async () => {
    const sato = await loginNickname('Sato');
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
    const maria = await loginNickname('Maria');
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
    const sato = await loginNickname('Sato');
    const yamamoto = await loginNickname('Yamamoto');

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
    const sato = await loginNickname('Sato');
    const ayesha = await loginNickname('Ayesha');

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

    const rahimAccount = await createVerifiedAccount('rahim@otonari.test');
    const pendingJoin = await apiReq('POST', '/groups/SAKURA-2611/members', {
      token: rahimAccount.token,
      body: { nickname: 'Rahim', lang: 'bn' },
    });
    assert.equal(pendingJoin.status, 202);
    assert.equal(pendingJoin.data.user.member_status, 'pending');

    // Pending resident cannot browse /items
    const blockedShelf = await apiReq('GET', '/items', { token: rahimAccount.token });
    assert.equal(blockedShelf.status, 403);

    // Sato approves Rahim
    const approved = await apiReq('POST', `/group-admin/members/${rahimAccount.id}/approve`, {
      token: sato.token,
      body: { grant_trust: true },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.member_status, 'active');
    assert.equal(approved.data.is_trusted, true);

    // Approved resident can now browse /items
    const unlockedShelf = await apiReq('GET', '/items', { token: rahimAccount.token });
    assert.equal(unlockedShelf.status, 200);
  });

  it('enforces Super Admin RBAC, Break-Glass token verification/expiry, 4-locale catalog, and account deactivation', async () => {
    const sato = await loginNickname('Sato');

    // Non-super-admin token must NEVER work on Super Admin endpoints
    const rejectedResident = await apiReq('GET', '/super-admin/overview', { token: sato.token });
    assert.equal(rejectedResident.status, 403);

    // Wrong password rejected via unified /auth/login
    const badLogin = await apiReq('POST', '/auth/login', {
      body: { email: TEST_SUPER_ADMIN_EMAIL, password: 'wrong-password' },
    });
    assert.equal(badLogin.status, 401);

    // Valid Super Admin login via unified /auth/login
    const loginRes = await apiReq('POST', '/auth/login', {
      body: { email: TEST_SUPER_ADMIN_EMAIL, password: TEST_SUPER_ADMIN_PASSWORD },
    });
    assert.equal(loginRes.status, 200);
    const saToken: string = loginRes.data.token;
    assert.ok(saToken);
    assert.equal(loginRes.data.user.role, 'super_admin');

    // Overview works
    const overview = await apiReq('GET', '/super-admin/overview', { token: saToken });
    assert.equal(overview.status, 200);
    assert.ok(overview.data.open_disputes >= 1);
    assert.ok(overview.data.storage_health.mode === 'local' || overview.data.storage_health.mode === 's3');

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

    // Unified /admin/users account management & session revocation on deactivation
    const tempAccount = await createVerifiedAccount('deactivate-me@otonari.test', 'TempUser');
    const beforeDeactivate = await apiReq('GET', '/me', { token: tempAccount.token });
    assert.equal(beforeDeactivate.status, 200);

    const deactivated = await apiReq('PATCH', `/admin/users/${tempAccount.id}`, {
      token: saToken,
      body: { active: false },
    });
    assert.equal(deactivated.status, 204);

    const afterDeactivate = await apiReq('GET', '/me', { token: tempAccount.token });
    assert.equal(afterDeactivate.status, 401);
  });
});
