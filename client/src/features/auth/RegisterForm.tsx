import { useEffect, useState, type FormEvent } from 'react';
import type { AuthConfig, Login, RegistrationTicket } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';
import AuthField from './AuthField.tsx';
import CodeStep from './CodeStep.tsx';

const MIN_PASSWORD = 8;
type Step = 'email' | 'code' | 'password';

interface Props {
  purpose: 'register' | 'reset';
  config: AuthConfig;
  onLogin: (answer: Login) => void;
  onCodeStep: (now: boolean) => void; // the code has the page for itself
}

// Three steps: the email address, the code that was sent to it, and then the password (twice).
// For a new account, and for a new password ("Forgot password?").
export default function RegisterForm({ purpose, config, onLogin, onCodeStep }: Props) {
  const { lang } = useUser();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [ticket, setTicket] = useState(''); // from the server: the code was right
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onCodeStep(step === 'code'), [step]);

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

  async function sendCode() {
    await api.post('/auth/email-codes', { email, purpose, lang });
    setStep('code');
  }

  async function checkCode(code: string) {
    const answer = await api.post<RegistrationTicket>('/auth/email-codes/verify', { email, code, purpose });
    setTicket(answer.ticket);
    setStep('password');
  }

  async function savePassword() {
    const path = purpose === 'register' ? '/auth/register' : '/auth/reset-password';
    onLogin(await api.post<Login>(path, { ticket, password, lang }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (step === 'password' && password !== repeated) {
      setProblem('auth.passwordsDiffer');
      return;
    }
    tryTo(step === 'email' ? sendCode : savePassword, 'auth.startAgain');
  }

  function startAgain() {
    setStep('email');
    setProblem(null);
  }

  const finalButton: UiKey = purpose === 'register' ? 'auth.register' : 'profile.changePassword';
  if (!config.email_code) return <p className="notice">{t(lang, 'auth.noEmail')}</p>;

  if (step === 'code') {
    return (
      <CodeStep
        email={email}
        mailboxUrl={config.mailbox_url}
        busy={busy}
        problem={problem}
        onCode={(code) => tryTo(() => checkCode(code), 'auth.wrongCode')}
        onResend={() => tryTo(sendCode, 'auth.wrongCode')}
        onBack={startAgain}
      />
    );
  }

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
          {t(lang, step === 'email' ? 'auth.sendCode' : finalButton)}
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
