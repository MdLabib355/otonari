// Keys and values the server accepts from the client.
// Everything that comes in (item, spot, quick reply, language, loan length, admin phrases) is validated
// against these allowlists.

import type {
  GroupLifecycleStatus,
  GroupRole,
  GroupType,
  JoinPolicy,
  Lang,
  MemberStatus,
} from '../../shared/types.ts';
import { queryOne } from './database.ts';

export interface CanonicalCatalogSeed {
  item_key: string;
  emoji: string;
  category: string;
  label_en: string;
  label_ja: string;
  label_ja_easy: string;
  label_bn: string;
}

export const CATEGORIES = ['kitchen', 'cleaning', 'tools', 'living', 'outdoor'] as const;

export const CANONICAL_CATALOG: CanonicalCatalogSeed[] = [
  // kitchen
  { item_key: 'takoyaki_maker', emoji: '🐙', category: 'kitchen', label_en: 'Takoyaki maker', label_ja: 'たこ焼き器', label_ja_easy: 'たこやき き', label_bn: 'টাকোয়াকি মেকার' },
  { item_key: 'hot_plate', emoji: '🍳', category: 'kitchen', label_en: 'Hot plate', label_ja: 'ホットプレート', label_ja_easy: 'ホットプレート', label_bn: 'হট প্লেট' },
  { item_key: 'rice_cooker_large', emoji: '🍚', category: 'kitchen', label_en: 'Large rice cooker', label_ja: '大きい炊飯器', label_ja_easy: 'おおきい すいはんき', label_bn: 'বড় রাইস কুকার' },
  { item_key: 'donabe', emoji: '🍲', category: 'kitchen', label_en: 'Donabe (clay hot pot)', label_ja: '土鍋', label_ja_easy: 'どなべ', label_bn: 'দোনাবে (মাটির হাঁড়ি)' },
  { item_key: 'blender', emoji: '🥤', category: 'kitchen', label_en: 'Blender', label_ja: 'ミキサー', label_ja_easy: 'ミキサー', label_bn: 'ব্লেন্ডার' },
  { item_key: 'cassette_stove', emoji: '🔥', category: 'kitchen', label_en: 'Portable gas stove', label_ja: 'カセットコンロ', label_ja_easy: 'カセットコンロ', label_bn: 'পোর্টেবল গ্যাস চুলা' },
  { item_key: 'bread_maker', emoji: '🍞', category: 'kitchen', label_en: 'Bread maker', label_ja: 'ホームベーカリー', label_ja_easy: 'パンを つくる きかい', label_bn: 'ব্রেড মেকার' },
  // cleaning & laundry
  { item_key: 'futon_dryer', emoji: '🛏️', category: 'cleaning', label_en: 'Futon dryer', label_ja: '布団乾燥機', label_ja_easy: 'ふとんを かわかす きかい', label_bn: 'ফুটন (তোশক) ড্রায়ার' },
  { item_key: 'vacuum_cleaner', emoji: '🧹', category: 'cleaning', label_en: 'Vacuum cleaner', label_ja: '掃除機', label_ja_easy: 'そうじき', label_bn: 'ভ্যাকুয়াম ক্লিনার' },
  { item_key: 'steam_iron', emoji: '👔', category: 'cleaning', label_en: 'Steam iron', label_ja: 'スチームアイロン', label_ja_easy: 'アイロン', label_bn: 'স্টিম ইস্ত্রি' },
  { item_key: 'carpet_cleaner', emoji: '🧽', category: 'cleaning', label_en: 'Carpet cleaner', label_ja: 'カーペットクリーナー', label_ja_easy: 'カーペット クリーナー', label_bn: 'কার্পেট ক্লিনার' },
  { item_key: 'dehumidifier', emoji: '💧', category: 'cleaning', label_en: 'Dehumidifier', label_ja: '除湿機', label_ja_easy: 'じょしつき', label_bn: 'ডিহিউমিডিফায়ার' },
  { item_key: 'high_pressure_washer', emoji: '🚿', category: 'cleaning', label_en: 'Pressure washer', label_ja: '高圧洗浄機', label_ja_easy: 'こうあつ せんじょうき', label_bn: 'প্রেশার ওয়াশার' },
  // tools
  { item_key: 'ladder', emoji: '🪜', category: 'tools', label_en: 'Stepladder', label_ja: '脚立', label_ja_easy: 'きゃたつ', label_bn: 'মই' },
  { item_key: 'power_drill', emoji: '🔩', category: 'tools', label_en: 'Power drill', label_ja: '電動ドリル', label_ja_easy: 'でんどう ドリル', label_bn: 'ইলেকট্রিক ড্রিল' },
  { item_key: 'tool_set', emoji: '🧰', category: 'tools', label_en: 'Tool set', label_ja: '工具セット', label_ja_easy: 'こうぐ セット', label_bn: 'যন্ত্রপাতির সেট' },
  { item_key: 'extension_cord', emoji: '🔌', category: 'tools', label_en: 'Extension cord', label_ja: '延長コード', label_ja_easy: 'えんちょう コード', label_bn: 'এক্সটেনশন কর্ড' },
  { item_key: 'bicycle_pump', emoji: '🚲', category: 'tools', label_en: 'Bicycle pump', label_ja: '自転車の空気入れ', label_ja_easy: 'じてんしゃの くうきいれ', label_bn: 'সাইকেলের পাম্প' },
  // living
  { item_key: 'projector', emoji: '📽️', category: 'living', label_en: 'Projector', label_ja: 'プロジェクター', label_ja_easy: 'プロジェクター', label_bn: 'প্রজেক্টর' },
  { item_key: 'bluetooth_speaker', emoji: '🔊', category: 'living', label_en: 'Bluetooth speaker', label_ja: 'Bluetoothスピーカー', label_ja_easy: 'スピーカー', label_bn: 'ব্লুটুথ স্পিকার' },
  { item_key: 'air_purifier', emoji: '🌬️', category: 'living', label_en: 'Air purifier', label_ja: '空気清浄機', label_ja_easy: 'くうき せいじょうき', label_bn: 'এয়ার পিউরিফায়ার' },
  { item_key: 'electric_heater', emoji: '♨️', category: 'living', label_en: 'Electric heater', label_ja: '電気ストーブ', label_ja_easy: 'でんき ストーブ', label_bn: 'বৈদ্যুতিক হিটার' },
  { item_key: 'board_game', emoji: '🎲', category: 'living', label_en: 'Board games', label_ja: 'ボードゲーム', label_ja_easy: 'ボードゲーム', label_bn: 'বোর্ড গেম' },
  { item_key: 'baby_stroller', emoji: '👶', category: 'living', label_en: 'Baby stroller', label_ja: 'ベビーカー', label_ja_easy: 'ベビーカー', label_bn: 'বেবি স্ট্রলার' },
  // outdoor & travel
  { item_key: 'lawn_mower', emoji: '🌱', category: 'outdoor', label_en: 'Lawn mower', label_ja: '芝刈り機', label_ja_easy: 'しばかりき', label_bn: 'ঘাস কাটার যন্ত্র' },
  { item_key: 'hedge_trimmer', emoji: '✂️', category: 'outdoor', label_en: 'Hedge trimmer', label_ja: 'ヘッジトリマー', label_ja_easy: 'きを きる きかい', label_bn: 'ঝোপ ছাঁটার যন্ত্র' },
  { item_key: 'camping_tent', emoji: '⛺', category: 'outdoor', label_en: 'Camping tent', label_ja: 'キャンプ用テント', label_ja_easy: 'テント', label_bn: 'ক্যাম্পিং তাঁবু' },
  { item_key: 'suitcase', emoji: '🧳', category: 'outdoor', label_en: 'Suitcase', label_ja: 'スーツケース', label_ja_easy: 'スーツケース', label_bn: 'স্যুটকেস' },
];

