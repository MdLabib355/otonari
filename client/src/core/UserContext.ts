// The logged-in neighbor, shared with every page.
// App.tsx loads it from /api/v1/me and provides it. Pages read it with useUser():
//
//    const { user, group, lang, login, logout, setMe } = useUser();
//    const { user, group } = useMember();   on pages that only members can open: never undefined
//
//  user    my account: { id, group_id, nickname, lang, elder_mode, email, role }   (undefined before logging in)
//  group   { id, code, name, type, city }                                        (undefined before joining one)
//  lang    the language to show the app in
//  inbox, refreshInbox, markRead   my unread messages (see useInbox.ts)
//
// (This lives in its own file so pages don't have to import App.tsx, which imports them.)

import { createContext, useContext } from 'react';
import type { Group, Lang, Login, Me, User } from '../../../shared/types.ts';
import { LANGUAGES } from '../data/catalog.ts';
import type { Inbox } from './useInbox.ts';

// `user` is undefined before logging in, `group` before joining one.
export interface SharedValues extends Pick<Inbox, 'inbox' | 'refreshInbox' | 'markRead'> {
  user: User | undefined;
  group: Group | undefined;
  lang: Lang;
  setVisitorLang: (lang: Lang) => void; // before joining
  login: (answer: Login) => void; // after one of the ways to log in
  logout: () => void;
  setMe: (me: Me) => void; // after a change of me or my group
}

export const UserContext = createContext<SharedValues | null>(null);

export function useUser(): SharedValues {
  const shared = useContext(UserContext);
  if (!shared) throw new Error('useUser() only works inside App');
  return shared;
}

// For the pages that only members can open (App.tsx sends everyone else to the join page).
export function useMember(): SharedValues & { user: User; group: Group } {
  const shared = useUser();
  const { user, group } = shared;
  if (!user || !group) throw new Error('This page is only for members');
  return { ...shared, user, group };
}

const LANG_KEY = 'otonari-lang';

// Before someone joins we don't know their language: the one they picked on this device, or the browser's.
export function visitorLanguage(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  return LANGUAGES.find((lang) => lang === saved) ?? browserLanguage();
}

export function saveVisitorLanguage(lang: Lang) {
  localStorage.setItem(LANG_KEY, lang);
}

function browserLanguage(): Lang {
  const code = (navigator.language || 'en').toLowerCase();
  if (code.startsWith('ja')) return 'ja';
  if (code.startsWith('bn')) return 'bn';
  return 'en';
}
