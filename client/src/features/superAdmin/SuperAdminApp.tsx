// Lazy-loaded root for /admin and /super-admin/* — isolated from resident PWA shell & Elder Mode.
// Uses Otonari's unified session auth (UserContext, role === 'super_admin').

import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '../../core/UserContext.ts';
import '../../styles/super-admin.css';
import SuperAdminShell from './SuperAdminShell.tsx';

export default function SuperAdminApp() {
  const { user, logout } = useUser();

  // Ensure resident Elder Mode class never distorts the desktop ops console.
  useEffect(() => {
    document.body.classList.remove('elder');
  }, []);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <SuperAdminShell user={user} onSignOut={logout} />;
}
