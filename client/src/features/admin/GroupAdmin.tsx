import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { GroupMember, Me } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import { useMember } from '../../core/UserContext.ts';
import { meta, t, type UiKey } from '../../i18n/index.ts';
import ConfirmButton from './ConfirmButton.tsx';

// For the admin of a neighborhood: its members, its join code and its poster.
export default function GroupAdmin() {
  const { user, group, lang, setMe } = useMember();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [problem, setProblem] = useState<UiKey | null>(null);

  function loadMembers() {
    api
      .get<GroupMember[]>('/me/group/members')
      .then(setMembers)
      .catch(() => setProblem('common.error'));
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function remove(id: number) {
    setProblem(null);
    try {
      await api.delete(`/me/group/members/${id}`);
    } catch (error) {
      setProblem(errorStatus(error) === 409 ? 'admin.unfinishedLoan' : 'admin.notAllowed');
    }
    loadMembers();
  }

  async function changeCode() {
    setProblem(null);
    try {
      setMe(await api.post<Me>('/me/group/change-code'));
    } catch {
      setProblem('common.error');
    }
  }

  if (user.role === 'user') return <Navigate to="/" replace />;

  return (
    <section className="settings-page">
      <h1>{t(lang, 'admin.groupTitle', { group: group.name })}</h1>
      {problem && <p className="error">{t(lang, problem)}</p>}

      <div className="surface-card admin-block">
        <h2>{t(lang, 'admin.joinCode')}</h2>
        <p className="big-code">{group.code}</p>
        <p className="hint">{t(lang, 'admin.changeCodeHint')}</p>
        <div className="actions">
          <Link to="/poster" className="button-secondary button-link">
            {t(lang, 'settings.poster')}
          </Link>
          <ConfirmButton label={t(lang, 'admin.changeCode')} onConfirm={changeCode} />
        </div>
      </div>

      <div className="surface-card admin-block">
        <h2>
          {t(lang, 'admin.members')} <span className="section-count">{members?.length ?? ''}</span>
        </h2>
        <ul className="admin-list">
          {members?.map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.nickname}</strong>
                <span className="muted">
                  {meta(member.lang).name} · {t(lang, `role.${member.role}`)}
                </span>
              </div>
              {member.role === 'user' && (
                <ConfirmButton label={t(lang, 'admin.remove')} onConfirm={() => remove(member.id)} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
