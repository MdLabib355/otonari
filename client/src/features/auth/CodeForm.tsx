import { useState, type FormEvent } from 'react';
import type { Login } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';

// First the email address, then the 6-digit code that was sent to it. Also creates the account.
export default function CodeForm({ onLogin }: { onLogin: (answer: Login) => void }) {
  const { lang } = useUser();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (sent) {
        onLogin(await api.post<Login>('/auth/email-codes/verify', { email, code, lang }));
      } else {
        await api.post('/auth/email-codes', { email, lang });
        setSent(true);
      }
    } catch (error) {
      setProblem(authError(error, 'auth.wrongCode'));
    }
    setBusy(false);
  }

  function startAgain() {
    setSent(false);
    setCode('');
    setProblem(null);
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
          autoComplete="email"
          readOnly={sent}
          required
        />
      </div>
      {sent && (
        <div className="field">
          <p className="notice">{t(lang, 'auth.codeSent')}</p>
          <label className="label" htmlFor="auth-code">
            {t(lang, 'auth.code')}
          </label>
          <input
            id="auth-code"
            className="text-input auth-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            required
          />
        </div>
      )}
      {problem && <p className="error">{t(lang, problem)}</p>}
      <div className="actions">
        <button type="submit" className="button-primary" disabled={busy}>
          {t(lang, sent ? 'auth.login' : 'auth.sendCode')}
        </button>
        {sent && (
          <button type="button" className="button-secondary" onClick={startAgain}>
            {t(lang, 'auth.otherEmail')}
          </button>
        )}
      </div>
    </form>
  );
}
