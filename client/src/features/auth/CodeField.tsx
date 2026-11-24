import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import AuthField from './AuthField.tsx';

interface Props {
  code: string;
  mailboxUrl: string | null;
  onText: (code: string) => void;
}

// The 6-digit code from the email.
export default function CodeField({ code, mailboxUrl, onText }: Props) {
  const { lang } = useUser();
  return (
    <>
      <p className="notice">{t(lang, 'auth.codeSent')}</p>
      {mailboxUrl && (
        <p className="hint">
          {t(lang, 'auth.mailbox')}{' '}
          <a className="back-link" href={mailboxUrl} target="_blank" rel="noreferrer">
            {mailboxUrl}
          </a>
        </p>
      )}
      <AuthField
        id="auth-code"
        label={t(lang, 'auth.code')}
        value={code}
        onText={(text) => onText(text.replace(/\D/g, ''))}
        className="auth-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        autoFocus
      />
    </>
  );
}
