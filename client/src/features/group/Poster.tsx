import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import type { GroupPreview, Lang } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { useUser } from '../../core/UserContext.ts';

// Every neighbor who walks past should be able to read the poster, so it always shows all three
// languages. Only the Print button is in the language of the person using the app.
const POSTER_LANGS: Lang[] = ['ja', 'en', 'bn'];

// The poster leads to the address this page has right now. So don't print a poster from localhost:
// phones can't open that address.
const JOIN_PAGE = `${window.location.origin}/join`;

// The QR code as an SVG picture: it stays sharp, however large it is printed.
async function qrPicture(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: 'svg' });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type PosterData = GroupPreview & { code: string; joinUrl: string; qrCode: string };

// For whoever can't scan: "Open {url} and enter the code." The address is an element of its own, so
// that it is not split over two lines.
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

// The join poster of my own group, or of the group in the address: /poster?code=XXXX-XXXX works
// without being a member, so that whoever just created a group can open its poster.
export default function Poster() {
  const { lang, group: myGroup } = useUser();
  const [searchParams] = useSearchParams();
  const [poster, setPoster] = useState<PosterData | null>(null); // { code, joinUrl, qrCode, name, type, city, member_count }
  const [problem, setProblem] = useState<UiKey | null>(null); // the text to show instead

  const code = (searchParams.get('code') || myGroup?.code || '').trim().toUpperCase();

  useEffect(() => {
    if (!code) return;
    setPoster(null);
    setProblem(null);
    const joinUrl = `${JOIN_PAGE}?code=${encodeURIComponent(code)}`;
    api
      .get<GroupPreview>(`/groups/${encodeURIComponent(code)}`)
      .then(async (group) => setPoster({ code, joinUrl, qrCode: await qrPicture(joinUrl), ...group }))
      .catch((error) => setProblem(errorStatus(error) === 404 ? 'join.groupNotFound' : 'common.error'));
  }, [code]);

  if (!code) return <Navigate to="/join" replace />;
  if (problem) return <p className="error narrow-page">{t(lang, problem)}</p>;
  if (!poster) return <p className="narrow-page">{t(lang, 'common.loading')}</p>;

  return (
    <section className="narrow-page">
      <button type="button" className="button-primary print-button" onClick={() => window.print()}>
        {t(lang, 'poster.print')}
      </button>

      <div className="poster">
        <h1>
          {POSTER_LANGS.map((posterLang) => (
            <span key={posterLang} lang={posterLang}>
              {t(posterLang, 'poster.title')}
            </span>
          ))}
        </h1>

        <p className="poster-group">
          <strong>{poster.name}</strong>
          <span className="muted">{poster.city}</span>
        </p>
        <img className="poster-qr" src={poster.qrCode} alt={poster.joinUrl} />
        <p className="big-code">{poster.code}</p>

        <div className="poster-texts">
          {POSTER_LANGS.map((posterLang) => (
            <div key={posterLang} lang={posterLang}>
              <p>{t(posterLang, 'poster.body', { group: poster.name })}</p>
              <p>{t(posterLang, 'poster.code', { code: poster.code })}</p>
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
    </section>
  );
}
