import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { AdminGroup, AdminUser, Role } from '../../../../shared/types.ts';
import { UsersIcon } from '../../components/Icons.tsx';
import { api, errorStatus } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';

const ROLES: Role[] = ['user', 'group_admin', 'super_admin'];

// For super admins: all groups and all accounts.
export default function SuperAdmin() {
  const { user: me, lang } = useUser();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState<UiKey | null>(null);

  async function load() {
    try {
      setGroups(await api.get<AdminGroup[]>('/admin/groups'));
      setUsers(await api.get<AdminUser[]>('/admin/users'));
    } catch {
      setProblem('common.error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function change(id: number, values: { role?: Role; active?: boolean }) {
    setProblem(null);
    try {
      await api.patch(`/admin/users/${id}`, values);
    } catch (error) {
      setProblem(errorStatus(error) === 409 ? 'admin.notInGroup' : 'admin.notAllowed');
    }
    load();
  }

  if (me?.role !== 'super_admin') return <Navigate to="/" replace />;

  const searchText = search.trim().toLowerCase();
  const visibleUsers = users.filter((user) =>
    [user.email, user.nickname, user.group_name ?? ''].some((text) => text.toLowerCase().includes(searchText))
  );

  return (
    <section className="wide-page">
      <h1>{t(lang, 'admin.title')}</h1>
      {problem && <p className="error">{t(lang, problem)}</p>}

      <div className="surface-card admin-block">
        <h2>
          {t(lang, 'admin.groups')} <span className="section-count">{groups.length}</span>
        </h2>
        <ul className="admin-list">
          {groups.map((group) => (
            <li key={group.id}>
              <div>
                <strong>{group.name}</strong>
                <span className="muted">
                  {group.city} · {t(lang, `groupType.${group.type}`)} · {group.code}
                </span>
              </div>
              <span className="badge badge-available">
                <UsersIcon className="icon-xs" /> {group.member_count}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface-card admin-block">
        <h2>
          {t(lang, 'admin.users')} <span className="section-count">{users.length}</span>
        </h2>
        <input
          type="search"
          className="text-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t(lang, 'admin.search')}
          aria-label={t(lang, 'admin.search')}
        />
        <ul className="admin-list">
          {visibleUsers.map((user) => (
            <li key={user.id}>
              <div>
                <strong>{user.email}</strong>
                <span className="muted">
                  {user.nickname || '–'} · {user.group_name ?? '–'}
                </span>
              </div>
              <select
                className="language-select admin-role"
                aria-label={t(lang, 'admin.role')}
                value={user.role}
                disabled={user.id === me.id}
                onChange={(event) => change(user.id, { role: event.target.value as Role })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(lang, `role.${role}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button-secondary"
                disabled={user.id === me.id}
                onClick={() => change(user.id, { active: !user.active })}
              >
                {t(lang, user.active ? 'admin.deactivate' : 'admin.activate')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
