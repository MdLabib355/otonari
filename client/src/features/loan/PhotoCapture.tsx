import { useEffect, useState, type ChangeEvent } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import { CameraIcon } from '../../components/Icons.tsx';
import { shrinkPhoto } from '../../core/shrinkPhoto.ts';
import { t } from '../../i18n/index.ts';

const MAX_SIDE = 1280; // pixels

// Take a photo, look at it, send it. On a phone this opens the back camera, on a laptop a file
// picker. Tapping "Take photo" again replaces the photo before it is sent.
//
//    <PhotoCapture lang={lang} busy={busy} onSend={(file) => ...} />
interface Props {
  lang: Lang;
  busy: boolean;
  onSend: (file: Blob) => void;
}

export default function PhotoCapture({ lang, busy, onSend }: Props) {
  const [photo, setPhoto] = useState<{ file: Blob; url: string } | null>(null); // { file, url } of the small JPEG
  const [preparing, setPreparing] = useState(false);
  const [refused, setRefused] = useState(false);

  // The preview URL keeps the photo in memory until we let it go.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so that choosing the same photo again also counts as a change
    if (!file) return; // the camera was closed without taking a photo

    setPhoto(null); // the previous photo must not be sent by accident while this one is prepared
    setRefused(false);
    setPreparing(true);
    try {
      const jpeg = await shrinkPhoto(file, MAX_SIDE);
      setPhoto({ file: jpeg, url: URL.createObjectURL(jpeg) });
    } catch {
      setRefused(true);
    }
    setPreparing(false);
  }

  return (
    <div className="actions">
      {/* The label is the visible button: the file input itself can't be styled or translated. */}
      <label className={photo ? 'photo-button button-secondary' : 'photo-button button-primary'}>
        <CameraIcon /> {t(lang, 'loan.takePhoto')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          disabled={busy || preparing}
          onChange={choose}
        />
      </label>

      {preparing && <p className="hint">{t(lang, 'common.loading')}</p>}
      {refused && <p className="error">{t(lang, 'loan.photoRefused')}</p>}
      {photo && (
        <>
          {/* Scrolls to the middle of the screen, so the photo and "Send photo" below it are both visible. */}
          <img
            className="photo-preview"
            src={photo.url}
            alt=""
            onLoad={(event) => event.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          />
          <button type="button" className="button-primary" disabled={busy} onClick={() => onSend(photo.file)}>
            {t(lang, 'loan.sendPhoto')}
          </button>
        </>
      )}
    </div>
  );
}
