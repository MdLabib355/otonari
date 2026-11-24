import { useState, type FormEvent } from 'react';
import type { AuthConfig, Login } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';
import AuthField from './AuthField.tsx';
import CodeField from './CodeField.tsx';

type Way = 'password' | 'code';

interface Props {
  config: AuthConfig;
  onLogin: (answer: Login) => void;
}

// With an email address: with the password, or without one (a code is sent to the address).
export default function LoginForm({ config, onLogin }: Props) {
  const { lang } = useUser();
  const [way, setWay] = useState<Way>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  function chooseWay(next: Way) {
    setWay(next);
    setCodeSent(false);
    setCode('');
    setProblem(null);
  }

  async function nextStep() {
    if (way === 'password') {
      onLogin(await api.post<Login>('/auth/login', { email, password }));
    } else if (codeSent) {
      onLogin(await api.post<Login>('/auth/login-with-code', { email, code }));
    } else {
      await api.post('/auth/email-codes', { email, purpose: 'login', lang });
      setCodeSent(true);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await nextStep();
    } catch (error) {
      setProblem(authError(error, way === 'password' ? 'auth.wrongPassword' : 'auth.wrongCode'));
    }
    setBusy(false);
  }

  const ways: { value: Way; label: string }[] = [
    { value: 'password', label: t(lang, 'auth.wayPassword') },
    { value: 'code', label: t(lang, 'auth.wayCode') },
  ];

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
        readOnly={codeSent}
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
      {codeSent && <CodeField code={code} mailboxUrl={config.mailbox_url} onText={setCode} />}
      {problem && <p className="error">{t(lang, problem)}</p>}
      <div className="actions">
        <button type="submit" className="button-primary" disabled={busy}>
          {t(lang, way === 'code' && !codeSent ? 'auth.sendCode' : 'auth.login')}
        </button>
        {codeSent && (
          <button type="button" className="button-secondary" onClick={() => chooseWay('code')}>
            {t(lang, 'auth.otherEmail')}
          </button>
        )}
      </div>
    </form>
  );
}
