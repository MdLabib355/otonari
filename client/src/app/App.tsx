import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { CatalogItemRecord, GroupAdminDashboard, Lang, Login, Me } from '../../../shared/types.ts';
import { api, clearToken, errorStatus, getToken, saveToken } from '../core/api.ts';
import { UserContext, saveVisitorLanguage, visitorLanguage, type SharedValues } from '../core/UserContext.ts';
import { useInbox } from '../core/useInbox.ts';
import { syncDynamicCatalog } from '../data/catalog.ts';
import AuthPage from '../features/auth/AuthPage.tsx';
import Join from '../features/group/Join.tsx';
import Poster from '../features/group/Poster.tsx';
import GroupAdminPage from '../features/groupAdmin/GroupAdminPage.tsx';
import PendingApproval from '../features/groupAdmin/PendingApproval.tsx';
import ItemPage from '../features/item/ItemPage.tsx';
import MyItems from '../features/item/MyItems.tsx';
import Shelf from '../features/item/Shelf.tsx';
import Landing from '../features/landing/Landing.tsx';
import LoanPage from '../features/loan/LoanPage.tsx';
import Loans from '../features/loan/Loans.tsx';
import Settings from '../features/user/Settings.tsx';
import { t } from '../i18n/index.ts';
import AccountHeader from './AccountHeader.tsx';
import BottomNav from './BottomNav.tsx';
import Header from './Header.tsx';
import PublicHeader from './PublicHeader.tsx';

// Lazy-loaded so resident PWAs never download the desktop Super Admin console bundle.
const SuperAdminApp = lazy(() => import('../features/superAdmin/SuperAdminApp.tsx'));

export default function App() {
  const [me, setMe] = useState<Me | null>(null); // { user, group } of whoever is logged in
  const [visitorLang, setVisitorLangState] = useState(visitorLanguage);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const [adminAlertCount, setAdminAlertCount] = useState(0);
  const { inbox, refreshInbox, markRead, clearInbox } = useInbox(); // unread messages to me
  const { pathname, search } = useLocation();

  const isSuperAdminRoute = pathname === '/admin' || pathname.startsWith('/super-admin');

  // Sync active catalog items from PostgreSQL (non-blocking; static ITEMS provide instant first paint).
  useEffect(() => {
    api
      .get<CatalogItemRecord[]>('/catalog')
      .then(syncDynamicCatalog)
      .catch(() => {});
  }, []);

  // On start: if we have a token, ask the server who we are.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<Me>('/me')
      .then(setMe)
      .catch((error) => {
        // 401 = the server doesn't know this token. api.ts already forgot it.
        if (errorStatus(error) !== 401) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const isGroupAdmin = Boolean(
    me &&
      me.group &&
      me.user.member_status === 'active' &&
      me.user.role !== 'user'
  );

  useEffect(() => {
    if (!isGroupAdmin || isSuperAdminRoute) {
      setAdminAlertCount(0);
      return;
    }
    api
      .get<GroupAdminDashboard>('/group-admin/dashboard')
      .then((d) => setAdminAlertCount(d.pending_count + d.overdue_loan_count + d.flagged_loan_count))
      .catch(() => {});
  }, [isGroupAdmin, isSuperAdminRoute, pathname]);

  const lang = me ? me.user.lang : visitorLang;

  // Elder mode is a class on <body>; styles/elder.css uses it to make everything bigger.
  // <html lang> helps screen readers, and makes browsers pick Japanese fonts for Japanese.
  useEffect(() => {
    document.body.classList.toggle('elder', !isSuperAdminRoute && Boolean(me?.user.elder_mode));
    document.documentElement.lang = lang === 'ja-easy' ? 'ja' : lang;
  }, [me, lang, isSuperAdminRoute]);

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

  // A real page load at the end: the app starts again at the landing page, with nothing left of this person.
  async function logout() {
    if (getToken()) await api.delete('/auth/session').catch(() => {}); // e.g. offline: forget the token anyway
    clearToken();
    clearInbox();
    window.location.assign('/');
  }

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

  if (isSuperAdminRoute) {
    return (
      <UserContext.Provider value={shared}>
        {loading ? (
          <p className="narrow-page">{t(lang, 'common.loading')}</p>
        ) : loadFailed ? (
          <p className="error narrow-page">{t(lang, 'common.error')}</p>
        ) : (
          <Suspense fallback={<p className="narrow-page">{t(lang, 'common.loading')}</p>}>
            <SuperAdminApp />
          </Suspense>
        )}
      </UserContext.Provider>
    );
  }

  const isPendingMember = Boolean(me && me.group && me.user.member_status === 'pending');

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
    const isSuperAdmin = me.user.role === 'super_admin';
    page = (
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/poster" element={<Poster />} />
        <Route
          path="*"
          element={<Navigate to={isSuperAdmin && !search ? '/admin' : { pathname: '/join', search }} replace />}
        />
      </Routes>
    );
  } else if (isPendingMember) {
    page = <PendingApproval />;
  } else {
    page = (
      <Routes>
        <Route path="/" element={<Shelf />} />
        <Route path="/item/:id" element={<ItemPage />} />
        <Route path="/my-items" element={<MyItems />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/loan/:id" element={<LoanPage />} />
        <Route path="/group-admin" element={<GroupAdminPage onAlertCountChange={setAdminAlertCount} />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/poster" element={<Poster />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const isActiveMember = Boolean(me?.group && !isPendingMember);

  return (
    <UserContext.Provider value={shared}>
      <div className="app-shell">
        {isActiveMember && <Header adminAlertCount={adminAlertCount} />}
        {me && !isActiveMember && <AccountHeader />}
        {!me && !loading && pathname !== '/poster' && <PublicHeader />}
        <main className="page">{page}</main>
        {isActiveMember && me && (
          <BottomNav
            lang={lang}
            user={me.user}
            unreadCount={inbox.length}
            adminAlertCount={adminAlertCount}
          />
        )}
      </div>
    </UserContext.Provider>
  );
}
