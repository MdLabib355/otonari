import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, clearToken, getToken, openEventStream, saveToken } from './api.js';
import { formatNumber, t } from './i18n/index.js';
import { useInbox } from './useInbox.js';
import { UserContext, browserLanguage } from './UserContext.js';
import Banner from './components/Banner.jsx';
import Join from './pages/Join.jsx';
import Shelf from './pages/Shelf.jsx';
import ItemPage from './pages/ItemPage.jsx';
import MyItems from './pages/MyItems.jsx';
import Loans from './pages/Loans.jsx';
import LoanPage from './pages/LoanPage.jsx';
import Settings from './pages/Settings.jsx';
import Poster from './pages/Poster.jsx';
import Manager from './pages/Manager.jsx';

const TABS = [
  { to: '/', icon: '🏘️', label: 'nav.shelf' },
  { to: '/my-items', icon: '📦', label: 'nav.myItems' },
  { to: '/loans', icon: '🤝', label: 'nav.loans' },
  { to: '/settings', icon: '⚙️', label: 'nav.settings' },
];

function BottomNav({ lang, unreadCount }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to}>
          <span className="nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          {t(lang, tab.label)}
          {tab.to === '/loans' && unreadCount > 0 && <span className="count-badge">{formatNumber(lang, unreadCount)}</span>}
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
    <section>
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
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const { inbox, dueLoans, refreshInbox, markRead, markAllRead, clearInbox } = useInbox();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/api/me')
      .then(setMe)
      .catch((error) => {
        if (error.status !== 401) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const lang = me ? me.user.lang : browserLanguage();

  useEffect(() => {
    document.body.classList.toggle('elder', Boolean(me?.user.elder_mode));
    document.documentElement.lang = lang === 'ja-easy' ? 'ja' : lang;
  }, [me, lang]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  function login({ token, user, group }) {
    saveToken(token);
    clearInbox();
    setMe({ user, group });
  }

  function logout() {
    clearToken();
    clearInbox();
    setMe(null);
  }

  const isPublicRoute = pathname === '/join' || pathname === '/poster' || pathname === '/manager';
  const isApproved = me?.user?.status === 'approved';

  let page;
  if (loading && !isPublicRoute) {
    page = <p>{t(lang, 'common.loading')}</p>;
  } else if (loadFailed && !isPublicRoute) {
    page = <p className="error">{t(lang, 'common.error')}</p>;
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
      <div className="app">
        {showNav && <Banner />}
        <main className="page">{page}</main>
        {showNav && <BottomNav lang={lang} unreadCount={inbox.length} />}
      </div>
    </UserContext.Provider>
  );
}
