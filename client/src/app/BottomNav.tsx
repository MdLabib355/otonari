import { NavLink } from 'react-router-dom';
import type { Lang } from '../../../shared/types.ts';
import { t } from '../i18n/index.ts';
import { NAV_TABS } from './navTabs.ts';

// On phones only: wide screens have the same tabs in the header.
export default function BottomNav({ lang, unreadCount }: { lang: Lang; unreadCount: number }) {
  return (
    <nav className="bottom-nav" aria-label={t(lang, 'appName')}>
      {NAV_TABS.map(({ to, Icon, label }) => (
        <NavLink key={to} to={to}>
          <Icon className="nav-icon" />
          <span>{t(lang, label)}</span>
          {to === '/loans' && unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
