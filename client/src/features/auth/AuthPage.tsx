import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AuthConfig } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import GoogleButton from './GoogleButton.tsx';
import LoginForm from './LoginForm.tsx';
import RegisterForm from './RegisterForm.tsx';

type Mode = 'login' | 'register' | 'reset';

const TITLES: Record<Mode, UiKey> = {
  login: 'auth.loginTitle',
  register: 'auth.registerTitle',
  reset: 'auth.resetTitle',
};

// Log in (/login) and Register (/register): with Google, or with an email address. And "Forgot password?"
// (/forgot-password), only with an email address.
// Somebody who scanned a poster (?code=...) goes on to its group afterwards, see App.tsx.
export default function AuthPage({ mode }: { mode: Mode }) {
  const { lang, login } = useUser();
  const { search } = useLocation(); // keeps ?code=... when switching between the two pages
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [withEmail, setWithEmail] = useState(false);
  const [codeStep, setCodeStep] = useState(false); // while a code is entered, nothing else is on the page

  useEffect(() => {
    api
      .get<AuthConfig>('/auth/config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  useEffect(() => {
    setWithEmail(false);
    setCodeStep(false);
  }, [mode]);

  // Without Google there is nothing to choose.
  const google = mode === 'reset' ? null : config?.google_client_id;
  const showForm = withEmail || (config !== null && !google);

  return (
    <section className="narrow-page surface-card">
      {!codeStep && <h1>{t(lang, TITLES[mode])}</h1>}
      {!codeStep && search.includes('code=') && <p className="notice">{t(lang, 'auth.thenJoin')}</p>}

      {!codeStep && google && <GoogleButton clientId={google} onLogin={login} />}
      {config && !showForm && (
        <button type="button" className="button-primary" onClick={() => setWithEmail(true)}>
          {t(lang, 'auth.continueEmail')}
        </button>
      )}
      {config && showForm && mode === 'login' && (
        <LoginForm config={config} onLogin={login} onCodeStep={setCodeStep} />
      )}
      {config && showForm && mode !== 'login' && (
        <RegisterForm key={mode} purpose={mode} config={config} onLogin={login} onCodeStep={setCodeStep} />
      )}

      {!codeStep && (
        <p className="auth-switch">
          {t(lang, mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
          <Link to={{ pathname: mode === 'login' ? '/register' : '/login', search }} className="back-link">
            {t(lang, mode === 'login' ? 'auth.register' : 'auth.login')}
          </Link>
        </p>
      )}
      {!codeStep && config?.demo_mode && mode === 'login' && (
        <p className="hint">
          {t(lang, 'auth.demoHint')} sato@otonari.example · tanaka@otonari.example · maria@otonari.example ·
          ayesha@otonari.example — otonari2611
        </p>
      )}
    </section>
  );
}
