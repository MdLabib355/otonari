import { useEffect, useState, type ChangeEvent } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import { CameraIcon } from '../../components/Icons.tsx';
import { t } from '../../i18n/index.ts';

const MAX_SIDE = 1280; // pixels
const JPEG_QUALITY = 0.8;

// Makes a new, smaller JPEG out of any photo. Phone photos are often larger than the server's 5 MB
// limit, and they can contain the GPS position of someone's home; the new JPEG has neither problem.
// Portrait photos stay upright: the browser turns an <img> the way the camera was held (EXIF
// orientation), and the canvas copies it like that.
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode(); // fails if the browser can't read this file as an image

    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser has no canvas');
    context.fillStyle = 'white'; // JPEG can't be see-through: such parts of a PNG would turn black
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Empty image'))), 'image/jpeg', JPEG_QUALITY);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
      const jpeg = await shrink(file);
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
