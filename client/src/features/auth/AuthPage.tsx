import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AuthConfig, Login } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import CodeForm from './CodeForm.tsx';
import GoogleButton from './GoogleButton.tsx';
import PasswordForm from './PasswordForm.tsx';

type Way = 'password' | 'code';

// Log in (/login) and Register (/register): with a password, with a code by email, or with Google.
// Somebody who scanned a poster (?code=...) goes on to its group afterwards, see App.tsx.
export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { lang, login } = useUser();
  const { search } = useLocation(); // keeps ?code=... when switching between the two pages
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [way, setWay] = useState<Way>('password');

  useEffect(() => {
    api
      .get<AuthConfig>('/auth/config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const ways: { value: Way; label: string }[] = [
    { value: 'password', label: t(lang, 'auth.wayPassword') },
    { value: 'code', label: t(lang, 'auth.wayCode') },
  ];

  return (
    <section className="narrow-page surface-card">
      <h1>{t(lang, mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}</h1>
      {search.includes('code=') && <p className="notice">{t(lang, 'auth.thenJoin')}</p>}

      {config?.google_client_id && (
        <GoogleButton clientId={config.google_client_id} onLogin={(answer: Login) => login(answer)} />
      )}

      {config?.email_code && (
        <div className="field">
          <ChipGroup label={t(lang, 'auth.wayLabel')} options={ways} value={way} onChange={setWay} />
        </div>
      )}
      {way === 'password' ? (
        <PasswordForm key={mode} mode={mode} onLogin={(answer: Login) => login(answer)} />
      ) : (
        <CodeForm onLogin={(answer: Login) => login(answer)} />
      )}

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
