import { Link, NavLink } from 'react-router-dom';
import { BlockIcon, BuildingIcon, UserIcon } from '../components/Icons.tsx';
import { useMember } from '../core/UserContext.ts';
import Banner from '../features/message/Banner.tsx';
import NotificationBell from '../features/message/NotificationBell.tsx';
import { displayName, t } from '../i18n/index.ts';
import { NAV_TABS } from './navTabs.ts';

// The top of every page: app and neighborhood name, the tabs (wide screens), my name, the notification
// bell, and below it the banner for a new message.
export default function Header() {
  const { user, group, lang, inbox } = useMember();
  const GroupIcon = group.type === 'block' ? BlockIcon : BuildingIcon;

  return (
    <div className="banner-area">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="header-brand">
            <span className="header-logo">{t(lang, 'appName')}</span>
            <span className="header-group">
              <GroupIcon className="icon-xs" />
              <span className="header-group-name">{group.name}</span>
            </span>
          </Link>

          <nav className="desktop-nav" aria-label={t(lang, 'appName')}>
            {NAV_TABS.map(({ to, Icon, label }) => (
              <NavLink key={to} to={to} className="desktop-nav-link">
                <Icon className="icon-sm" />
                <span>{t(lang, label)}</span>
                {to === '/loans' && inbox.length > 0 && <span className="count-badge">{inbox.length}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="header-right">
            <Link to="/settings" className="header-user-pill" title={t(lang, 'nav.settings')}>
              <UserIcon className="icon-sm" />
              <span>{displayName(lang, user.nickname)}</span>
            </Link>
            <NotificationBell />
          </div>
        </div>
      </header>
      <Banner />
    </div>
  );
}
