import { Link } from 'react-router-dom';
import { useUser } from '../core/UserContext.ts';
import { t } from '../i18n/index.ts';

// The top of the pages for people who are logged in, but in no neighborhood.
export default function AccountHeader() {
  const { user, lang, logout } = useUser();

  return (
    <header className="app-header public-header">
      <div className="app-header-inner">
        <Link to="/" className="header-brand">
          <span className="header-logo">{t(lang, 'appName')}</span>
        </Link>
        <div className="header-right">
          {user?.role === 'super_admin' && (
            <>
              <Link to="/admin" className="text-button button-link">
                {t(lang, 'admin.title')}
              </Link>
              <Link to="/join" className="text-button button-link">
                {t(lang, 'join.button')}
              </Link>
            </>
          )}
          <button type="button" className="button-secondary" onClick={logout}>
            {t(lang, 'auth.logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
