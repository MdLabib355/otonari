import { useState, type FormEvent } from 'react';
import type { Login } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';

const MIN_PASSWORD = 8;

interface Props {
  mode: 'login' | 'register';
  onLogin: (answer: Login) => void;
}

export default function PasswordForm({ mode, onLogin }: Props) {
  const { lang } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = mode === 'register';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onLogin(await api.post<Login>(`/auth/${mode}`, { email, password, lang }));
    } catch (error) {
      setProblem(authError(error, 'auth.wrongPassword'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="label" htmlFor="auth-email">
          {t(lang, 'auth.email')}
        </label>
        <input
          id="auth-email"
          type="email"
          className="text-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="auth-password">
          {t(lang, 'auth.password')}
        </label>
        <input
          id="auth-password"
          type="password"
          className="text-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          minLength={isNew ? MIN_PASSWORD : undefined}
          maxLength={128}
          required
        />
        {isNew && <p className="hint">{t(lang, 'auth.passwordHint', { n: MIN_PASSWORD })}</p>}
      </div>
      {problem && <p className="error">{t(lang, problem)}</p>}
      <button type="submit" className="button-primary" disabled={busy}>
        {t(lang, isNew ? 'auth.register' : 'auth.login')}
      </button>
    </form>
  );
}
