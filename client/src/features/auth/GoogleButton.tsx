import { useEffect, useRef, useState } from 'react';
import type { Login } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { authError } from './authErrors.ts';

// The part of Google's script that we use: https://developers.google.com/identity/gsi/web
interface GoogleId {
  initialize(options: { client_id: string; callback: (answer: { credential: string }) => void }): void;
  renderButton(parent: HTMLElement, options: object): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

// Loaded only on the login pages, and only if this server offers Google login.
function loadGoogle(language: string): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${SCRIPT}?hl=${language}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google is not reachable'));
    document.head.append(script);
  });
}

// "Continue with Google": Google draws the button, and gives us a signed token that our server checks.
export default function GoogleButton({ clientId, onLogin }: { clientId: string; onLogin: (answer: Login) => void }) {
  const { lang } = useUser();
  const area = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<UiKey | null>(null);

  useEffect(() => {
    let gone = false;
    const language = lang === 'ja-easy' ? 'ja' : lang;

    async function handleCredential({ credential }: { credential: string }) {
      setProblem(null);
      try {
        onLogin(await api.post<Login>('/auth/google', { credential, lang }));
      } catch (error) {
        setProblem(authError(error, 'auth.googleFailed'));
      }
    }

    loadGoogle(language)
      .then(() => {
        if (gone || !area.current || !window.google) return;
        area.current.replaceChildren();
        window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
        window.google.accounts.id.renderButton(area.current, {
          size: 'large',
          width: Math.min(320, area.current.offsetWidth), // fits on a phone, also after turning it
          text: 'continue_with',
          locale: language,
        });
      })
      .catch(() => setProblem('auth.googleFailed'));
    return () => {
      gone = true;
    };
  }, [clientId, lang]);

  return (
    <div className="auth-google">
      <div ref={area} className="auth-google-button" />
      {problem && <p className="error">{t(lang, problem)}</p>}
      <p className="auth-or">{t(lang, 'auth.or')}</p>
    </div>
  );
}
