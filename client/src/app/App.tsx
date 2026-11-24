import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { CatalogItemRecord, GroupAdminDashboard, Lang, Login as LoginAnswer, Me } from '../../../shared/types.ts';
import { api, clearToken, errorStatus, getToken, saveToken } from '../core/api.ts';
import { syncDynamicCatalog } from '../data/catalog.ts';
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
import GroupAdminPage from '../features/groupAdmin/GroupAdminPage.tsx';
import PendingApproval from '../features/groupAdmin/PendingApproval.tsx';

// Lazy-loaded so resident PWAs never download the desktop Super Admin console bundle.
const SuperAdminApp = lazy(() => import('../features/superAdmin/SuperAdminApp.tsx'));

export default function App() {
  const [me, setMe] = useState<Me | null>(null); // { user, group } of the logged-in neighbor
  const [visitorLang, setVisitorLangState] = useState(visitorLanguage);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const [adminAlertCount, setAdminAlertCount] = useState(0);
  const { inbox, refreshInbox, markRead, clearInbox } = useInbox(); // unread messages to me
  const { pathname } = useLocation();
  const isSuperAdminRoute = pathname.startsWith('/super-admin');

  // Sync active catalog items from PostgreSQL (non-blocking; static ITEMS provide instant first paint).
  useEffect(() => {
    api
      .get<CatalogItemRecord[]>('/catalog')
      .then(syncDynamicCatalog)
      .catch(() => {});
  }, []);

  // On start: if we have a token, ask the server who we are.
  useEffect(() => {
    if (isSuperAdminRoute || !getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<Me>('/me')
      .then(setMe)
      .catch((error) => {
        // 401 = the server doesn't know this token. api.ts already forgot it → join screen.
        if (errorStatus(error) !== 401) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, [isSuperAdminRoute]);

  const isGroupAdmin = Boolean(
    me &&
      me.user.member_status === 'active' &&
      (me.user.group_role === 'group_admin' || me.user.group_role === 'co_admin')
  );

  useEffect(() => {
    if (!isGroupAdmin) {
      setAdminAlertCount(0);
      return;
    }
    api
      .get<GroupAdminDashboard>('/group-admin/dashboard')
      .then((d) => setAdminAlertCount(d.pending_count + d.overdue_loan_count + d.flagged_loan_count))
      .catch(() => {});
  }, [isGroupAdmin, pathname]);

  const lang = me ? me.user.lang : visitorLang;

  // Elder mode is a class on <body>; styles/elder.css uses it to make everything bigger.
  // <html lang> helps screen readers, and makes browsers pick Japanese fonts for Japanese.
  useEffect(() => {
    if (!isSuperAdminRoute) {
      document.body.classList.toggle('elder', Boolean(me?.user.elder_mode));
    }
    document.documentElement.lang = lang === 'ja-easy' ? 'ja' : lang;
  }, [me, lang, isSuperAdminRoute]);

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
    setAdminAlertCount(0);
    setMe(null);
  }

  const isPendingMember = Boolean(me && me.user.member_status === 'pending');

  if (isSuperAdminRoute) {
    return (
      <Suspense fallback={<p className="narrow-page">{t(lang, 'common.loading')}</p>}>
        <SuperAdminApp />
      </Suspense>
    );
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
        <Route path="/join" element={<Join />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const showNav = Boolean(me && !isPendingMember && pathname !== '/join');
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
        {showNav && <Header adminAlertCount={adminAlertCount} />}
        {!me && pathname !== '/poster' && <PublicHeader />}
        <main className="page">{page}</main>
        {showNav && me && (
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
