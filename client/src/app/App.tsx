import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Lang, Login, Me } from '../../../shared/types.ts';
import { api, clearToken, errorStatus, getToken, saveToken } from '../core/api.ts';
import { t } from '../i18n/index.ts';
import { useInbox } from '../core/useInbox.ts';
import BottomNav from './BottomNav.tsx';
import AccountHeader from './AccountHeader.tsx';
import Header from './Header.tsx';
import PublicHeader from './PublicHeader.tsx';
import { UserContext, saveVisitorLanguage, visitorLanguage, type SharedValues } from '../core/UserContext.ts';
import Landing from '../features/landing/Landing.tsx';
import AuthPage from '../features/auth/AuthPage.tsx';
import GroupAdmin from '../features/admin/GroupAdmin.tsx';
import SuperAdmin from '../features/admin/SuperAdmin.tsx';
import Join from '../features/group/Join.tsx';
import Shelf from '../features/item/Shelf.tsx';
import ItemPage from '../features/item/ItemPage.tsx';
import MyItems from '../features/item/MyItems.tsx';
import Loans from '../features/loan/Loans.tsx';
import LoanPage from '../features/loan/LoanPage.tsx';
import Settings from '../features/user/Settings.tsx';
import Poster from '../features/group/Poster.tsx';

export default function App() {
  const [me, setMe] = useState<Me | null>(null); // { user, group } of whoever is logged in
  const [visitorLang, setVisitorLangState] = useState(visitorLanguage);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const { inbox, refreshInbox, markRead, clearInbox } = useInbox(); // unread messages to me
  const { pathname, search } = useLocation();

  // On start: if we have a token, ask the server who we are.
  useEffect(() => {
    if (!getToken()) return;
    api
      .get<Me>('/me')
      .then(setMe)
      .catch((error) => {
        // 401 = the server doesn't know this token. api.ts already forgot it.
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

  // Remember the token and who we are.
  function login({ token, user, group }: Login) {
    saveToken(token);
    clearInbox();
    setMe({ user, group });
  }

  function setVisitorLang(code: Lang) {
    saveVisitorLanguage(code);
    setVisitorLangState(code);
  }

  function logout() {
    if (getToken()) api.delete('/auth/session').catch(() => {}); // the request already has the token
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
    page = (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        {/* From the QR code on a poster: log in first. The ?code= stays in the address. */}
        <Route path="/join" element={<Navigate to={{ pathname: '/register', search }} replace />} />
        <Route path="/poster" element={<Poster />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  } else if (!me.group) {
    // Logged in, but in no neighborhood yet. (After logging in, the address may still be /login?code=...)
    const isAdmin = me.user.role === 'super_admin';
    page = (
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/admin" element={<SuperAdmin />} />
        <Route path="/poster" element={<Poster />} />
        <Route
          path="*"
          element={<Navigate to={isAdmin && !search ? '/admin' : { pathname: '/join', search }} replace />}
        />
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
        <Route path="/group-admin" element={<GroupAdmin />} />
        <Route path="/admin" element={<SuperAdmin />} />
        <Route path="/poster" element={<Poster />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const isMember = Boolean(me?.group);
  const shared: SharedValues = {
    user: me?.user,
    group: me?.group ?? undefined,
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
        {isMember && <Header />}
        {me && !isMember && <AccountHeader />}
        {!me && !loading && pathname !== '/poster' && <PublicHeader />}
        <main className="page">{page}</main>
        {isMember && <BottomNav lang={lang} unreadCount={inbox.length} />}
      </div>
    </UserContext.Provider>
  );
}
