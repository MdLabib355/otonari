// The logged-in neighbor, shared with every page.
// App.tsx loads it from /api/v1/me and provides it. Pages read it with useUser():
//
//    const { user, group, lang, login, logout, setMe } = useUser();
//    const { user, group } = useMember();   on pages that only members can open: never undefined
//
//  user    { id, group_id, nickname, lang, elder_mode }   (undefined before joining)
//  group   { id, code, name, type, city }                 (undefined before joining)
//  lang    the language to show the app in
//  login   call with the { token, user, group } from /api/v1/groups/:code/members or the demo login
//  logout  forget the token (back to the join screen)
//  setMe   call with the { user, group } from PATCH /api/v1/me to update the whole app at once
//  inbox, refreshInbox, markRead   my unread messages (see useInbox.ts)
//
// (This lives in its own file so pages don't have to import App.tsx, which imports them.)

import { createContext, useContext } from 'react';
import type { Group, Lang, Login, Me, User } from '../../../shared/types.ts';
import type { Inbox } from './useInbox.ts';

// `user` and `group` are undefined on the pages for people who haven't joined (Join and Poster).
export interface SharedValues extends Pick<Inbox, 'inbox' | 'refreshInbox' | 'markRead'> {
  user: User | undefined;
  group: Group | undefined;
  lang: Lang;
  login: (answer: Login) => void;
  logout: () => void;
  setMe: (me: Me) => void;
}

export const UserContext = createContext<SharedValues | null>(null);

export function useUser(): SharedValues {
  const shared = useContext(UserContext);
  if (!shared) throw new Error('useUser() only works inside App');
  return shared;
}

// For the pages that only members can open (App.tsx sends everyone else to the join page).
export function useMember(): SharedValues & Me {
  const shared = useUser();
  const { user, group } = shared;
  if (!user || !group) throw new Error('This page is only for members');
  return { ...shared, user, group };
}

// Before someone joins we don't know their language, so start with the browser's.
export function browserLanguage(): Lang {
  const code = (navigator.language || 'en').toLowerCase();
  if (code.startsWith('ja')) return 'ja';
  if (code.startsWith('bn')) return 'bn';
  return 'en';
}
