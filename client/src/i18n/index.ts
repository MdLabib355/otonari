// Otonari i18n: the heart of the app.
// Messages are stored as { phrase_key, params } and rendered here in the VIEWER's language.
// No AI, no translation API — every sentence was written (and checked) by humans.

import type { Lang, PhraseParams } from '../../../shared/types.ts';
import { dynamicCategoryLabel, dynamicItemLabel } from '../data/catalog.ts';
import en from './en.json';
import ja from './ja.json';
import jaEasy from './ja-easy.json';
import bn from './bn.json';

type Section = 'ui' | 'items' | 'categories' | 'spots' | 'phrases' | 'tips';
type LanguageFile = { meta: typeof en.meta } & Partial<Record<Section, Record<string, string>>>;

// The keys of en.json. (English has every key.) TypeScript finds misspelled keys with these.
export type UiKey = keyof typeof en.ui;
export type TipKey = keyof typeof en.tips;

const FILES: Record<Lang, LanguageFile> = { en, ja, 'ja-easy': jaEasy, bn };

// If a key is missing in one language, try the next file in its chain.
const FALLBACK: Record<Lang, Lang[]> = {
  en: ['en'],
  ja: ['ja', 'en'],
  'ja-easy': ['ja-easy', 'ja', 'en'],
  bn: ['bn', 'en'],
};

// Find "section.key" (e.g. "items", "futon_dryer") following the fallback chain.
function lookup(lang: Lang, section: Section, key: string): string {
  for (const code of FALLBACK[lang] || FALLBACK.en) {
    const value = FILES[code]?.[section]?.[key];
    if (value !== undefined) return value;
  }
  return key; // last resort: show the key so missing translations are easy to spot
}

// Replace {placeholders} in a template with values.
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] !== undefined ? String(values[name]) : match
  );
}

export function meta(lang: Lang) {
  return FILES[lang]?.meta || FILES.en.meta;
}

// UI strings: t('en', 'shelf.title', { group: 'Sakura Heights' })
export function t(lang: Lang, key: UiKey, values: Record<string, string | number> = {}): string {
  return fill(lookup(lang, 'ui', key), values);
}

export function itemName(lang: Lang, itemKey: string): string {
  return dynamicItemLabel(lang, itemKey) ?? lookup(lang, 'items', itemKey);
}

export function spotName(lang: Lang, spotKey: string): string {
  return lookup(lang, 'spots', spotKey);
}

export function categoryName(lang: Lang, categoryKey: string): string {
  return dynamicCategoryLabel(lang, categoryKey) ?? lookup(lang, 'categories', categoryKey);
}

export function tip(lang: Lang, tipKey: TipKey): string {
  return lookup(lang, 'tips', tipKey);
}

// Dates are always shown in Japan time, because the neighborhood is in Japan
// (the demo laptop might be in Bangladesh).
export function formatDate(lang: Lang, iso: string): string {
  return new Intl.DateTimeFormat(meta(lang).locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(iso));
}

// Japanese adds the polite honorific "さん" after a name.
export function displayName(lang: Lang, nickname: string): string {
  return lang === 'ja' || lang === 'ja-easy' ? `${nickname}さん` : nickname;
}

// Render one stored message in the viewer's language.
// params may contain: item (key), spot (key), start/end (ISO), name (nickname), n (number)
export function renderPhrase(lang: Lang, phraseKey: string, params: PhraseParams = {}): string {
  const values: Record<string, string | number> = {};
  let item = params.item ? itemName(lang, params.item) : undefined;
  // English item names are capitalized for labels ("Futon dryer"), but inside a sentence
  // they read better in lowercase ("your futon dryer"). "Bluetooth" stays capitalized.
  if (lang === 'en' && item && !item.startsWith('Bluetooth')) {
    item = item.charAt(0).toLowerCase() + item.slice(1);
  }
  if (item) values.item = item;
  if (params.spot) values.spot = spotName(lang, params.spot);
  if (params.start) values.start = formatDate(lang, params.start);
  if (params.end) values.end = formatDate(lang, params.end);
  if (params.name) values.name = displayName(lang, params.name);
  if (params.n !== undefined) values.n = params.n;
  return fill(lookup(lang, 'phrases', phraseKey), values);
}
