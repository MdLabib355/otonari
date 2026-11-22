// Otonari i18n: the heart of the app.
// Messages are stored as { phrase_key, params } and rendered here in the VIEWER's language.
// No AI, no translation API — every sentence was written (and checked) by humans.

import en from './en.json';
import ja from './ja.json';
import jaEasy from './ja-easy.json';
import bn from './bn.json';

const FILES = { en, ja, 'ja-easy': jaEasy, bn };

// If a key is missing in one language, try the next file in its chain.
const FALLBACK = {
  en: ['en'],
  ja: ['ja', 'en'],
  'ja-easy': ['ja-easy', 'ja', 'en'],
  bn: ['bn', 'en'],
};

// Find "section.key" (e.g. "items", "futon_dryer") following the fallback chain.
function lookup(lang, section, key) {
  for (const code of FALLBACK[lang] || FALLBACK.en) {
    const value = FILES[code]?.[section]?.[key];
    if (value !== undefined) return value;
  }
  return key; // last resort: show the key so missing translations are easy to spot
}

// Replace {placeholders} in a template with values.
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] !== undefined ? String(values[name]) : match
  );
}

export function meta(lang) {
  return FILES[lang]?.meta || FILES.en.meta;
}

// UI strings: t('en', 'shelf.title', { group: 'Sakura Heights' })
export function t(lang, key, values = {}) {
  return fill(lookup(lang, 'ui', key), values);
}

export function itemName(lang, itemKey) {
  return lookup(lang, 'items', itemKey);
}

export function spotName(lang, spotKey) {
  return lookup(lang, 'spots', spotKey);
}

export function categoryName(lang, categoryKey) {
  return lookup(lang, 'categories', categoryKey);
}

export function tip(lang, tipKey) {
  return lookup(lang, 'tips', tipKey);
}

// Dates are always shown in Japan time, because the neighborhood is in Japan
// (the demo laptop might be in Bangladesh).
export function formatDate(lang, iso) {
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
export function displayName(lang, nickname) {
  return lang === 'ja' || lang === 'ja-easy' ? `${nickname}さん` : nickname;
}

// Render one stored message in the viewer's language.
// params may contain: item (key), spot (key), start/end (ISO), name (nickname), n (number)
export function renderPhrase(lang, phraseKey, params = {}) {
  const values = {};
  if (params.item) values.item = itemName(lang, params.item);
  // English item names are capitalized for labels ("Futon dryer"), but inside a sentence
  // they read better in lowercase ("your futon dryer"). "Bluetooth" stays capitalized.
  if (lang === 'en' && values.item && !values.item.startsWith('Bluetooth')) {
    values.item = values.item.charAt(0).toLowerCase() + values.item.slice(1);
  }
  if (params.spot) values.spot = spotName(lang, params.spot);
  if (params.start) values.start = formatDate(lang, params.start);
  if (params.end) values.end = formatDate(lang, params.end);
  if (params.name) values.name = displayName(lang, params.name);
  if (params.n !== undefined) values.n = params.n;
  return fill(lookup(lang, 'phrases', phraseKey), values);
}
