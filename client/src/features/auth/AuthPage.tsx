import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AuthConfig } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import GoogleButton from './GoogleButton.tsx';
import LoginForm from './LoginForm.tsx';
import RegisterForm from './RegisterForm.tsx';

// Log in (/login) and Register (/register): with Google, or with an email address.
// Somebody who scanned a poster (?code=...) goes on to its group afterwards, see App.tsx.
export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { lang, login } = useUser();
  const { search } = useLocation(); // keeps ?code=... when switching between the two pages
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [withEmail, setWithEmail] = useState(false);

  useEffect(() => {
    api
      .get<AuthConfig>('/auth/config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  useEffect(() => setWithEmail(false), [mode]);

  // Without Google there is nothing to choose.
  const showForm = withEmail || (config !== null && !config.google_client_id);

  return (
    <section className="narrow-page surface-card">
      <h1>{t(lang, mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}</h1>
      {search.includes('code=') && <p className="notice">{t(lang, 'auth.thenJoin')}</p>}

      {config?.google_client_id && <GoogleButton clientId={config.google_client_id} onLogin={login} />}
      {config && !showForm && (
        <button type="button" className="button-primary" onClick={() => setWithEmail(true)}>
          {t(lang, 'auth.continueEmail')}
        </button>
      )}
      {config && showForm && mode === 'login' && <LoginForm config={config} onLogin={login} />}
      {config && showForm && mode === 'register' && <RegisterForm config={config} onLogin={login} />}

      <p className="auth-switch">
        {t(lang, mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
        <Link to={{ pathname: mode === 'login' ? '/register' : '/login', search }} className="back-link">
          {t(lang, mode === 'login' ? 'auth.register' : 'auth.login')}
        </Link>
      </p>
      {config?.demo_mode && mode === 'login' && (
        <p className="hint">
          {t(lang, 'auth.demoHint')} sato@otonari.example · tanaka@otonari.example · maria@otonari.example ·
          ayesha@otonari.example — otonari2611
        </p>
      )}
    </section>
  );
}