export const ITEM_KEYS = CANONICAL_CATALOG.map((item) => item.item_key);

// Handover spots: shared places only, never a home address or room number.
export const SPOT_KEYS = ['entrance', 'mailbox', 'bike_parking', 'notice_board', 'konbini'];

// The only phrases a resident can pick freely (everything else is chosen by the server).
export const QUICK_REPLY_KEYS = ['qr.onMyWay', 'qr.atSpot', 'qr.late', 'qr.noProblem', 'qr.thanks'];

// Fixed structured phrases for Group Admin gentle mediation (zero free-text).
export const ADMIN_MEDIATION_KEYS = ['admin.gentleReminder', 'admin.spotAssist', 'admin.receivedAtDesk'] as const;

// Fixed structured phrases for building-wide pinned announcements (zero free-text).
export const ANNOUNCEMENT_KEYS = [
  'notice.welcome',
  'notice.newPoster',
  'notice.rainySeason',
  'notice.entranceTidy',
] as const;

// Fixed reason keys when a resident flags a loan for building admin mediation.
export const DISPUTE_REASON_KEYS = ['overdue', 'forgot_to_confirm', 'item_damaged', 'other'] as const;

export const LANGUAGES: Lang[] = ['en', 'ja', 'ja-easy', 'bn'];
export const GROUP_TYPES: GroupType[] = ['building', 'block'];
export const JOIN_POLICIES: JoinPolicy[] = ['open', 'approval_required', 'locked'];
export const GROUP_LIFECYCLE_STATUSES: GroupLifecycleStatus[] = ['active', 'read_only', 'suspended', 'archived'];
export const GROUP_ROLES: GroupRole[] = ['member', 'co_admin', 'group_admin'];
export const MEMBER_STATUSES: MemberStatus[] = ['pending', 'active', 'borrow_muted', 'suspended'];

// Loan lengths in days (an item's max_days must be one of these).
export const DURATIONS = [1, 2, 3, 7];

// Is this value in the list? It comes from the client, so it can be anything; after this check
// TypeScript knows its type.
export function isOneOf<T>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}

// Validates an item_key against active DB catalog items, with fallback to canonical defaults if empty.
export async function isActiveCatalogItemKey(value: unknown): Promise<boolean> {
  if (typeof value !== 'string' || value.length === 0) return false;
  const row = await queryOne<{ item_key: string; is_active: boolean }>(
    'SELECT item_key, is_active FROM catalog_items WHERE item_key = $1',
    [value]
  );
  if (row) return row.is_active;
  const anyRow = await queryOne<{ item_key: string }>('SELECT item_key FROM catalog_items LIMIT 1');
  if (anyRow) return false;
  return isOneOf(ITEM_KEYS, value);
}
