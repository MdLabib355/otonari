import { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';

// Same limits as server/photos.js. Checked here too, so people get a clear message right away.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

// Take a photo, look at it, send it. On a phone this opens the back camera, on a laptop a file
// picker. Tapping "Take photo" again replaces the photo before it is sent.
//
//    <PhotoCapture lang={lang} busy={busy} onSend={(file) => ...} />
export default function PhotoCapture({ lang, busy, onSend }) {
  const [photo, setPhoto] = useState(null); // { file, url }
  const [refused, setRefused] = useState(false);

  // The preview URL keeps the photo in memory until we let it go.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  function choose(event) {
    const file = event.target.files[0];
    event.target.value = ''; // so that choosing the same photo again also counts as a change
    if (!file) return; // the camera was closed without taking a photo

    const ok = IMAGE_TYPES.includes(file.type) && file.size <= MAX_BYTES;
    setRefused(!ok);
    setPhoto(ok ? { file, url: URL.createObjectURL(file) } : null);
  }

  return (
    <div className="actions">
      {/* The label is the visible button: the file input itself can't be styled or translated. */}
      <label className={photo ? 'photo-button button-secondary' : 'photo-button button-primary'}>
        <span aria-hidden="true">📷</span> {t(lang, 'loan.takePhoto')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          disabled={busy}
          onChange={choose}
        />
      </label>

      {refused && <p className="error">{t(lang, 'loan.photoRefused')}</p>}
      {photo && (
        <>
          <img className="photo-preview" src={photo.url} alt="" />
          <button type="button" className="button-primary" disabled={busy} onClick={() => onSend(photo.file)}>
            {t(lang, 'loan.sendPhoto')}
          </button>
        </>
      )}
    </div>
  );
}
