import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { GroupPreview, Me } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { BlockIcon, BuildingIcon, UsersIcon } from '../../components/Icons.tsx';
import { api, errorStatus } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { LANGUAGES } from '../../data/catalog.ts';
import { meta, t } from '../../i18n/index.ts';
import NewGroup from './NewGroup.tsx';

const GROUP_ICONS = { building: BuildingIcon, block: BlockIcon };

// For people who are logged in, but not in a neighborhood yet: join one with the code from its poster, or
// start a new one. The QR code on the poster opens /join?code=SAKURA-2611.
export default function Join() {
  const { lang: startLang, setMe } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [preview, setPreview] = useState<GroupPreview | null>(null); // { name, type, city, member_count } for a valid code
  const [notFound, setNotFound] = useState(false);
  const [nickname, setNickname] = useState('');
  const [lang, setLang] = useState(startLang); // the page switches to the language you pick
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const cleanCode = code.trim().toUpperCase();

  // Check the code shortly after typing stops, and show which group it belongs to.
  useEffect(() => {
    setPreview(null);
    setNotFound(false);
    setFailed(false);
    if (!cleanCode) return;

    let cancelled = false; // ignore answers for a code that has changed since
    const timer = setTimeout(() => {
      api
        .get<GroupPreview>(`/groups/${encodeURIComponent(cleanCode)}`)
        .then((group) => {
          if (!cancelled) setPreview(group);
        })
        .catch((error) => {
          if (cancelled) return;
          if (errorStatus(error) === 404) setNotFound(true);
          else setFailed(true);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanCode]);

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      setMe(await api.post<Me>(`/groups/${encodeURIComponent(cleanCode)}/members`, { nickname: nickname.trim(), lang }));
      navigate('/', { replace: true });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const languageOptions = LANGUAGES.map((language) => ({ value: language, label: meta(language).name }));
  const GroupIcon = GROUP_ICONS[preview?.type ?? 'building'];

  return (
    <section className="narrow-page surface-card">
      <h1>{t(lang, 'join.title')}</h1>

      {/* For both: joining and starting a group */}
      <div className="field">
        <label className="label" htmlFor="join-nickname">
          {t(lang, 'join.nicknameLabel')}
        </label>
        <input
          id="join-nickname"
          className="text-input"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={20}
          autoComplete="nickname"
        />
        <p className="hint">{t(lang, 'join.nicknameHint')}</p>
      </div>
      <div className="field">
        <p className="label">{t(lang, 'join.languageLabel')}</p>
        <ChipGroup label={t(lang, 'join.languageLabel')} options={languageOptions} value={lang} onChange={setLang} />
      </div>

      <form onSubmit={handleJoin}>
        <div className="field">
          <label className="label" htmlFor="join-code">
            {t(lang, 'join.codeLabel')}
          </label>
          <input
            id="join-code"
            className="text-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t(lang, 'join.codePlaceholder')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <div aria-live="polite">
            {preview && (
              <div className="group-preview">
                <GroupIcon className="group-icon-svg" />
                <div>
                  <strong>{t(lang, 'join.groupFound', { group: preview.name, city: preview.city })}</strong>
                  <p className="inline-icon-text">
                    {t(lang, `groupType.${preview.type}`)} · <UsersIcon className="icon-xs" /> {preview.member_count}
                  </p>
                </div>
              </div>
            )}
            {notFound && <p className="error">{t(lang, 'join.groupNotFound')}</p>}
          </div>
        </div>

        {failed && <p className="error">{t(lang, 'common.error')}</p>}
        <button type="submit" className="button-primary" disabled={!preview || !nickname.trim() || busy}>
          {t(lang, 'join.button')}
        </button>
      </form>

      <NewGroup lang={lang} nickname={nickname.trim()} />
    </section>
  );
}
