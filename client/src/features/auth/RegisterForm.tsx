import { useState, type FormEvent } from 'react';
import type { AuthConfig, Login, RegistrationTicket } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';
import AuthField from './AuthField.tsx';
import CodeField from './CodeField.tsx';

const MIN_PASSWORD = 8;
type Step = 'email' | 'code' | 'password';

const BUTTONS: Record<Step, UiKey> = { email: 'auth.sendCode', code: 'auth.checkCode', password: 'auth.register' };

interface Props {
  config: AuthConfig;
  onLogin: (answer: Login) => void;
}

// Three steps: the email address, the code that was sent to it, and then the password (twice).
export default function RegisterForm({ config, onLogin }: Props) {
  const { lang } = useUser();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState(''); // from the server: the code was right
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function nextStep() {
    if (step === 'email') {
      await api.post('/auth/email-codes', { email, purpose: 'register', lang });
      setStep('code');
    } else if (step === 'code') {
      const answer = await api.post<RegistrationTicket>('/auth/email-codes/verify', { email, code });
      setTicket(answer.ticket);
      setStep('password');
    } else {
      onLogin(await api.post<Login>('/auth/register', { ticket, password, lang }));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (step === 'password' && password !== repeated) {
      setProblem('auth.passwordsDiffer');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await nextStep();
    } catch (error) {
      setProblem(authError(error, step === 'code' ? 'auth.wrongCode' : 'auth.startAgain'));
    }
    setBusy(false);
  }

  function startAgain() {
    setStep('email');
    setCode('');
    setProblem(null);
  }

  if (!config.email_code) return <p className="notice">{t(lang, 'auth.noEmail')}</p>;

  return (
    <form onSubmit={handleSubmit}>
      <AuthField
        id="auth-email"
        type="email"
        label={t(lang, 'auth.email')}
        value={email}
        onText={setEmail}
        autoComplete="username"
        readOnly={step !== 'email'}
      />
      {step === 'code' && <CodeField code={code} mailboxUrl={config.mailbox_url} onText={setCode} />}
      {step === 'password' && (
        <>
          <AuthField
            id="auth-password"
            type="password"
            label={t(lang, 'auth.password')}
            hint={t(lang, 'auth.passwordHint', { n: MIN_PASSWORD })}
            value={password}
            onText={setPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            maxLength={128}
            autoFocus
          />
          <AuthField
            id="auth-password-again"
            type="password"
            label={t(lang, 'auth.passwordAgain')}
            value={repeated}
            onText={setRepeated}
            autoComplete="new-password"
            maxLength={128}
          />
        </>
      )}
      {problem && <p className="error">{t(lang, problem)}</p>}
      <div className="actions">
        <button type="submit" className="button-primary" disabled={busy}>
          {t(lang, BUTTONS[step])}
        </button>
        {step !== 'email' && (
          <button type="button" className="button-secondary" onClick={startAgain}>
            {t(lang, 'auth.otherEmail')}
          </button>
        )}
      </div>
    </form>
  );
}
