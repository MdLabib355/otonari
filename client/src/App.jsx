import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { t } from './i18n/index.js';
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

function BottomNav({ lang }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to}>
          <span className="nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          {t(lang, tab.label)}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  // Fixed for now. Step 2 replaces this with the logged-in user's language (from /api/me).
  const lang = 'en';

  // On the join screen you are not a member yet, so the tabs would lead nowhere.
  const { pathname } = useLocation();
  const showNav = pathname !== '/join';

  return (
    <div className="app">
      <main className="page">
        <Routes>
          <Route path="/join" element={<Join lang={lang} />} />
          <Route path="/" element={<Shelf lang={lang} />} />
          <Route path="/item/:id" element={<ItemPage lang={lang} />} />
          <Route path="/my-items" element={<MyItems lang={lang} />} />
          <Route path="/loans" element={<Loans lang={lang} />} />
          <Route path="/loan/:id" element={<LoanPage lang={lang} />} />
          <Route path="/settings" element={<Settings lang={lang} />} />
          <Route path="/poster" element={<Poster lang={lang} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showNav && <BottomNav lang={lang} />}
    </div>
  );
}
