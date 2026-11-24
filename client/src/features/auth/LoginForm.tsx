import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AuthConfig, Login } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';
import AuthField from './AuthField.tsx';
import CodeStep from './CodeStep.tsx';

type Way = 'password' | 'code';

interface Props {
  config: AuthConfig;
  onLogin: (answer: Login) => void;
  onCodeStep: (now: boolean) => void; // the code has the page for itself
}

// With an email address: with the password, or without one (a code is sent to the address).
export default function LoginForm({ config, onLogin, onCodeStep }: Props) {
  const { lang } = useUser();
  const { search } = useLocation(); // keeps ?code=... of a poster
  const [way, setWay] = useState<Way>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  function chooseWay(next: Way) {
    setWay(next);
    setCodeSent(false);
    setProblem(null);
  }

  useEffect(() => onCodeStep(codeSent), [codeSent]);

  // Everything that talks to the server: shows what went wrong.
  async function tryTo(action: () => Promise<void>, wrong: UiKey) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(authError(error, wrong));
    }
    setBusy(false);
  }

  async function loginWithPassword() {
    onLogin(await api.post<Login>('/auth/login', { email, password }));
  }

  async function sendCode() {
    await api.post('/auth/email-codes', { email, purpose: 'login', lang });
    setCodeSent(true);
  }

  async function loginWithCode(code: string) {
    onLogin(await api.post<Login>('/auth/login-with-code', { email, code }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (way === 'password') tryTo(loginWithPassword, 'auth.wrongPassword');
    else tryTo(sendCode, 'auth.wrongCode');
  }

  const ways: { value: Way; label: string }[] = [
    { value: 'password', label: t(lang, 'auth.wayPassword') },
    { value: 'code', label: t(lang, 'auth.wayCode') },
  ];

  if (codeSent) {
    return (
      <CodeStep
        email={email}
        mailboxUrl={config.mailbox_url}
        busy={busy}
        problem={problem}
        onCode={(code) => tryTo(() => loginWithCode(code), 'auth.wrongCode')}
        onResend={() => tryTo(sendCode, 'auth.wrongCode')}
        onBack={() => chooseWay('code')}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {config.email_code && (
        <div className="field">
          <ChipGroup label={t(lang, 'auth.wayLabel')} options={ways} value={way} onChange={chooseWay} />
        </div>
      )}
      <AuthField
        id="auth-email"
        type="email"
        label={t(lang, 'auth.email')}
        value={email}
        onText={setEmail}
        autoComplete="username"
      />
      {way === 'password' && (
        <AuthField
          id="auth-password"
          type="password"
          label={t(lang, 'auth.password')}
          value={password}
          onText={setPassword}
          autoComplete="current-password"
          maxLength={128}
        />
      )}
      {way === 'password' && config.email_code && (
        <p>
          <Link to={{ pathname: '/forgot-password', search }} className="back-link">
            {t(lang, 'auth.forgot')}
          </Link>
        </p>
      )}
      {problem && <p className="error">{t(lang, problem)}</p>}
      <div className="actions">
        <button type="submit" className="button-primary" disabled={busy}>
          {t(lang, way === 'code' ? 'auth.sendCode' : 'auth.login')}
        </button>
      </div>
    </form>
  );
}
