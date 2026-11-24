import { useState, type FormEvent } from 'react';
import { api, errorStatus } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import AuthField from '../auth/AuthField.tsx';

const MIN_PASSWORD = 8;
const PROBLEMS: Record<number, UiKey> = { 403: 'profile.wrongPassword', 429: 'auth.tooMany' };

// Needs the old password, so nobody can do this on a phone that was left unlocked.
export default function ChangePassword() {
  const { lang } = useUser();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    if (password !== repeated) {
      setProblem('auth.passwordsDiffer');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await api.post('/me/password', { current_password: current, password });
      setCurrent('');
      setPassword('');
      setRepeated('');
      setDone(true);
    } catch (error) {
      setProblem(PROBLEMS[errorStatus(error) ?? 0] ?? 'common.error');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <AuthField
        id="password-current"
        type="password"
        label={t(lang, 'profile.currentPassword')}
        value={current}
        onText={setCurrent}
        autoComplete="current-password"
        maxLength={128}
      />
      <AuthField
        id="password-new"
        type="password"
        label={t(lang, 'profile.newPassword')}
        hint={t(lang, 'auth.passwordHint', { n: MIN_PASSWORD })}
        value={password}
        onText={setPassword}
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        maxLength={128}
      />
      <AuthField
        id="password-again"
        type="password"
        label={t(lang, 'auth.passwordAgain')}
        value={repeated}
        onText={setRepeated}
        autoComplete="new-password"
        maxLength={128}
      />
      {problem && <p className="error">{t(lang, problem)}</p>}
      {done && <p className="notice">{t(lang, 'profile.passwordChanged')}</p>}
      <button type="submit" className="button-primary" disabled={busy}>
        {t(lang, 'profile.changePassword')}
      </button>
    </form>
  );
}
