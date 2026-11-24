import { useEffect, useState, type ChangeEvent } from 'react';
import type { Lang } from '../../../shared/types.ts';
import { shrinkPhoto } from '../core/shrinkPhoto.ts';
import { t } from '../i18n/index.ts';
import { CameraIcon } from './Icons.tsx';

const MAX_SIDE = 1280; // pixels

// What should happen to the photo of an item when the form is saved. undefined: nothing, null: remove it.
export type PhotoChange = Blob | null | undefined;

export function appendPhoto(form: FormData, photo: PhotoChange) {
  if (photo) form.append('photo', photo, 'item.jpg');
  if (photo === null) form.append('clear_photo', 'true');
}

interface Props {
  lang: Lang;
  current?: string | null; // URL of the saved photo
  change: PhotoChange;
  onChange: (change: PhotoChange) => void;
  onBusy: (busy: boolean) => void; // while the photo is prepared, the form can't be saved
}

// The optional photo in a form: choose one, see it, replace it, or remove it.
export default function PhotoField({ lang, current = null, change, onChange, onBusy }: Props) {
  const [preparing, setPreparing] = useState(false);
  const [refused, setRefused] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // The preview URL keeps the photo in memory until we let it go.
  useEffect(() => {
    if (!change) return setPreview(null);
    const url = URL.createObjectURL(change);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [change]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so that choosing the same photo again also counts as a change
    if (!file) return;
    setRefused(false);
    setPreparing(true);
    onBusy(true);
    try {
      onChange(await shrinkPhoto(file, MAX_SIDE));
    } catch {
      setRefused(true);
    }
    setPreparing(false);
    onBusy(false);
  }

  const shown = change === undefined ? current : preview;
  return (
    <div className="field">
      <p className="label">{t(lang, 'myItems.photo')}</p>
      {shown && <img className="photo-preview" src={shown} alt={t(lang, 'myItems.photo')} />}
      <div className="photo-field-buttons">
        <label className="photo-button button-secondary">
          <CameraIcon /> {t(lang, 'profile.choosePhoto')}
          <input type="file" accept="image/*" className="visually-hidden" disabled={preparing} onChange={choose} />
        </label>
        {shown && (
          <button
            type="button"
            className="button-secondary"
            disabled={preparing}
            onClick={() => onChange(current ? null : undefined)}
          >
            {t(lang, 'profile.removePhoto')}
          </button>
        )}
      </div>
      {preparing && <p className="hint">{t(lang, 'common.loading')}</p>}
      {refused && <p className="error">{t(lang, 'loan.photoRefused')}</p>}
    </div>
  );
}
