import { Link, useLocation } from 'react-router-dom';
import Avatar from '../components/Avatar.tsx';
import ThemeToggle from '../components/ThemeToggle.tsx';
import { useUser } from '../core/UserContext.ts';
import { t } from '../i18n/index.ts';

// The top of the pages for people who are logged in, but in no neighborhood.
export default function AccountHeader() {
  const { user, lang, logout } = useUser();
  const { pathname } = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <header className={isSuperAdmin ? 'app-header public-header many-links' : 'app-header public-header'}>
      <div className="app-header-inner">
        <Link to="/" className="header-brand">
          <span className="header-logo">{t(lang, 'appName')}</span>
        </Link>
        <div className="header-right">
          {isSuperAdmin && (
            <>
              <Link to="/admin" className="text-button button-link">
                {t(lang, 'admin.title')}
              </Link>
              {pathname !== '/join' && (
                <Link to="/join" className="text-button button-link">
                  {t(lang, 'join.button')}
                </Link>
              )}
            </>
          )}
          <ThemeToggle />
          <Link to="/profile" aria-label={t(lang, 'profile.title')} title={t(lang, 'profile.title')} className="account-avatar">
            <Avatar url={user?.avatar ?? null} />
          </Link>
          <button type="button" className="button-secondary" onClick={logout}>
            {t(lang, 'auth.logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
