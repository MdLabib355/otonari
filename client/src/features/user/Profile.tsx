import { useState, type FormEvent } from 'react';
import type { Me } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import AvatarEditor from './AvatarEditor.tsx';
import ChangePassword from './ChangePassword.tsx';

// My profile, for every role, also without a neighborhood: photo, name and password.
export default function Profile() {
  const { user, lang } = useUser();
  if (!user) return null;

  return (
    <section className="settings-page">
      <h1>{t(lang, 'profile.title')}</h1>
      <div className="settings-columns">
        <div className="surface-card">
          <AvatarEditor />
          <NicknameForm key={user.nickname} />
          <p className="label">{t(lang, 'auth.email')}</p>
          <p className="muted">
            {user.email} · {t(lang, `role.${user.role}`)}
          </p>
        </div>
        <div className="surface-card">
          <h2>{t(lang, 'profile.password')}</h2>
          {user.has_password && <ChangePassword />}
          {!user.has_password && (
            <p className="notice">{t(lang, user.google_only ? 'profile.googleOnly' : 'profile.noPassword')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function NicknameForm() {
  const { user, lang, setMe } = useUser();
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const cleanNickname = nickname.trim();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      setMe(await api.patch<Me>('/me', { nickname: cleanNickname }));
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <form className="field" onSubmit={handleSubmit}>
      <label className="label" htmlFor="profile-nickname">
        {t(lang, 'join.nicknameLabel')}
      </label>
      <div className="profile-row">
        <input
          id="profile-nickname"
          className="text-input"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={20}
          autoComplete="nickname"
        />
        <button
          type="submit"
          className="button-secondary"
          disabled={busy || !cleanNickname || cleanNickname === user?.nickname}
        >
          {t(lang, 'profile.save')}
        </button>
      </div>
      <p className="hint">{t(lang, 'join.nicknameHint')}</p>
      {failed && <p className="error">{t(lang, 'common.error')}</p>}
    </form>
  );
}
