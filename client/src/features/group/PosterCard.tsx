import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Lang } from '../../../../shared/types.ts';
import { t } from '../../i18n/index.ts';

// Every neighbor who walks past should be able to read the poster, so it always shows all three languages.
const POSTER_LANGS: Lang[] = ['ja', 'en', 'bn'];
const JOIN_PAGE = `${window.location.origin}/join`;

async function qrPicture(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: 'svg' });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function AddressLine({ posterLang }: { posterLang: Lang }) {
  const [before, after] = t(posterLang, 'poster.address').split('{url}');
  return (
    <p lang={posterLang}>
      {before}
      <span className="poster-address">{JOIN_PAGE}</span>
      {after}
    </p>
  );
}

export interface PosterCardProps {
  name: string;
  city: string;
  code: string;
}

// Reusable printable A4 trilingual QR join poster shared by /poster and Group Admin's Poster & Notices tab.
export default function PosterCard({ name, city, code }: PosterCardProps) {
  const [qrCode, setQrCode] = useState<string>('');
  const joinUrl = `${JOIN_PAGE}?code=${encodeURIComponent(code)}`;

  useEffect(() => {
    let active = true;
    qrPicture(joinUrl).then((url) => {
      if (active) setQrCode(url);
    });
    return () => {
      active = false;
    };
  }, [joinUrl]);

  return (
    <div className="poster">
      <h1>
        {POSTER_LANGS.map((posterLang) => (
          <span key={posterLang} lang={posterLang}>
            {t(posterLang, 'poster.title')}
          </span>
        ))}
      </h1>

      <p className="poster-group">
        <strong>{name}</strong>
        <span className="muted">{city}</span>
      </p>
      {qrCode && <img className="poster-qr" src={qrCode} alt={joinUrl} />}
      <p className="big-code">{code}</p>

      <div className="poster-texts">
        {POSTER_LANGS.map((posterLang) => (
          <div key={posterLang} lang={posterLang}>
            <p>{t(posterLang, 'poster.body', { group: name })}</p>
            <p>{t(posterLang, 'poster.code', { code })}</p>
          </div>
        ))}
      </div>

      <div className="poster-footer">
        <p>
          <strong>
            {t('en', 'appName')} (<span lang="ja">{t('ja', 'appName')}</span>)
          </strong>
        </p>
        {POSTER_LANGS.map((posterLang) => (
          <AddressLine key={posterLang} posterLang={posterLang} />
        ))}
      </div>
    </div>
  );
}
