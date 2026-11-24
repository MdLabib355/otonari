// Lazy-loaded root for /super-admin/* — completely isolated from resident PWA shell and CSS.

import { useEffect, useState } from 'react';
import type { SuperAdminSessionInfo } from '../../../../shared/types.ts';
import '../../styles/super-admin.css';
import SuperAdminLogin from './SuperAdminLogin.tsx';
import SuperAdminShell from './SuperAdminShell.tsx';
import { clearSuperAdminToken, getSuperAdminToken, saApi } from './superAdminApi.ts';

export default function SuperAdminApp() {
  const [session, setSession] = useState<SuperAdminSessionInfo | null>(null);
  const [checking, setChecking] = useState(Boolean(getSuperAdminToken()));

  // Ensure resident Elder Mode class never distorts the desktop ops console.
  useEffect(() => {
    document.body.classList.remove('elder');
  }, []);

  useEffect(() => {
    if (!getSuperAdminToken()) return;
    saApi
      .get<SuperAdminSessionInfo>('/auth/me')
      .then(setSession)
      .catch(() => {
        clearSuperAdminToken();
        setSession(null);
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="sa-login-wrap">
        <p>Checking Super Admin session…</p>
      </div>
    );
  }

  if (!session) {
    return <SuperAdminLogin onAuthenticated={setSession} />;
  }

  return <SuperAdminShell session={session} onSignedOut={() => setSession(null)} />;
}
