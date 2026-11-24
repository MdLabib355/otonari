// Fixed item catalog. Users pick from this list instead of typing item names,
// so every item has a stable key that translates perfectly into every language.
// Names live in the i18n files under "items.<key>".

import type { CatalogItemRecord, Lang } from '../../../shared/types.ts';

export const CATEGORIES = ['kitchen', 'cleaning', 'tools', 'living', 'outdoor'];

export interface CatalogEntry {
  key: string;
  emoji: string;
  category: string;
}

export const ITEMS: CatalogEntry[] = [
  // kitchen
  { key: 'takoyaki_maker', emoji: '🐙', category: 'kitchen' },
  { key: 'hot_plate', emoji: '🍳', category: 'kitchen' },
  { key: 'rice_cooker_large', emoji: '🍚', category: 'kitchen' },
  { key: 'donabe', emoji: '🍲', category: 'kitchen' },
  { key: 'blender', emoji: '🥤', category: 'kitchen' },
  { key: 'cassette_stove', emoji: '🔥', category: 'kitchen' },
  { key: 'bread_maker', emoji: '🍞', category: 'kitchen' },

  // cleaning & laundry
  { key: 'futon_dryer', emoji: '🛏️', category: 'cleaning' },
  { key: 'vacuum_cleaner', emoji: '🧹', category: 'cleaning' },
  { key: 'steam_iron', emoji: '👔', category: 'cleaning' },
  { key: 'carpet_cleaner', emoji: '🧽', category: 'cleaning' },
  { key: 'dehumidifier', emoji: '💧', category: 'cleaning' },
  { key: 'high_pressure_washer', emoji: '🚿', category: 'cleaning' },

  // tools
  { key: 'ladder', emoji: '🪜', category: 'tools' },
  { key: 'power_drill', emoji: '🔩', category: 'tools' },
  { key: 'tool_set', emoji: '🧰', category: 'tools' },
  { key: 'extension_cord', emoji: '🔌', category: 'tools' },
  { key: 'bicycle_pump', emoji: '🚲', category: 'tools' },

  // living
  { key: 'projector', emoji: '📽️', category: 'living' },
  { key: 'bluetooth_speaker', emoji: '🔊', category: 'living' },
  { key: 'air_purifier', emoji: '🌬️', category: 'living' },
  { key: 'electric_heater', emoji: '♨️', category: 'living' },
  { key: 'board_game', emoji: '🎲', category: 'living' },
  { key: 'baby_stroller', emoji: '👶', category: 'living' },

  // outdoor & travel
  { key: 'lawn_mower', emoji: '🌱', category: 'outdoor' },
  { key: 'hedge_trimmer', emoji: '✂️', category: 'outdoor' },
  { key: 'camping_tent', emoji: '⛺', category: 'outdoor' },
  { key: 'suitcase', emoji: '🧳', category: 'outdoor' },
];

// Handover spots: shared places only — never a home address or room number.
export const SPOTS = ['entrance', 'mailbox', 'bike_parking', 'notice_board', 'konbini'];

// Fixed quick replies either side can send during a loan.
export const QUICK_REPLIES = ['qr.onMyWay', 'qr.atSpot', 'qr.late', 'qr.noProblem', 'qr.thanks'];

// Loan length choices (days). Chips above the item's max_days are hidden.
export const DURATIONS = [1, 2, 3, 7];

// Start choices for the tap-only time picker.
export const START_DAYS = [0, 1, 2]; // today, tomorrow, day after
export type TimeSlot = 'morning' | 'afternoon' | 'evening';
export const TIME_SLOTS: Record<TimeSlot, number> = { morning: 9, afternoon: 13, evening: 18 }; // hour, Japan time

export const LANGUAGES: Lang[] = ['en', 'ja', 'ja-easy', 'bn'];

// Runtime localized overrides synced from GET /api/v1/catalog (falls back to static i18n JSON).
const dynamicItemLabels: Record<Lang, Record<string, string>> = {
  en: {},
  ja: {},
  'ja-easy': {},
  bn: {},
};

export function syncDynamicCatalog(records: CatalogItemRecord[]) {
  if (!Array.isArray(records) || records.length === 0) return;
  ITEMS.splice(
    0,
    ITEMS.length,
    ...records.map((r) => ({ key: r.item_key, emoji: r.emoji, category: r.category }))
  );
  for (const r of records) {
    dynamicItemLabels.en[r.item_key] = r.label_en;
    dynamicItemLabels.ja[r.item_key] = r.label_ja;
    dynamicItemLabels['ja-easy'][r.item_key] = r.label_ja_easy;
    dynamicItemLabels.bn[r.item_key] = r.label_bn;
  }
}

export function dynamicItemLabel(lang: Lang, itemKey: string): string | undefined {
  return dynamicItemLabels[lang]?.[itemKey];
}

export function findItem(key: string) {
  return ITEMS.find((item) => item.key === key);
}
