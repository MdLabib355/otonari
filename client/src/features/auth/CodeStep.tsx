import { useEffect, useState } from 'react';
import { ArrowLeftIcon } from '../../components/Icons.tsx';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';

const LENGTH = 6;
const RESEND_AFTER_MS = 30_000;

interface Props {
  email: string;
  mailboxUrl: string | null;
  busy: boolean;
  problem: UiKey | null;
  onCode: (code: string) => void; // all six digits are there
  onResend: () => Promise<void>;
  onBack: () => void;
}

// david@gmail.com → d***d@gmail.com: enough to recognize it, also when somebody else sees the screen.
function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const name = email.slice(0, at);
  return `${name[0]}***${name.length > 1 ? name.at(-1) : ''}${email.slice(at)}`;
}

// "Enter the 6-digit code". The six boxes are only a picture: there is one invisible input above them, so that
// pasting, the keyboard's code suggestion and screen readers work as usual.
export default function CodeStep({ email, mailboxUrl, busy, problem, onCode, onResend, onBack }: Props) {
  const { lang } = useUser();
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resent, setResent] = useState(0); // how often

  useEffect(() => {
    setCanResend(false);
    const timer = setTimeout(() => setCanResend(true), RESEND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [resent]);

  // A wrong code: empty boxes for the next try.
  useEffect(() => {
    if (problem) setCode('');
  }, [problem]);

  function change(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (digits.length === LENGTH && digits !== code) onCode(digits);
  }

  async function resend() {
    setCode('');
    await onResend();
    setResent(resent + 1);
  }

  return (
    <div className="code-step">
      <div className="code-title">
        <button type="button" className="icon-close-btn" aria-label={t(lang, 'common.back')} onClick={onBack}>
          <ArrowLeftIcon />
        </button>
        <h1>{t(lang, 'auth.codeTitle')}</h1>
      </div>
      <p>
        {t(lang, 'auth.codeSentTo')} <strong>{maskEmail(email)}</strong>
      </p>

      <div className={problem ? 'code-boxes code-boxes-wrong' : 'code-boxes'}>
        {Array.from({ length: LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={focused && index === Math.min(code.length, LENGTH - 1) ? 'code-box current' : 'code-box'}
          >
            {code[index]}
          </span>
        ))}
        <input
          id="auth-code"
          className="code-input"
          aria-label={t(lang, 'auth.code')}
          value={code}
          onChange={(event) => change(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          readOnly={busy}
          autoFocus
        />
      </div>

      <div aria-live="polite">
        {problem && <p className="error">{t(lang, problem)}</p>}
        {!problem && resent > 0 && <p className="hint">{t(lang, 'auth.codeResent')}</p>}
      </div>
      <p className="hint">{t(lang, 'auth.codeHelp')}</p>
      {mailboxUrl && (
        <p className="hint">
          {t(lang, 'auth.mailbox')}{' '}
          <a className="back-link" href={mailboxUrl} target="_blank" rel="noreferrer">
            {mailboxUrl}
          </a>
        </p>
      )}
      <button type="button" className="code-resend" disabled={!canResend || busy} onClick={resend}>
        {t(lang, 'auth.resend')}
      </button>
    </div>
  );
}
