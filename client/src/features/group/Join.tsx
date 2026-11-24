import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { GroupPreview, Lang, Login } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import DemoUsers from '../demo/DemoUsers.tsx';
import NewGroup from './NewGroup.tsx';
import { BlockIcon, BuildingIcon, UsersIcon } from '../../components/Icons.tsx';
import { LANGUAGES } from '../../data/catalog.ts';
import { meta, t } from '../../i18n/index.ts';
import { useUser } from '../../core/UserContext.ts';

const GROUP_ICONS = { building: BuildingIcon, block: BlockIcon };

// The join screen. The QR code on the poster opens /join?code=SAKURA-2611.
// No account, no password: pick a nickname and a language, and you're in.
export default function Join() {
  const { user, lang: startLang, setVisitorLang, login } = useUser();
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

  // The header has a language choice too: both always show the same language.
  useEffect(() => setLang(startLang), [startLang]);

  function pickLang(code: Lang) {
    setLang(code);
    if (!user) setVisitorLang(code);
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.post<Login>(`/groups/${encodeURIComponent(cleanCode)}/members`, {
        nickname: nickname.trim(),
        lang,
      });
      login(result);
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
      <header className="brand">
        <p className="brand-name">{t(lang, 'appName')}</p>
        <p className="brand-tagline">{t(lang, 'tagline')}</p>
      </header>

      <h1>{t(lang, 'join.title')}</h1>

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
          <ChipGroup
            label={t(lang, 'join.languageLabel')}
            options={languageOptions}
            value={lang}
            onChange={pickLang}
          />
        </div>

        {failed && <p className="error">{t(lang, 'common.error')}</p>}
        <button type="submit" className="button-primary" disabled={!preview || !nickname.trim() || busy}>
          {t(lang, 'join.button')}
        </button>
      </form>

      <NewGroup lang={lang} />

      <DemoUsers lang={lang} groupCode={preview ? cleanCode : undefined} />
    </section>
  );
}
