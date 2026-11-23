import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { LANGUAGES } from '../data/catalog.js';
import { formatNumber, meta, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const GROUP_ICONS = { building: '🏢', block: '🏘️' };

// The join screen. The QR code on the poster opens /join?code=SAKURA-2611,
// and a device-transfer / lost-phone QR opens /join?restore=XXXX-XXXX.
export default function Join() {
  const { lang: startLang, login } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialRestore = searchParams.get('restore') ?? '';

  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [preview, setPreview] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [nickname, setNickname] = useState('');
  const [managerNote, setManagerNote] = useState('');
  const [lang, setLang] = useState(startLang);
  const [demoUsers, setDemoUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState(null);

  const [showRestore, setShowRestore] = useState(Boolean(initialRestore));
  const [restoreCode, setRestoreCode] = useState(initialRestore);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState(null);

  const cleanCode = code.trim().toUpperCase();

  useEffect(() => {
    setPreview(null);
    setNotFound(false);
    setJoinError(null);
    if (!cleanCode) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get(`/api/groups/by-code/${encodeURIComponent(cleanCode)}`)
        .then((group) => {
          if (!cancelled) setPreview(group);
        })
        .catch((error) => {
          if (cancelled) return;
          if (error.status === 404) setNotFound(true);
          else setJoinError('common.error');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanCode]);

  useEffect(() => {
    api
      .get('/api/health')
      .then((health) => (health?.demo_mode ? api.get('/api/demo/users') : []))
      .then(setDemoUsers)
      .catch(() => setDemoUsers([]));
  }, []);

  async function handleJoin(event) {
    event.preventDefault();
    setBusy(true);
    setJoinError(null);
    try {
      const payload = { code: cleanCode, nickname: nickname.trim(), lang };
      if (preview?.require_approval && managerNote.trim()) {
        payload.manager_note = managerNote.trim();
      }
      const result = await api.post('/api/join', payload);
      login(result);
      navigate('/', { replace: true });
    } catch (error) {
      setJoinError(error.status === 409 ? 'join.nicknameTaken' : 'common.error');
      setBusy(false);
    }
  }

  async function handleRestore(event) {
    event.preventDefault();
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      const result = await api.post('/api/restore', { code: restoreCode.trim().toUpperCase() });
      login(result);
      navigate('/', { replace: true });
    } catch (error) {
      setRestoreError(error.status === 404 ? 'join.restoreInvalid' : 'common.error');
      setRestoreBusy(false);
    }
  }

  async function continueAs(userId) {
    setJoinError(null);
    try {
      const result = await api.post('/api/demo/login', { user_id: userId });
      login(result);
      navigate('/', { replace: true });
    } catch {
      setJoinError('common.error');
    }
  }

  const languageOptions = LANGUAGES.map((language) => ({ value: language, label: meta(language).name }));
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
                    {t(lang, `groupType.${preview.type}`)} · 👥 {formatNumber(lang, preview.memberCount)}
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

        {preview?.require_approval && (
          <div className="field">
            <label className="label" htmlFor="join-manager-note">
              {t(lang, 'join.managerNoteLabel')}
            </label>
            <input
              id="join-manager-note"
              className="text-input"
              value={managerNote}
              onChange={(event) => setManagerNote(event.target.value)}
              maxLength={40}
            />
            <p className="hint">{t(lang, 'join.managerNoteHint')}</p>
          </div>
        )}

        <div className="field">
          <p className="label">{t(lang, 'join.languageLabel')}</p>
          <ChipGroup
            label={t(lang, 'join.languageLabel')}
            options={languageOptions}
            value={lang}
            onChange={setLang}
          />
        </div>

        {joinError && <p className="error">{t(lang, joinError)}</p>}
        <button type="submit" className="button-primary" disabled={!preview || !nickname.trim() || busy}>
          {t(lang, 'join.button')}
        </button>
      </form>

      <div className="new-group">
        <button type="button" className="text-button" onClick={() => setShowRestore((open) => !open)}>
          🔑 {t(lang, 'join.restoreLink')}
        </button>

        {showRestore && (
          <form className="transfer-box" onSubmit={handleRestore}>
            <h2>{t(lang, 'join.restoreTitle')}</h2>
            <div className="field">
              <label className="label" htmlFor="restore-code">
                {t(lang, 'join.restoreCodeLabel')}
              </label>
              <input
                id="restore-code"
                className="text-input"
                value={restoreCode}
                onChange={(e) => setRestoreCode(e.target.value)}
                placeholder="ABCD-1234"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {restoreError && <p className="error">{t(lang, restoreError)}</p>}
            <button type="submit" className="button-primary" disabled={!restoreCode.trim() || restoreBusy}>
              {t(lang, 'join.restoreButton')}
            </button>
          </form>
        )}

        <p style={{ marginTop: 12 }}>
          <Link to="/manager" className="back-link">
            🏢 {t(lang, 'join.managerPortalLink')} →
          </Link>
        </p>
      </div>

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
