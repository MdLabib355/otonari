import { useState, type ChangeEvent } from 'react';
import type { Me } from '../../../../shared/types.ts';
import Avatar from '../../components/Avatar.tsx';
import { CameraIcon } from '../../components/Icons.tsx';
import { api } from '../../core/api.ts';
import { shrinkPhoto } from '../../core/shrinkPhoto.ts';
import { useUser } from '../../core/UserContext.ts';
import { t, type UiKey } from '../../i18n/index.ts';

const SIDE = 320; // pixels

// My profile photo: choose one (it is saved at once), or remove it.
export default function AvatarEditor() {
  const { user, lang, setMe } = useUser();
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(action: () => Promise<Me>, wrong: UiKey) {
    setBusy(true);
    setProblem(null);
    try {
      setMe(await action());
    } catch {
      setProblem(wrong);
    }
    setBusy(false);
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so that choosing the same photo again also counts as a change
    if (!file) return;
    save(async () => {
      const form = new FormData();
      form.append('photo', await shrinkPhoto(file, SIDE, true));
      return api.post<Me>('/me/avatar', form);
    }, 'loan.photoRefused');
  }

  return (
    <div className="field profile-photo">
      <Avatar url={user?.avatar ?? null} large />
      <div className="actions">
        <label className="photo-button button-secondary">
          <CameraIcon /> {t(lang, 'profile.choosePhoto')}
          <input type="file" accept="image/*" className="visually-hidden" disabled={busy} onChange={choose} />
        </label>
        {user?.avatar && (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => save(() => api.delete<Me>('/me/avatar'), 'common.error')}
          >
            {t(lang, 'profile.removePhoto')}
          </button>
        )}
        {busy && <p className="hint">{t(lang, 'common.loading')}</p>}
        {problem && <p className="error">{t(lang, problem)}</p>}
      </div>
    </div>
  );
}
