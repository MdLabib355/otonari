// The logged-in neighbor + persistent device UI language, shared with every page.
// App.jsx loads it from /api/me and provides it. Pages read it with useUser().

import { createContext, useContext } from 'react';
import { LANGUAGES } from './data/catalog.js';

const LANG_KEY = 'otonari-lang';

export const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext);
}

// Auto-detect from browser/OS language when no explicit preference is saved.
export function browserLanguage() {
  const code = (navigator.language || 'en').toLowerCase();
  if (code.startsWith('ja')) return 'ja';
  if (code.startsWith('bn')) return 'bn';
  return 'en';
}

export function getSavedLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && LANGUAGES.includes(saved)) return saved;
  } catch {
    // Ignore storage restriction
  }
  return browserLanguage();
}

export function saveLanguage(code) {
  if (!LANGUAGES.includes(code)) return;
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    // Ignore storage restriction
  }
}
