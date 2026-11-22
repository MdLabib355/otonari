// The logged-in neighbor, shared with every page.
// App.jsx loads it from /api/me and provides it. Pages read it with useUser():
//
//    const { user, group, lang, login, logout, setMe } = useUser();
//
//  user    { id, group_id, nickname, lang, elder_mode }   (undefined before joining)
//  group   { id, code, name, type, city }                 (undefined before joining)
//  lang    the language to show the app in
//  login   call with the { token, user, group } from /api/join or the demo login
//  logout  forget the token (back to the join screen)
//  setMe   call with the { user, group } from PATCH /api/me to update the whole app at once
//
// (This lives in its own file so pages don't have to import App.jsx, which imports them.)

import { createContext, useContext } from 'react';

export const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext);
}

// Before someone joins we don't know their language, so start with the browser's.
export function browserLanguage() {
  const code = (navigator.language || 'en').toLowerCase();
  if (code.startsWith('ja')) return 'ja';
  if (code.startsWith('bn')) return 'bn';
  return 'en';
}
