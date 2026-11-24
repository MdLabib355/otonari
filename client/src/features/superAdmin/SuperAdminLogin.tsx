import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SuperAdminLoginResponse, SuperAdminSessionInfo } from '../../../../shared/types.ts';
import { ApiError } from '../../core/api.ts';
import { saApi, saveSuperAdminToken } from './superAdminApi.ts';

export default function SuperAdminLogin({
  onAuthenticated,
}: {
  onAuthenticated: (session: SuperAdminSessionInfo) => void;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const answer = await saApi.post<SuperAdminLoginResponse>('/auth/login', { username, password });
      saveSuperAdminToken(answer.token);
      onAuthenticated({ admin_label: answer.admin_label, expires_at: answer.expires_at });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
      setBusy(false);
    }
  }

  return (
    <div className="sa-login-wrap">
      <div className="sa-login-card">
        <div className="sa-topbar-left" style={{ marginBottom: 18 }}>
          <div className="sa-brand-mark" aria-hidden="true">
            隣
          </div>
          <div>
            <div className="sa-brand-title">Otonari · Super Admin</div>
            <div className="sa-brand-sub">Platform Governance &amp; Safety Console</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="sa-username">
              Admin username
            </label>
            <input
              id="sa-username"
              className="text-input"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="sa-password">
              Password
            </label>
            <input
              id="sa-password"
              className="text-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="hint">30-minute sliding idle session · isolated from resident demo accounts.</p>
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="button-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in to Super Admin'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link to="/" className="ga-meta">
            ← Return to Neighbor App
          </Link>
        </div>
      </div>
    </div>
  );
}
