import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, clearToken, getToken, saveToken } from './api.js';
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

// The four tabs of the bottom navigation. Emoji icons help people who can't read the label.
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

export default function App() {
  const [me, setMe] = useState(null); // { user, group } of the logged-in neighbor
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [loadFailed, setLoadFailed] = useState(false);
  const { inbox, refreshInbox, markRead, clearInbox } = useInbox(); // unread messages to me
  const { pathname } = useLocation();

  // On start: if we have a token, ask the server who we are.
  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/api/me')
      .then(setMe)
      .catch((error) => {
        // 401 = the server doesn't know this token. api.js already forgot it → join screen.
        if (error.status !== 401) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Before joining we don't know the user's language yet, so use the browser's.
  const lang = me ? me.user.lang : browserLanguage();

  // Elder mode is a class on <body>; styles.css uses it to make everything bigger.
  // <html lang> helps screen readers, and makes browsers pick Japanese fonts for Japanese.
  useEffect(() => {
    document.body.classList.toggle('elder', Boolean(me?.user.elder_mode));
    document.documentElement.lang = lang === 'ja-easy' ? 'ja' : lang;
  }, [me, lang]);

  // Every page starts at the top. (Otherwise it opens where the previous page was scrolled to.)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // After /api/join or the demo login: remember the token and who we are.
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

  let page;
  if (loading) {
    page = <p>{t(lang, 'common.loading')}</p>;
  } else if (loadFailed) {
    page = <p className="error">{t(lang, 'common.error')}</p>;
  } else if (!me && pathname !== '/join' && pathname !== '/poster') {
    // No token yet (not a member): only the join page, and a poster opened by its code.
    page = <Navigate to="/join" replace />;
  } else {
    page = (
      <Routes>
        <Route path="/join" element={<Join />} />
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

  const showNav = me && pathname !== '/join';
  const shared = { user: me?.user, group: me?.group, lang, login, logout, setMe, inbox, refreshInbox, markRead };

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
