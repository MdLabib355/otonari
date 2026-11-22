import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { LANGUAGES } from '../data/catalog.js';
import { meta, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const GROUP_ICONS = { building: '🏢', block: '🏘️' };

// The join screen. The QR code on the poster opens /join?code=SAKURA-2611.
// No account, no password: pick a nickname and a language, and you're in.
export default function Join() {
  const { lang: startLang, login } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [preview, setPreview] = useState(null); // { name, type, city, memberCount } for a valid code
  const [notFound, setNotFound] = useState(false);
  const [nickname, setNickname] = useState('');
  const [lang, setLang] = useState(startLang); // the page switches to the language you pick
  const [demoUsers, setDemoUsers] = useState([]);
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
        .get(`/api/groups/by-code/${encodeURIComponent(cleanCode)}`)
        .then((group) => {
          if (!cancelled) setPreview(group);
        })
        .catch((error) => {
          if (cancelled) return;
          if (error.status === 404) setNotFound(true);
          else setFailed(true);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanCode]);

  // The server only answers this when DEMO_MODE=true; otherwise it's a 404 and no demo buttons show.
  useEffect(() => {
    api
      .get('/api/demo/users')
      .then(setDemoUsers)
      .catch(() => setDemoUsers([]));
  }, []);

  async function handleJoin(event) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.post('/api/join', { code: cleanCode, nickname: nickname.trim(), lang });
      login(result);
      navigate('/', { replace: true });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  async function continueAs(userId) {
    setFailed(false);
    try {
      const result = await api.post('/api/demo/login', { user_id: userId });
      login(result);
      navigate('/', { replace: true });
    } catch {
      setFailed(true);
    }
  }

  const languageOptions = LANGUAGES.map((language) => ({ value: language, label: meta(language).name }));
  // With a valid code, only offer the neighbors of that group.
  const visibleDemoUsers = preview ? demoUsers.filter((user) => user.group_code === cleanCode) : demoUsers;

  return (
    <section>
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
                <span className="group-icon" aria-hidden="true">
                  {GROUP_ICONS[preview.type]}
                </span>
                <div>
                  <strong>{t(lang, 'join.groupFound', { group: preview.name, city: preview.city })}</strong>
                  <p>
                    {t(lang, `groupType.${preview.type}`)} · 👥 {preview.memberCount}
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
            onChange={setLang}
          />
        </div>

        {failed && <p className="error">{t(lang, 'common.error')}</p>}
        <button type="submit" className="button-primary" disabled={!preview || !nickname.trim() || busy}>
          {t(lang, 'join.button')}
        </button>
      </form>

      {visibleDemoUsers.length > 0 && (
        <section className="demo">
          <h2>{t(lang, 'join.demoTitle')}</h2>
          <div className="demo-users">
            {visibleDemoUsers.map((user) => (
              <button key={user.id} type="button" className="demo-user" onClick={() => continueAs(user.id)}>
                <strong>{user.nickname}</strong>
                <span>
                  {meta(user.lang).name} · {user.group_name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
