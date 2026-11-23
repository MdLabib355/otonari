// Unified 3-layer notification dispatcher:
//   Layer 1: Persistent DB message row (already committed in messages table)
//   Layer 2: Live SSE push via events.js
//   Layer 3: Background Web Push via push.js localized in the recipient's language

import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db/pool.js';
import { notifyUser } from './events.js';
import { sendPushToUser } from './push.js';

const i18nDir = path.join(import.meta.dirname, '..', '..', 'client', 'src', 'i18n');
const LOCALES = Object.fromEntries(
  ['en', 'ja', 'ja-easy', 'bn'].map((code) => [
    code,
    JSON.parse(fs.readFileSync(path.join(i18nDir, `${code}.json`), 'utf8')),
  ])
);

const FALLBACK = {
  en: ['en'],
  ja: ['ja', 'en'],
  'ja-easy': ['ja-easy', 'ja', 'en'],
  bn: ['bn', 'en'],
};

function lookup(lang, section, key) {
  for (const code of FALLBACK[lang] || FALLBACK.en) {
    const val = LOCALES[code]?.[section]?.[key];
    if (val !== undefined) return val;
  }
  return key;
}

function formatDate(lang, iso) {
  const locale = LOCALES[lang]?.meta?.locale ?? 'en-US';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(iso));
}

function renderLocalizedBody(lang, phraseKey, params) {
  const values = {};
  if (params.item) values.item = lookup(lang, 'items', params.item);
  if (lang === 'en' && values.item && !values.item.startsWith('Bluetooth')) {
    values.item = values.item.charAt(0).toLowerCase() + values.item.slice(1);
  }
  if (params.spot) values.spot = lookup(lang, 'spots', params.spot);
  if (params.start) values.start = formatDate(lang, params.start);
  if (params.end) values.end = formatDate(lang, params.end);
  if (params.name) {
    values.name =
      lang === 'ja' || lang === 'ja-easy'
        ? params.name.endsWith('さん')
          ? params.name
          : `${params.name}さん`
        : params.name;
  }
  const template = lookup(lang, 'phrases', phraseKey);
  return template.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined ? String(values[k]) : m));
}

export async function dispatchMessageNotification(toUserId, { loanId, fromUserId, phraseKey, params }) {
  // Layer 2: Instant in-app SSE update
  notifyUser(toUserId, { type: 'message', loan_id: loanId, phrase_key: phraseKey });

  // Layer 3: Localized background Web Push
  const userRes = await query('SELECT lang FROM users WHERE id = $1 AND left_at IS NULL', [toUserId]);
  const user = userRes.rows[0];
  if (!user) return;

  const lang = user.lang;
  const appName = lookup(lang, 'ui', 'appName');
  const title =
    fromUserId === null
      ? `${appName} · ${lookup(lang, 'ui', 'banner.reminder')}`
      : appName;
  const body = renderLocalizedBody(lang, phraseKey, params);

  await sendPushToUser(toUserId, {
    title,
    body,
    url: `/loan/${loanId}`,
    tag: `otonari-loan-${loanId}`,
  });
}

export function dispatchStatusNotification(userId, status) {
  notifyUser(userId, { type: 'status', status });
}
