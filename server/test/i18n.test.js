import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DURATIONS, ITEM_KEYS, LANGUAGES, QUICK_REPLY_KEYS, SPOT_KEYS } from '../config/constants.js';
import {
  DURATIONS as CLIENT_DURATIONS,
  ITEMS as CLIENT_ITEMS,
  LANGUAGES as CLIENT_LANGUAGES,
  QUICK_REPLIES as CLIENT_QUICK_REPLIES,
  SPOTS as CLIENT_SPOTS,
} from '../../client/src/data/catalog.js';

const i18nDir = path.join(import.meta.dirname, '..', '..', 'client', 'src', 'i18n');

function loadLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(i18nDir, `${code}.json`), 'utf8'));
}

function extractPlaceholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('Slice 4: Catalog & 4-language i18n parity (T39)', () => {
  const locales = Object.fromEntries(LANGUAGES.map((code) => [code, loadLocale(code)]));

  it('keeps server/allowedKeys.js and client/src/data/catalog.js strictly identical', () => {
    assert.deepEqual(
      ITEM_KEYS,
      CLIENT_ITEMS.map((item) => item.key)
    );
    assert.deepEqual(SPOT_KEYS, CLIENT_SPOTS);
    assert.deepEqual(QUICK_REPLY_KEYS, CLIENT_QUICK_REPLIES);
    assert.deepEqual(DURATIONS, CLIENT_DURATIONS);
    assert.deepEqual(LANGUAGES, CLIENT_LANGUAGES);
  });

  it('contains every catalog item, spot, quick reply, and v2 phrase across all 4 languages', () => {
    const requiredPhrases = [
      'request',
      'cancel',
      'accept',
      'decline',
      'declineBusy',
      'handoverPhoto',
      'received',
      'returned',
      'returnConfirmed',
      'sys.dueSoon',
      'sys.overdue',
      'sys.overdueLender',
      'pingNeedBack',
      'pingOverdue',
      ...QUICK_REPLY_KEYS,
    ];

    for (const lang of LANGUAGES) {
      const data = locales[lang];
      for (const key of ITEM_KEYS) {
        assert.ok(data.items?.[key]?.trim(), `${lang}.items.${key} missing`);
      }
      for (const key of SPOT_KEYS) {
        assert.ok(data.spots?.[key]?.trim(), `${lang}.spots.${key} missing`);
      }
      for (const key of requiredPhrases) {
        assert.ok(data.phrases?.[key]?.trim(), `${lang}.phrases.${key} missing`);
      }
    }
  });

  it('maintains 100% key and placeholder parity across en, ja, ja-easy, and bn', () => {
    const base = locales.en;
    const sections = ['ui', 'categories', 'items', 'spots', 'phrases', 'tips'];

    for (const lang of LANGUAGES.filter((code) => code !== 'en')) {
      const target = locales[lang];
      for (const section of sections) {
        const baseKeys = Object.keys(base[section]);
        for (const key of baseKeys) {
          assert.ok(target[section]?.[key]?.trim(), `${lang}.${section}.${key} missing`);
          assert.deepEqual(
            extractPlaceholders(target[section][key]),
            extractPlaceholders(base[section][key]),
            `Placeholder mismatch for ${lang}.${section}.${key}`
          );
        }
      }
    }
  });
});
