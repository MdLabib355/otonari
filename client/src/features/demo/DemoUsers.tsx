import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DemoUser, Lang, Login } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { meta, t } from '../../i18n/index.ts';

// Demo mode only: "continue as a neighbor". With a group code, only the neighbors of that group.
export default function DemoUsers({ lang, groupCode }: { lang: Lang; groupCode?: string }) {
  const { login } = useUser();
  const navigate = useNavigate();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [failed, setFailed] = useState(false);

  // The server only answers this when DEMO_MODE=true; otherwise it's a 404 and nothing shows.
  useEffect(() => {
    api
      .get<DemoUser[]>('/demo/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  async function continueAs(userId: number) {
    setFailed(false);
    try {
      login(await api.post<Login>('/demo/login', { user_id: userId }));
      navigate('/', { replace: true });
    } catch {
      setFailed(true);
    }
  }

  const visibleUsers = groupCode ? users.filter((user) => user.group_code === groupCode) : users;
  if (visibleUsers.length === 0) return null;

  return (
    <section className="demo">
      <h2>{t(lang, 'join.demoTitle')}</h2>
      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      <div className="demo-users">
        {visibleUsers.map((user) => (
          <button key={user.id} type="button" className="demo-user" onClick={() => continueAs(user.id)}>
            <strong>{user.nickname}</strong>
            <span>
              {meta(user.lang).name} · {user.group_name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
