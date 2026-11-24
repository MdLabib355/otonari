import { Link } from 'react-router-dom';
import type { Lang } from '../../../shared/types.ts';
import { useUser } from '../core/UserContext.ts';
import { LANGUAGES } from '../data/catalog.ts';
import { meta, t } from '../i18n/index.ts';

// The top of the pages for people who haven't joined yet: language, Log in, Register.
export default function PublicHeader() {
  const { lang, setVisitorLang } = useUser();

  return (
    <header className="app-header public-header">
      <div className="app-header-inner">
        <Link to="/" className="header-brand">
          <span className="header-logo">{t(lang, 'appName')}</span>
        </Link>
        <div className="header-right">
          <select
            className="language-select"
            aria-label={t(lang, 'settings.language')}
            value={lang}
            onChange={(event) => setVisitorLang(event.target.value as Lang)}
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {meta(code).name}
              </option>
            ))}
          </select>
          <Link to="/login" className="public-link">
            {t(lang, 'auth.login')}
          </Link>
          <Link to="/register" className="public-link public-link-primary">
            {t(lang, 'auth.register')}
          </Link>
        </div>
      </div>
    </header>
  );
}
