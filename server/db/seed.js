// Resets the database and deletes old uploaded photos.
// Run from project root:
//   npm run seed         fills it with Nagasaki demo data
//   npm run seed:empty   only the two groups (no demo users, items, or loans)

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { closeDatabase, query, withTransaction } from './pool.js';
import { resetDatabase } from './schema.js';
import { createMessage } from '../services/loans.js';
import { hashPassword } from '../services/passwords.js';
import { deletePhotos } from '../services/photos.js';

const GROUPS = [
  {
    code: 'SAKURA-2611',
    name: 'Sakura Heights',
    type: 'building',
    city: 'Nagasaki',
    users: [
      {
        nickname: 'Sato',
        lang: 'ja',
        elder: false,
        items: [
          ['futon_dryer', 3, 'entrance'],
          ['takoyaki_maker', 2, 'entrance'],
          ['ladder', 1, 'bike_parking'],
        ],
      },
      {
        nickname: 'Tanaka',
        lang: 'ja',
        elder: false,
        items: [
          ['projector', 2, 'mailbox', true],
          ['power_drill', 1, 'mailbox'],
          ['dehumidifier', 7, 'entrance'],
        ],
      },
      {
        nickname: 'Yamamoto',
        lang: 'ja',
        elder: false,
        items: [
          ['hot_plate', 2, 'entrance'],
          ['donabe', 2, 'entrance'],
        ],
      },
      {
        nickname: 'Maria',
        lang: 'en',
        elder: false,
        items: [
          ['suitcase', 7, 'entrance'],
          ['camping_tent', 3, 'bike_parking'],
        ],
      },
      {
        nickname: 'Ayesha',
        lang: 'bn',
        elder: false,
        items: [
          ['bluetooth_speaker', 2, 'mailbox'],
          ['rice_cooker_large', 2, 'entrance'],
        ],
      },
    ],
  },
  {
    code: 'HAMA-3CHOME',
    name: 'Hamaguchi-machi 3-chome',
    type: 'block',
    city: 'Nagasaki',
    users: [
      {
        nickname: 'Inoue',
        lang: 'ja',
        elder: false,
        items: [
          ['lawn_mower', 1, 'notice_board'],
          ['hedge_trimmer', 1, 'notice_board'],
        ],
      },
      {
        nickname: 'Kobayashi',
        lang: 'ja',
        elder: false,
        items: [['high_pressure_washer', 1, 'notice_board']],
      },
    ],
  },
];

function japanTime(daysAgo, hour, minute = 0) {
  const japanNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const utc = Date.UTC(
    japanNow.getUTCFullYear(),
    japanNow.getUTCMonth(),
    japanNow.getUTCDate() - daysAgo,
    hour - 9,
    minute
  );
  return new Date(utc).toISOString();
}

async function insertGroupsUsersAndItems(empty, client) {
  const userIds = {};
  // Seed one demo building manager with a random non-guessable password (accessed via DEMO_MODE quick-login).
  const demoPasswordHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
  const mgrRes = await query(
    `INSERT INTO managers (name, email, password_hash, is_demo)
     VALUES ('Sakura Heights Manager', 'manager@sakura.nagasaki.jp', $1, TRUE)
     RETURNING id`,
    [demoPasswordHash],
    client
  );
  const demoManagerId = mgrRes.rows[0].id;

  for (const group of GROUPS) {
    const groupRes = await query(
      'INSERT INTO groups (code, name, type, city, manager_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [group.code, group.name, group.type, group.city, demoManagerId],
      client
    );
    const groupId = groupRes.rows[0].id;
    if (empty) continue;

    for (const user of group.users) {
      const userRes = await query(
        `INSERT INTO users (group_id, nickname, lang, elder_mode, token, is_demo, created_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW() - INTERVAL '30 days')
         RETURNING id`,
        [groupId, user.nickname, user.lang, user.elder, crypto.randomUUID()],
        client
      );
      const userId = userRes.rows[0].id;
      userIds[user.nickname] = userId;

      for (const [itemKey, maxDays, spot, trustedOnly] of user.items) {
        await query(
          `INSERT INTO items (owner_id, group_id, item_key, max_days, spot, trusted_only)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, groupId, itemKey, maxDays, spot, Boolean(trustedOnly)],
          client
        );
      }
    }
  }
  return userIds;
}

async function insertReturnedLoan(mariaId, tanakaId, client) {
  const projectorRes = await query(
    "SELECT * FROM items WHERE owner_id = $1 AND item_key = 'projector' LIMIT 1",
    [tanakaId],
    client
  );
  const projector = projectorRes.rows[0];
  const requestedAt = japanTime(9, 19, 30);
  const returnedAt = japanTime(6, 17, 55);

  const loanRes = await query(
    `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status, returned_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'returned', $6, $7)
     RETURNING *`,
    [projector.id, mariaId, tanakaId, japanTime(8, 18), japanTime(6, 18), returnedAt, requestedAt],
    client
  );
  const loan = loanRes.rows[0];

  const conversation = [
    [mariaId, tanakaId, 'request', requestedAt],
    [tanakaId, mariaId, 'accept', japanTime(9, 20, 5)],
    [mariaId, tanakaId, 'received', japanTime(8, 18, 10)],
    [mariaId, tanakaId, 'returned', returnedAt],
    [tanakaId, mariaId, 'returnConfirmed', japanTime(6, 18, 5)],
    [mariaId, tanakaId, 'qr.thanks', japanTime(6, 18, 7)],
  ];
  for (const [fromId, toId, phraseKey, when] of conversation) {
    const messageId = await createMessage(loan, fromId, toId, phraseKey, client, {}, { silent: true });
    await query('UPDATE messages SET created_at = $1, read_at = $1 WHERE id = $2', [when, messageId], client);
  }
}

export async function seedDatabase({ empty = false, quiet = false } = {}) {
  await resetDatabase();
  await withTransaction(async (client) => {
    const userIds = await insertGroupsUsersAndItems(empty, client);
    if (!empty) {
      await insertReturnedLoan(userIds.Maria, userIds.Tanaka, client);
    }
  });
  await deletePhotos();

  if (quiet) return;

  console.log(empty ? 'Seeded two empty groups:' : 'Seeded the Nagasaki demo data:');
  const groupsRes = await query('SELECT * FROM groups ORDER BY id');
  for (const group of groupsRes.rows) {
    const membersRes = await query('SELECT id, nickname FROM users WHERE group_id = $1 ORDER BY id', [group.id]);
    const itemsRes = await query('SELECT COUNT(*)::int AS count FROM items WHERE group_id = $1', [group.id]);
    const names = membersRes.rows.map((m) => `${m.nickname} #${m.id}`).join(', ');
    console.log(`  ${group.name} (${group.code}): ${names || 'nobody yet'} | ${itemsRes.rows[0].count} items`);
  }
  if (!empty) {
    const messagesRes = await query('SELECT COUNT(*)::int AS count FROM messages');
    console.log(
      `  1 returned loan (Maria borrowed Tanaka's projector) with ${messagesRes.rows[0].count} messages`
    );
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });
  const empty = process.argv.includes('--empty');
  try {
    await seedDatabase({ empty });
  } finally {
    await closeDatabase();
  }
}
