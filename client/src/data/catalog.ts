// Fixed item catalog. Users pick from this list instead of typing item names,
// so every item has a stable key that translates perfectly into every language.
// Names live in the i18n files under "items.<key>".

import { useSyncExternalStore } from 'react';
import type { CatalogCategoryRecord, CatalogItemRecord, Lang } from '../../../shared/types.ts';

// The categories until GET /api/v1/categories has answered.
export const CATEGORIES = ['kitchen', 'cleaning', 'tools', 'living', 'outdoor'];

export interface CatalogEntry {
  key: string;
  category: string;
}

export const ITEMS: CatalogEntry[] = [
  // kitchen
  { key: 'takoyaki_maker', category: 'kitchen' },
  { key: 'hot_plate', category: 'kitchen' },
  { key: 'rice_cooker_large', category: 'kitchen' },
  { key: 'donabe', category: 'kitchen' },
  { key: 'blender', category: 'kitchen' },
  { key: 'cassette_stove', category: 'kitchen' },
  { key: 'bread_maker', category: 'kitchen' },

  // cleaning & laundry
  { key: 'futon_dryer', category: 'cleaning' },
  { key: 'vacuum_cleaner', category: 'cleaning' },
  { key: 'steam_iron', category: 'cleaning' },
  { key: 'carpet_cleaner', category: 'cleaning' },
  { key: 'dehumidifier', category: 'cleaning' },
  { key: 'high_pressure_washer', category: 'cleaning' },

  // tools
  { key: 'ladder', category: 'tools' },
  { key: 'power_drill', category: 'tools' },
  { key: 'tool_set', category: 'tools' },
  { key: 'extension_cord', category: 'tools' },
  { key: 'bicycle_pump', category: 'tools' },

  // living
  { key: 'projector', category: 'living' },
  { key: 'bluetooth_speaker', category: 'living' },
  { key: 'air_purifier', category: 'living' },
  { key: 'electric_heater', category: 'living' },
  { key: 'board_game', category: 'living' },
  { key: 'baby_stroller', category: 'living' },

  // outdoor & travel
  { key: 'lawn_mower', category: 'outdoor' },
  { key: 'hedge_trimmer', category: 'outdoor' },
  { key: 'camping_tent', category: 'outdoor' },
  { key: 'suitcase', category: 'outdoor' },
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

// What GET /api/v1/catalog and GET /api/v1/categories say goes before the language files.
type Labels = Record<Lang, Record<string, string>>;
const dynamicItemLabels: Labels = { en: {}, ja: {}, 'ja-easy': {}, bn: {} };
const dynamicCategoryLabels: Labels = { en: {}, ja: {}, 'ja-easy': {}, bn: {} };
const categoryIcons: Record<string, string> = {};

// Components that show the catalog call useCatalog(): they are drawn again when it changes.
let version = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

export function useCatalog() {
  useSyncExternalStore(subscribe, () => version);
  return { items: ITEMS, categories: CATEGORIES };
}

interface LabelRecord {
  label_en: string;
  label_ja: string;
  label_ja_easy: string;
  label_bn: string;
}

function saveLabels(labels: Labels, key: string, record: LabelRecord) {
  labels.en[key] = record.label_en;
  labels.ja[key] = record.label_ja;
  labels['ja-easy'][key] = record.label_ja_easy;
  labels.bn[key] = record.label_bn;
}

export function syncDynamicCatalog(records: CatalogItemRecord[]) {
  if (!Array.isArray(records) || records.length === 0) return;
  ITEMS.splice(
    0,
    ITEMS.length,
    ...records.map((r) => ({ key: r.item_key, category: r.category }))
  );
  for (const r of records) saveLabels(dynamicItemLabels, r.item_key, r);
  changed();
}

// All records give their labels and icons; only the active ones can be chosen.
export function syncDynamicCategories(records: CatalogCategoryRecord[]) {
  if (!Array.isArray(records) || records.length === 0) return;
  CATEGORIES.splice(0, CATEGORIES.length, ...records.filter((r) => r.is_active).map((r) => r.category_key));
  for (const r of records) {
    saveLabels(dynamicCategoryLabels, r.category_key, r);
    categoryIcons[r.category_key] = r.icon_key;
  }
  changed();
}

export function dynamicCategoryLabel(lang: Lang, categoryKey: string): string | undefined {
  return dynamicCategoryLabels[lang]?.[categoryKey];
}

// The drawing of a category. (The first five categories are called like their drawings.)
export function categoryIconKey(categoryKey: string): string {
  return categoryIcons[categoryKey] ?? categoryKey;
}

export function dynamicItemLabel(lang: Lang, itemKey: string): string | undefined {
  return dynamicItemLabels[lang]?.[itemKey];
}

export function findItem(key: string) {
  return ITEMS.find((item) => item.key === key);
}
