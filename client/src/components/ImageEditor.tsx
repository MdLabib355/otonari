import { useState, type ChangeEvent, type ReactNode } from 'react';
import { api } from '../core/api.ts';
import { shrinkPhoto } from '../core/shrinkPhoto.ts';
import { useUser } from '../core/UserContext.ts';
import { t, type UiKey } from '../i18n/index.ts';
import { CameraIcon } from './Icons.tsx';

const SIDE = 320; // pixels

interface Props<T> {
  path: string; // POST a photo there, DELETE removes it
  picture: ReactNode;
  hasImage: boolean;
  onSaved: (answer: T) => void;
}

// A small square picture (my profile photo, the image of a group): choose one, it is saved at once, or remove it.
export default function ImageEditor<T>({ path, picture, hasImage, onSaved }: Props<T>) {
  const { lang } = useUser();
  const [problem, setProblem] = useState<UiKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(action: () => Promise<T>, wrong: UiKey) {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await action());
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
      return api.post<T>(path, form);
    }, 'loan.photoRefused');
  }

  return (
    <div className="field profile-photo">
      {picture}
      <div className="actions">
        <label className="photo-button button-secondary">
          <CameraIcon /> {t(lang, 'profile.choosePhoto')}
          <input type="file" accept="image/*" className="visually-hidden" disabled={busy} onChange={choose} />
        </label>
        {hasImage && (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => save(() => api.delete<T>(path), 'common.error')}
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
