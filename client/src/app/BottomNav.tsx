import { NavLink } from 'react-router-dom';
import type { Lang, User } from '../../../shared/types.ts';
import { t } from '../i18n/index.ts';
import { navTabsFor } from './navTabs.ts';

// On phones only: wide screens have the same tabs in the header.
export default function BottomNav({
  lang,
  user,
  unreadCount,
  adminAlertCount = 0,
}: {
  lang: Lang;
  user: User;
  unreadCount: number;
  adminAlertCount?: number;
}) {
  const tabs = navTabsFor(user);
  return (
    <nav className="bottom-nav" aria-label={t(lang, 'appName')}>
      {tabs.map(({ to, Icon, label }) => (
        <NavLink key={to} to={to}>
          <Icon className="nav-icon" />
          <span>{t(lang, label)}</span>
          {to === '/loans' && unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
          {to === '/group-admin' && adminAlertCount > 0 && (
            <span className="count-badge">{adminAlertCount}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
