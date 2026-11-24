// Resets the database and deletes the old photos. Run from the project root:
//   npm run seed         fills it with the Nagasaki demo data (CLAUDE.md section 9)
//   npm run seed:empty   only the two groups: for a demo with real people, who all join themselves
// Safe to run any time, even while `npm run dev` is running: it always starts from empty tables.
// Everyone gets a new token, so open browser windows will be sent back to the join page.

import crypto from 'node:crypto';
import type { GroupType, Lang } from '../shared/types.ts';
import { db, found, resetDatabase } from './core/database.ts';
import { listGroups } from './modules/group/groupModel.ts';
import { createItem } from './modules/item/itemModel.ts';
import { getLoan } from './modules/loan/loanModel.ts';
import { createMessage } from './modules/message/messageModel.ts';
import type { CountRow, ItemRow, UserRow } from './types.ts';
import { deletePhotos } from './modules/loan/photoFiles.ts';

const EMPTY = process.argv.includes('--empty'); // npm run seed:empty

type SeedItem = [itemKey: string, maxDays: number, spot: string, trustedOnly?: boolean];

interface SeedGroup {
  code: string;
  name: string;
  type: GroupType;
  city: string;
  users: { nickname: string; lang: Lang; elder: 0 | 1; items: SeedItem[] }[];
}

// Rahim is NOT here on purpose: he joins live during the demo.
// Items are [item_key, max_days, spot], plus true for "trusted neighbors only".
const GROUPS: SeedGroup[] = [
  {
    code: 'SAKURA-2611',
    name: 'Sakura Heights',
    type: 'building',
    city: 'Nagasaki',
    users: [
      {
        nickname: 'Sato',
        lang: 'ja',
        elder: 1,
        items: [
          ['futon_dryer', 3, 'entrance'],
          ['takoyaki_maker', 2, 'entrance'],
          ['ladder', 1, 'bike_parking'],
        ],
      },
      {
        nickname: 'Tanaka',
        lang: 'ja',
        elder: 0,
        items: [
          ['projector', 2, 'mailbox', true],
          ['power_drill', 1, 'mailbox'],
          ['dehumidifier', 7, 'entrance'],
        ],
      },
      {
        nickname: 'Yamamoto',
        lang: 'ja',
        elder: 0,
        items: [
          ['hot_plate', 2, 'entrance'],
          ['donabe', 2, 'entrance'],
        ],
      },
      {
        nickname: 'Maria',
        lang: 'en',
        elder: 0,
        items: [
          ['suitcase', 7, 'entrance'],
          ['camping_tent', 3, 'bike_parking'],
        ],
      },
      {
        nickname: 'Ayesha',
        lang: 'bn',
        elder: 0,
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
        elder: 1,
        items: [
          ['lawn_mower', 1, 'notice_board'],
          ['hedge_trimmer', 1, 'notice_board'],
        ],
      },
      {
        nickname: 'Kobayashi',
        lang: 'ja',
        elder: 0,
        items: [['high_pressure_washer', 1, 'notice_board']],
      },
    ],
  },
];

// ISO time (UTC) for "N days ago at hh:mm in Japan". Japan is always UTC+9 (no summer time).
function japanTime(daysAgo: number, hour: number, minute = 0): string {
  const japanNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // its UTC fields show Japan's date
  const utc = Date.UTC(
    japanNow.getUTCFullYear(),
    japanNow.getUTCMonth(),
    japanNow.getUTCDate() - daysAgo,
    hour - 9, // hh:mm in Japan is (hh - 9):mm in UTC (Date.UTC handles going below 0)
    minute
  );
  return new Date(utc).toISOString();
}

