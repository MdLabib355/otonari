import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, clearToken, getToken, openEventStream, saveToken } from './api.js';
import { formatNumber, t } from './i18n/index.js';
import { useInbox } from './useInbox.js';
import { UserContext, getSavedLanguage, saveLanguage } from './UserContext.js';
import Banner from './components/Banner.jsx';
import { BoxIcon, LoansIcon, SettingsIcon, ShelfIcon } from './components/Icons.jsx';
import Join from './pages/Join.jsx';
import Shelf from './pages/Shelf.jsx';
import ItemPage from './pages/ItemPage.jsx';
import MyItems from './pages/MyItems.jsx';
import Loans from './pages/Loans.jsx';
import LoanPage from './pages/LoanPage.jsx';
import Settings from './pages/Settings.jsx';
import Poster from './pages/Poster.jsx';
import Manager from './pages/Manager.jsx';

export const NAV_TABS = [
  { to: '/', Icon: ShelfIcon, label: 'nav.shelf', end: true },
  { to: '/my-items', Icon: BoxIcon, label: 'nav.myItems' },
  { to: '/loans', Icon: LoansIcon, label: 'nav.loans' },
  { to: '/settings', Icon: SettingsIcon, label: 'nav.settings' },
];

function BottomNav({ lang, unreadCount }) {
  return (
    <nav className="bottom-nav" aria-label={t(lang, 'appName')}>
      {NAV_TABS.map(({ to, Icon, label, end }) => (
        <NavLink key={to} to={to} end={end}>
          <Icon className="nav-icon" />
          <span>{t(lang, label)}</span>
          {to === '/loans' && unreadCount > 0 && <span className="count-badge">{formatNumber(lang, unreadCount)}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

// Live waiting screen when a building has require_approval=true; unlocks automatically via SSE on approval.
function PendingApproval({ me, lang, onUpdated, onLeave }) {
  const isRejected = me.user.status === 'rejected';

  useEffect(() => {
    if (isRejected) return;
    let active = true;
    const controller = new AbortController();

    async function listen() {
      try {
        await openEventStream({
          signal: controller.signal,
          onEvent: (evt) => {
            if (evt.type === 'status') {
              api.get('/api/me').then(onUpdated).catch(() => {});
            }
          },
          onRevoked: onLeave,
        });
      } catch {
        // Fallback poll handles reconnects
      }
    }
    listen();

    const timer = setInterval(() => {
      if (active) api.get('/api/me').then(onUpdated).catch(() => {});
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }, [isRejected]);

  async function cancelAndLeave() {
    try {
      await api.post('/api/leave');
    } catch {
      // Ignore if already revoked
    }
    onLeave();
  }

  return (
    <section className="narrow-page surface-card">
      <h1>{t(lang, 'pending.title')}</h1>
      <p className={isRejected ? 'error' : 'notice'}>
        {isRejected ? t(lang, 'pending.rejected') : t(lang, 'pending.body', { group: me.group.name })}
      </p>
      <div className="actions">
        <button type="button" className="button-secondary" onClick={cancelAndLeave}>
          {t(lang, 'settings.leave')}
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [me, setMeState] = useState(null);
  const [deviceLang, setDeviceLangState] = useState(() => getSavedLanguage());
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const { inbox, dueLoans, refreshInbox, markRead, markAllRead, clearInbox } = useInbox();
  const { pathname } = useLocation();

  function setDeviceLang(code) {
    saveLanguage(code);
    setDeviceLangState(code);
  }

  function setMe(next) {
    setMeState(next);
    if (next?.user?.lang) {
      saveLanguage(next.user.lang);
      setDeviceLangState(next.user.lang);
    }
  }

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/api/me')
      .then(setMeState)
      .catch((error) => {
        if (error.status !== 401) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const isPublicRoute = pathname === '/join' || pathname === '/poster' || pathname === '/manager';
  const lang = pathname === '/poster' ? (me?.user.lang ?? deviceLang) : !isPublicRoute && me ? me.user.lang : deviceLang;

  useEffect(() => {
    document.body.classList.toggle('elder', Boolean(!isPublicRoute && me?.user.elder_mode));
    document.documentElement.lang = lang === 'ja-easy' ? 'ja' : lang;
  }, [me, lang, isPublicRoute]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  function login({ token, user, group }) {
    saveToken(token);
    clearInbox();
    setMeState({ user, group });
  }

  function logout() {
    clearToken();
    clearInbox();
    setMeState(null);
  }

  const isApproved = me?.user?.status === 'approved';

  let page;
  if (loading && !isPublicRoute) {
    page = <p className="narrow-page">{t(lang, 'common.loading')}</p>;
  } else if (loadFailed && !isPublicRoute) {
    page = <p className="error narrow-page">{t(lang, 'common.error')}</p>;
  } else if (!me && !isPublicRoute) {
    page = <Navigate to="/join" replace />;
  } else if (me && !isApproved && !isPublicRoute) {
    page = <PendingApproval me={me} lang={lang} onUpdated={setMe} onLeave={logout} />;
  } else {
    page = (
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/" element={<Shelf />} />
        <Route path="/item/:id" element={<ItemPage />} />
        <Route path="/my-items" element={<MyItems />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/loan/:id" element={<LoanPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/poster" element={<Poster />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const showNav = Boolean(me && isApproved && !isPublicRoute);
  const shared = {
    user: me?.user,
    group: me?.group,
    lang,
    deviceLang,
    setDeviceLang,
    login,
    logout,
    setMe,
    inbox,
    dueLoans,
    refreshInbox,
    markRead,
    markAllRead,
  };

  return (
    <UserContext.Provider value={shared}>
      <div className="app-shell">
        {showNav && <Banner key={me.user.id} tabs={NAV_TABS} />}
        <main className="page">{page}</main>
        {showNav && <BottomNav lang={lang} unreadCount={inbox.length} />}
      </div>
    </UserContext.Provider>
  );
}
