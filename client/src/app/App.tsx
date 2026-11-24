import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Lang, Login as LoginAnswer, Me } from '../../../shared/types.ts';
import { api, clearToken, errorStatus, getToken, saveToken } from '../core/api.ts';
import { t } from '../i18n/index.ts';
import { useInbox } from '../core/useInbox.ts';
import BottomNav from './BottomNav.tsx';
import Header from './Header.tsx';
import PublicHeader from './PublicHeader.tsx';
import { UserContext, saveVisitorLanguage, visitorLanguage, type SharedValues } from '../core/UserContext.ts';
import Landing from '../features/landing/Landing.tsx';
import Login from '../features/user/Login.tsx';
import Join from '../features/group/Join.tsx';
import Shelf from '../features/item/Shelf.tsx';
import ItemPage from '../features/item/ItemPage.tsx';
import MyItems from '../features/item/MyItems.tsx';
import Loans from '../features/loan/Loans.tsx';
import LoanPage from '../features/loan/LoanPage.tsx';
import Settings from '../features/user/Settings.tsx';
import Poster from '../features/group/Poster.tsx';

export default function App() {
  const [me, setMe] = useState<Me | null>(null); // { user, group } of the logged-in neighbor
  const [visitorLang, setVisitorLangState] = useState(visitorLanguage);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const { inbox, refreshInbox, markRead, clearInbox } = useInbox(); // unread messages to me
  const { pathname } = useLocation();

  // On start: if we have a token, ask the server who we are.
  useEffect(() => {
    if (!getToken()) return;
    api
      .get<Me>('/me')
      .then(setMe)
      .catch((error) => {
        // 401 = the server doesn't know this token. api.ts already forgot it → join screen.
        if (errorStatus(error) !== 401) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const lang = me ? me.user.lang : visitorLang;

  // Elder mode is a class on <body>; styles/elder.css uses it to make everything bigger.
  // <html lang> helps screen readers, and makes browsers pick Japanese fonts for Japanese.
  useEffect(() => {
    document.body.classList.toggle('elder', Boolean(me?.user.elder_mode));
    document.documentElement.lang = lang === 'ja-easy' ? 'ja' : lang;
  }, [me, lang]);

  // Every page starts at the top. (Otherwise it opens where the previous page was scrolled to.)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // After /api/v1/groups/:code/members or the demo login: remember the token and who we are.
  function login({ token, user, group }: LoginAnswer) {
    saveToken(token);
    clearInbox();
    setMe({ user, group });
  }

  function setVisitorLang(code: Lang) {
    saveVisitorLanguage(code);
    setVisitorLangState(code);
  }

  function logout() {
    clearToken();
    clearInbox();
    setMe(null);
  }

  let page;
  if (loading) {
    page = <p className="narrow-page">{t(lang, 'common.loading')}</p>;
  } else if (loadFailed) {
    page = <p className="error narrow-page">{t(lang, 'common.error')}</p>;
  } else if (!me) {
    // Not a member: the pages for visitors, and a poster opened by its code.
    page = (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Join />} />
        <Route path="/join" element={<Join />} />
        <Route path="/poster" element={<Poster />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  } else {
    page = (
      <Routes>
        <Route path="/" element={<Shelf />} />
        <Route path="/item/:id" element={<ItemPage />} />
        <Route path="/my-items" element={<MyItems />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/loan/:id" element={<LoanPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/poster" element={<Poster />} />
        <Route path="/join" element={<Join />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const showNav = me && pathname !== '/join';
  const shared: SharedValues = {
    user: me?.user,
    group: me?.group,
    lang,
    setVisitorLang,
    login,
    logout,
    setMe,
    inbox,
    refreshInbox,
    markRead,
  };

  return (
    <UserContext.Provider value={shared}>
      <div className="app-shell">
        {showNav && <Header />}
        {!me && pathname !== '/poster' && <PublicHeader />}
        <main className="page">{page}</main>
        {showNav && <BottomNav lang={lang} unreadCount={inbox.length} />}
      </div>
    </UserContext.Provider>
  );
}