function insertGroupsUsersAndItems() {
  const userIds: Record<string, number> = {}; // nickname → id, needed for the loan below

  for (const group of GROUPS) {
    const insertedGroup = db
      .prepare('INSERT INTO groups (code, name, type, city) VALUES (?, ?, ?, ?)')
      .run(group.code, group.name, group.type, group.city);
    const groupId = Number(insertedGroup.lastInsertRowid);
    if (EMPTY) continue; // nobody has joined yet

    for (const user of group.users) {
      // They joined a month ago (the returned loan below is from last week).
      const inserted = db
        .prepare(
          `INSERT INTO users (group_id, nickname, lang, elder_mode, token, is_demo, created_at)
           VALUES (?, ?, ?, ?, ?, 1, datetime('now', '-30 days'))`
        )
        .run(groupId, user.nickname, user.lang, user.elder, crypto.randomUUID());
      const userId = Number(inserted.lastInsertRowid);
      userIds[user.nickname] = userId;

      for (const [itemKey, maxDays, spot, trustedOnly] of user.items) {
        createItem(userId, groupId, itemKey, maxDays, spot, trustedOnly ?? false);
      }
    }
  }
  return userIds;
}

// One finished loan, so the history isn't empty: Maria borrowed Tanaka's projector last week
// (evening handover, 2 days). The seed has no photo files, so there is no 'handoverPhoto' message.
function insertReturnedLoan(mariaId: number, tanakaId: number) {
  const projector = found(
    db
      .prepare<unknown[], ItemRow>("SELECT * FROM items WHERE owner_id = ? AND item_key = 'projector'")
      .get(tanakaId)
  );
  const requestedAt = japanTime(9, 19, 30);
  const returnedAt = japanTime(6, 17, 55); // five minutes before it was due: on time

  const loanId = db
    .prepare(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status, returned_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'returned', ?, datetime(?))`
    )
    .run(projector.id, mariaId, tanakaId, japanTime(8, 18), japanTime(6, 18), returnedAt, requestedAt)
    .lastInsertRowid;
  const loan = getLoan(Number(loanId));

  // [from, to, phrase_key, when]
  const conversation: [number, number, string, string][] = [
    [mariaId, tanakaId, 'request', requestedAt],
    [tanakaId, mariaId, 'accept', japanTime(9, 20, 5)],
    [mariaId, tanakaId, 'received', japanTime(8, 18, 10)],
    [mariaId, tanakaId, 'returned', returnedAt],
    [tanakaId, mariaId, 'returnConfirmed', japanTime(6, 18, 5)],
    [mariaId, tanakaId, 'qr.thanks', japanTime(6, 18, 7)],
  ];
  for (const [fromId, toId, phraseKey, when] of conversation) {
    const messageId = createMessage(loan, fromId, toId, phraseKey);
    // Old messages: put them at their real time and mark them read, so no "new message" banner.
    db.prepare('UPDATE messages SET created_at = datetime(?), read_at = datetime(?) WHERE id = ?')
      .run(when, when, messageId);
  }
}

// All or nothing: if anything fails, the database is left as it was.
const seed = db.transaction(() => {
  resetDatabase();
  const userIds = insertGroupsUsersAndItems();
  if (!EMPTY) insertReturnedLoan(userIds.Maria, userIds.Tanaka);
});
seed();
deletePhotos(); // they belonged to the old loans

// Short summary (the user ids are handy for POST /api/demo/login).
console.log(EMPTY ? 'Seeded two empty groups:' : 'Seeded the Nagasaki demo data:');
for (const group of listGroups()) {
  const members = db
    .prepare<unknown[], UserRow>('SELECT * FROM users WHERE group_id = ? ORDER BY id')
    .all(group.id);
  const items = found(
    db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM items WHERE group_id = ?').get(group.id)
  );
  const names = members.map((member) => `${member.nickname} #${member.id}`).join(', ');
  console.log(`  ${group.name} (${group.code}): ${names || 'nobody yet'} | ${items.count} items`);
}
if (!EMPTY) {
  const messages = found(db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM messages').get());
  console.log(`  1 returned loan (Maria borrowed Tanaka's projector) with ${messages.count} messages`);
}
