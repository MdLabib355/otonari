import { useState } from 'react';
import type { AdminUser, Role } from '../../../../shared/types.ts';
import { api, ApiError } from '../../core/api.ts';

const ALL_ROLES: Role[] = ['user', 'co_admin', 'group_admin', 'super_admin'];

export interface AccountsDirectoryProps {
  meId: number;
  users: AdminUser[];
  onRefresh: () => Promise<void>;
  onNotify: (text: string, isError?: boolean) => void;
}

export default function AccountsDirectory({ meId, users, onRefresh, onNotify }: AccountsDirectoryProps) {
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const q = search.trim().toLowerCase();
  const visible = users.filter(
    (u) =>
      !q ||
      u.email.toLowerCase().includes(q) ||
      u.nickname.toLowerCase().includes(q) ||
      (u.group_name ?? '').toLowerCase().includes(q)
  );

  async function updateAccount(target: AdminUser, patch: { role?: Role; active?: boolean }) {
    setBusyId(target.id);
    try {
      await api.patch(`/admin/users/${target.id}`, patch);
      await onRefresh();
      const summary =
        patch.role !== undefined
          ? `${target.email} role -> ${patch.role}`
          : `${target.email} ${patch.active ? 'activated' : 'deactivated'}`;
      onNotify(summary);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Account update failed', true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="sa-page-head">
        <div>
          <h1>Accounts &amp; Global Roles</h1>
          <p>
            Search all registered email &amp; Google accounts, manage platform/group roles, or deactivate accounts.
          </p>
        </div>
        <span className="ga-badge ga-badge-indigo">{users.length} Account(s)</span>
      </div>

      <div className="sa-card">
        <div className="sa-card-head">
          <input
            type="search"
            className="text-input ga-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, nickname, or neighborhood…"
          />
          <span className="ga-badge ga-badge-muted">
            Showing {visible.length} of {users.length}
          </span>
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nickname</th>
                <th>Neighborhood</th>
                <th>Status</th>
                <th>Role</th>
                <th>Account Access</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const isSelf = u.id === meId;
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.email}</strong>
                    </td>
                    <td>{u.nickname || '–'}</td>
                    <td>{u.group_name ?? <span className="ga-meta">No group</span>}</td>
                    <td>
                      <span className={`ga-badge ${u.active ? 'ga-badge-green' : 'ga-badge-red'}`}>
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="sa-select"
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        disabled={isSelf || busyId === u.id}
                        onChange={(e) => updateAccount(u, { role: e.target.value as Role })}
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`ga-btn ${u.active ? 'ga-btn-danger' : 'ga-btn-green'}`}
                        disabled={isSelf || busyId === u.id}
                        onClick={() => updateAccount(u, { active: !u.active })}
                      >
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
