import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import {
  closeDatabase,
  declinePendingLoans,
  findOpenLoan,
  getMe,
  isTrusted,
  query,
  trustOf,
  withTransaction,
} from '../db.js';
import { checkReminders } from '../reminders.js';
import { seedDatabase } from '../seed.js';

const HOUR_MS = 60 * 60 * 1000;

describe('Slice 1: PostgreSQL core, seeding, transactions, trust, and reminders', () => {
  beforeEach(async () => {
    await seedDatabase({ quiet: true });
  });

  after(async () => {
    await closeDatabase();
  });

  it('seeds Nagasaki demo data with groups, users, items, and Maria returned loan', async () => {
    const groups = await query('SELECT code, name FROM groups ORDER BY id');
    assert.deepEqual(
      groups.rows.map((r) => r.code),
      ['SAKURA-2611', 'HAMA-3CHOME']
    );

    const maria = (await query("SELECT id FROM users WHERE nickname = 'Maria'")).rows[0];
    const sato = (await query("SELECT id FROM users WHERE nickname = 'Sato'")).rows[0];
    assert.ok(maria && sato);

    const mariaMe = await getMe(maria.id);
    assert.equal(mariaMe.user.nickname, 'Maria');
    assert.equal(mariaMe.user.elder_mode, false);
    assert.equal(mariaMe.group.code, 'SAKURA-2611');

    const mariaTrust = await trustOf(maria.id);
    assert.equal(mariaTrust.on_time, 1);
    assert.equal(mariaTrust.late, 0);
    assert.ok(mariaTrust.joined_days >= 29);
    assert.equal(await isTrusted(maria.id), true);

    const satoTrust = await trustOf(sato.id);
    assert.equal(satoTrust.on_time, 0);
    assert.equal(await isTrusted(sato.id), false);
  });

  it('supports seed:empty with only groups and zero users/items', async () => {
    await seedDatabase({ empty: true, quiet: true });
    const groups = await query('SELECT COUNT(*)::int AS c FROM groups');
    const users = await query('SELECT COUNT(*)::int AS c FROM users');
    const items = await query('SELECT COUNT(*)::int AS c FROM items');
    assert.equal(groups.rows[0].c, 2);
    assert.equal(users.rows[0].c, 0);
    assert.equal(items.rows[0].c, 0);
  });

  it('rolls back withTransaction atomically on error', async () => {
    await assert.rejects(
      withTransaction(async (client) => {
        await query(
          "INSERT INTO groups (code, name, type, city) VALUES ('ROLL-TEST', 'Rollback Apt', 'building', 'Nagasaki')",
          [],
          client
        );
        throw new Error('simulated failure');
      }),
      /simulated failure/
    );
    const check = await query("SELECT * FROM groups WHERE code = 'ROLL-TEST'");
    assert.equal(check.rows.length, 0);
  });

  it('findOpenLoan and declinePendingLoans operate atomically', async () => {
    const item = (await query("SELECT * FROM items WHERE item_key = 'futon_dryer' LIMIT 1")).rows[0];
    const maria = (await query("SELECT * FROM users WHERE nickname = 'Maria'")).rows[0];
    const ayesha = (await query("SELECT * FROM users WHERE nickname = 'Ayesha'")).rows[0];

    const start = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const end = new Date(Date.now() + 26 * HOUR_MS).toISOString();

    const loan1 = (
      await query(
        'INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [item.id, maria.id, item.owner_id, start, end]
      )
    ).rows[0];
    const loan2 = (
      await query(
        'INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [item.id, ayesha.id, item.owner_id, start, end]
      )
    ).rows[0];

    assert.equal((await findOpenLoan(item.id, maria.id))?.id, loan1.id);

    await withTransaction(async (client) => {
      await declinePendingLoans(item.id, loan1.id, client);
    });

    const refreshed1 = (await query('SELECT status FROM loans WHERE id = $1', [loan1.id])).rows[0];
    const refreshed2 = (await query('SELECT status FROM loans WHERE id = $1', [loan2.id])).rows[0];
    assert.equal(refreshed1.status, 'pending');
    assert.equal(refreshed2.status, 'declined');

    const declineMsg = await query(
      "SELECT phrase_key FROM messages WHERE loan_id = $1 AND to_user_id = $2 AND phrase_key = 'decline'",
      [loan2.id, ayesha.id]
    );
    assert.equal(declineMsg.rows.length, 1);
  });

  it('sends dueSoon and overdue reminders idempotently and skips loans with return_photo', async () => {
    const item = (await query("SELECT * FROM items WHERE item_key = 'futon_dryer' LIMIT 1")).rows[0];
    const maria = (await query("SELECT * FROM users WHERE nickname = 'Maria'")).rows[0];

    // Loan A: due in 12 hours -> sys.dueSoon once
    const loanDueSoon = (
      await query(
        `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
        [
          item.id,
          maria.id,
          item.owner_id,
          new Date(Date.now() - 12 * HOUR_MS).toISOString(),
          new Date(Date.now() + 12 * HOUR_MS).toISOString(),
        ]
      )
    ).rows[0];

    // Loan B: overdue by 2 hours -> sys.overdue + sys.overdueLender once
    const loanOverdue = (
      await query(
        `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
        [
          item.id,
          maria.id,
          item.owner_id,
          new Date(Date.now() - 26 * HOUR_MS).toISOString(),
          new Date(Date.now() - 2 * HOUR_MS).toISOString(),
        ]
      )
    ).rows[0];

    // Loan C: overdue BUT already has return_photo -> zero reminders
    const loanReturnedPhoto = (
      await query(
        `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status, return_photo)
         VALUES ($1, $2, $3, $4, $5, 'active', '/uploads/fake.jpg') RETURNING *`,
        [
          item.id,
          maria.id,
          item.owner_id,
          new Date(Date.now() - 26 * HOUR_MS).toISOString(),
          new Date(Date.now() - 2 * HOUR_MS).toISOString(),
        ]
      )
    ).rows[0];

    await checkReminders();
    await checkReminders(); // second run must be idempotent

    const msgsA = await query('SELECT phrase_key, to_user_id FROM messages WHERE loan_id = $1', [loanDueSoon.id]);
    assert.deepEqual(msgsA.rows, [{ phrase_key: 'sys.dueSoon', to_user_id: maria.id }]);

    const msgsB = await query('SELECT phrase_key, to_user_id FROM messages WHERE loan_id = $1 ORDER BY id', [
      loanOverdue.id,
    ]);
    assert.deepEqual(msgsB.rows, [
      { phrase_key: 'sys.overdue', to_user_id: maria.id },
      { phrase_key: 'sys.overdueLender', to_user_id: item.owner_id },
    ]);

    const msgsC = await query('SELECT * FROM messages WHERE loan_id = $1', [loanReturnedPhoto.id]);
    assert.equal(msgsC.rows.length, 0);
  });
});
