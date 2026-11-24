import { NavLink } from 'react-router-dom';
import type { Lang } from '../../../shared/types.ts';
import { t, type UiKey } from '../i18n/index.ts';

// The four tabs of the bottom navigation. Emoji icons help people who can't read the label.
const TABS: { to: string; icon: string; label: UiKey }[] = [
  { to: '/', icon: '🏘️', label: 'nav.shelf' },
  { to: '/my-items', icon: '📦', label: 'nav.myItems' },
  { to: '/loans', icon: '🤝', label: 'nav.loans' },
  { to: '/settings', icon: '⚙️', label: 'nav.settings' },
];

export default function BottomNav({ lang, unreadCount }: { lang: Lang; unreadCount: number }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to}>
          <span className="nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          {t(lang, tab.label)}
          {tab.to === '/loans' && unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
