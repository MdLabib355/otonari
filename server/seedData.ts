// The demo data (CLAUDE.md section 9). Used by seed.ts, and by index.ts when the database is empty.

import type { GroupType, Lang, Role } from '../shared/types.ts';
import { found, query, queryOne, resetDatabase, transaction } from './core/database.ts';
import { listGroups } from './modules/group/groupModel.ts';
import { hashSecret } from './modules/auth/password.ts';
import { ensureSuperAdmin } from './modules/auth/superAdmin.ts';
import { createItem } from './modules/item/itemModel.ts';
import { deletePhotos } from './modules/loan/photoFiles.ts';
import { createMessage } from './modules/message/messageModel.ts';
import type { ItemRow, LoanRow, UserRow } from './types.ts';

// For all demo accounts: sato@otonari.example, tanaka@otonari.example, ... It is public, so these accounts
// work only in demo mode.
const DEMO_PASSWORD = 'otonari2611';

type SeedItem = [itemKey: string, maxDays: number, spot: string, trustedOnly?: boolean];

interface SeedGroup {
  code: string;
  name: string;
  type: GroupType;
  city: string;
  users: { nickname: string; lang: Lang; elder: boolean; role?: Role; items: SeedItem[] }[];
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
        elder: true,
        items: [
          ['futon_dryer', 3, 'entrance'],
          ['takoyaki_maker', 2, 'entrance'],
          ['ladder', 1, 'bike_parking'],
        ],
      },
      {
        nickname: 'Tanaka',
        role: 'group_admin',
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
        role: 'group_admin',
        lang: 'ja',
        elder: true,
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

type UserIds = Record<string, number>; // nickname → id, needed for the loan below

async function insertGroup(group: SeedGroup): Promise<number> {
  const row = await queryOne<{ id: number }>(
    'INSERT INTO groups (code, name, type, city) VALUES ($1, $2, $3, $4) RETURNING id',
    [group.code, group.name, group.type, group.city]
  );
  return found(row).id;
}

// They joined a month ago (the returned loan below is from last week).
async function insertUsersAndItems(group: SeedGroup, groupId: number, userIds: UserIds) {
  const passwordHash = await hashSecret(DEMO_PASSWORD);
  for (const user of group.users) {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO users (email, password_hash, email_verified, role, group_id, joined_at, nickname, lang, elder_mode,
                          is_demo, created_at)
       VALUES ($1, $2, true, $3, $4, now() - INTERVAL '30 days', $5, $6, $7, true, now() - INTERVAL '30 days')
       RETURNING id`,
      [
        `${user.nickname.toLowerCase()}@otonari.example`,
        passwordHash,
        user.role ?? 'user',
        groupId,
        user.nickname,
        user.lang,
        user.elder,
      ]
    );
    const userId = found(row).id;
    userIds[user.nickname] = userId;

    for (const [itemKey, maxDays, spot, trustedOnly] of user.items) {
      await createItem(userId, groupId, itemKey, maxDays, spot, trustedOnly ?? false);
    }
  }
}

// One finished loan, so the history isn't empty: Maria borrowed Tanaka's projector last week
// (evening handover, 2 days). The seed has no photo files, so there is no 'handoverPhoto' message.
async function insertReturnedLoan(mariaId: number, tanakaId: number) {
  const projector = found(
    await queryOne<ItemRow>("SELECT * FROM items WHERE owner_id = $1 AND item_key = 'projector'", [tanakaId])
  );
  const requestedAt = japanTime(9, 19, 30);
  const returnedAt = japanTime(6, 17, 55); // five minutes before it was due: on time

  const loan = found(
    await queryOne<LoanRow>(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status, returned_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'returned', $6, $7) RETURNING *`,
      [projector.id, mariaId, tanakaId, japanTime(8, 18), japanTime(6, 18), returnedAt, requestedAt]
    )
  );

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
    const messageId = await createMessage(loan, fromId, toId, phraseKey);
    // Old messages: put them at their real time and mark them read, so no "new message" banner.
    await query('UPDATE messages SET created_at = $1, read_at = $1 WHERE id = $2', [when, messageId]);
  }
}

// Resets everything. All or nothing: if anything fails, the database is left as it was.
export async function seed(empty: boolean) {
  await transaction(async () => {
    await resetDatabase();
    const userIds: UserIds = {};
    for (const group of GROUPS) {
      const groupId = await insertGroup(group);
      if (!empty) await insertUsersAndItems(group, groupId, userIds);
    }
    if (!empty) await insertReturnedLoan(userIds.Maria, userIds.Tanaka);
  });
  deletePhotos(); // they belonged to the old loans
  await ensureSuperAdmin(); // the reset has removed it
  await printSummary(empty);
}

// Short summary.
async function printSummary(empty: boolean) {
  console.log(empty ? 'Seeded two empty groups:' : 'Seeded the Nagasaki demo data:');
  for (const group of await listGroups()) {
    const members = await query<UserRow>('SELECT * FROM users WHERE group_id = $1 ORDER BY id', [group.id]);
    const items = await query<ItemRow>('SELECT * FROM items WHERE group_id = $1', [group.id]);
    const names = members.map((member) => `${member.nickname} (${member.role})`).join(', ');
    console.log(`  ${group.name} (${group.code}): ${names || 'nobody yet'} | ${items.length} items`);
  }
  if (!empty) console.log(`  Log in with e.g. sato@otonari.example, password ${DEMO_PASSWORD}`);
}
