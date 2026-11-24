// The demo data (CLAUDE.md section 9), unified with real email accounts, roles (Sato group_admin,
// Tanaka co_admin, Inoue group_admin), 28 canonical catalog items, 1 overdue loan, and 1 escalated dispute.

import type { GroupType, Lang, Role } from '../shared/types.ts';
import { CANONICAL_CATALOG } from './core/allowedKeys.ts';
import { writeAuditLog } from './core/audit.ts';
import { found, query, queryOne, resetDatabase, transaction } from './core/database.ts';
import { hashSecret } from './modules/auth/password.ts';
import { ensureSuperAdmin } from './modules/auth/superAdmin.ts';
import { listGroups } from './modules/group/groupModel.ts';
import { createItem, setItemStatus } from './modules/item/itemModel.ts';
import { deletePhotos } from './core/photoFiles.ts';
import { createMessage } from './modules/message/messageModel.ts';
import type { ItemRow, LoanRow, UserRow } from './types.ts';

// Shared password for the seeded demo accounts (only works when DEMO_MODE=true).
export const DEMO_PASSWORD = 'otonari2611';

type SeedItem = [itemKey: string, maxDays: number, spot: string, trustedOnly?: boolean];

interface SeedUser {
  nickname: string;
  lang: Lang;
  elder: boolean;
  role?: Role;
  items: SeedItem[];
}

interface SeedGroup {
  code: string;
  name: string;
  type: GroupType;
  city: string;
  users: SeedUser[];
}

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
        role: 'group_admin',
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
        role: 'co_admin',
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
        elder: true,
        role: 'group_admin',
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

function japanTime(daysAgo: number, hour: number, minute = 0): string {
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

type UserIds = Record<string, number>;

export async function seedCatalogItems() {
  for (const item of CANONICAL_CATALOG) {
    await query(
      `INSERT INTO catalog_items (
         item_key, emoji, category, is_active, label_en, label_ja, label_ja_easy, label_bn
       )
       VALUES ($1, $2, $3, true, $4, $5, $6, $7)
       ON CONFLICT (item_key) DO NOTHING`,
      [item.item_key, item.emoji, item.category, item.label_en, item.label_ja, item.label_ja_easy, item.label_bn]
    );
  }
}

async function insertGroup(group: SeedGroup): Promise<number> {
  const row = await queryOne<{ id: number }>(
    'INSERT INTO groups (code, name, type, city) VALUES ($1, $2, $3, $4) RETURNING id',
    [group.code, group.name, group.type, group.city]
  );
  return found(row).id;
}

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

async function insertReturnedLoanAndDispute(groupId: number, mariaId: number, tanakaId: number, satoId: number) {
  const projector = found(
    await queryOne<ItemRow>("SELECT * FROM items WHERE owner_id = $1 AND item_key = 'projector'", [tanakaId])
  );
  const requestedAt = japanTime(9, 19, 30);
  const returnedAt = japanTime(6, 17, 55);

  const loan = found(
    await queryOne<LoanRow>(
      `INSERT INTO loans (item_id, borrower_id, lender_id, start_at, end_at, status, returned_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'returned', $6, $7) RETURNING *`,
      [projector.id, mariaId, tanakaId, japanTime(8, 18), japanTime(6, 18), returnedAt, requestedAt]
    )
  );

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
    await query('UPDATE messages SET created_at = $1, read_at = $1 WHERE id = $2', [when, messageId]);
  }

  await query(
    `INSERT INTO loan_disputes (
       group_id, loan_id, raised_by_user_id, reason_key, status, escalated_to_super_admin
     )
     VALUES ($1, $2, $3, 'item_damaged', 'open', true)`,
    [groupId, loan.id, tanakaId]
  );

  await writeAuditLog({
    actorId: satoId,
    actorLabel: 'GroupAdmin · Sato',
    actorRole: 'group_admin',
    scopeGroupId: groupId,
    category: 'Break-Glass',
    action: 'dispute.escalated',
    targetType: 'loan',
    targetId: loan.id,
    reason: 'item_damaged',
    detail: `Escalated condition check on Loan #${loan.id} (projector) from Sakura Heights to Super Admin queue.`,
  });
}

async function insertOverdueLoan(groupId: number, yamamotoId: number, ayeshaId: number) {
  const speaker = found(
    await queryOne<ItemRow>("SELECT * FROM items WHERE owner_id = $1 AND item_key = 'bluetooth_speaker'", [ayeshaId])
  );
  const requestedAt = japanTime(4, 18, 0);
  const startAt = japanTime(3, 18, 0);
  const endAt = japanTime(1, 18, 0);

  const loan = found(
    await queryOne<LoanRow>(
      `INSERT INTO loans (
         item_id, borrower_id, lender_id, start_at, end_at, status,
         reminded_soon_at, reminded_overdue_at, created_at
       )
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8) RETURNING *`,
      [speaker.id, yamamotoId, ayeshaId, startAt, endAt, japanTime(2, 18, 5), japanTime(1, 18, 5), requestedAt]
    )
  );
  await setItemStatus(speaker.id, 'lent');

  const conversation: [number | null, number, string, string][] = [
    [yamamotoId, ayeshaId, 'request', requestedAt],
    [ayeshaId, yamamotoId, 'accept', japanTime(4, 18, 12)],
    [yamamotoId, ayeshaId, 'received', japanTime(3, 18, 10)],
    [null, yamamotoId, 'sys.overdue', japanTime(1, 18, 5)],
    [null, ayeshaId, 'sys.overdueLender', japanTime(1, 18, 5)],
  ];
  for (const [fromId, toId, phraseKey, when] of conversation) {
    const messageId = await createMessage(loan, fromId, toId, phraseKey);
    await query('UPDATE messages SET created_at = $1, read_at = $1 WHERE id = $2', [when, messageId]);
  }

  await writeAuditLog({
    actorRole: 'system',
    actorLabel: 'Worker · reminders.ts',
    scopeGroupId: groupId,
    category: 'System',
    action: 'system.overdue_flagged',
    targetType: 'loan',
    targetId: loan.id,
    detail: `Flagged Loan #${loan.id} (bluetooth_speaker) as overdue and notified Yamamoto & Ayesha.`,
  });
}

export async function seed(empty: boolean) {
  await transaction(async () => {
    await resetDatabase();
    await seedCatalogItems();
    const userIds: UserIds = {};
    const groupIds: Record<string, number> = {};
    for (const group of GROUPS) {
      const groupId = await insertGroup(group);
      groupIds[group.code] = groupId;
      if (!empty) await insertUsersAndItems(group, groupId, userIds);
    }

    await writeAuditLog({
      actorRole: 'super_admin',
      actorLabel: 'Super Admin',
      category: 'Catalog',
      action: 'catalog.seeded',
      targetType: 'catalog',
      targetId: 'canonical_28',
      detail: `Seeded ${CANONICAL_CATALOG.length} verified 4-locale catalog items.`,
    });

    if (!empty) {
      await insertReturnedLoanAndDispute(
        groupIds['SAKURA-2611'],
        userIds.Maria,
        userIds.Tanaka,
        userIds.Sato
      );
      await insertOverdueLoan(groupIds['SAKURA-2611'], userIds.Yamamoto, userIds.Ayesha);
    }
  });
  await deletePhotos();
  await ensureSuperAdmin();
  await printSummary(empty);
}

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
