import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { LANGUAGES } from '../data/catalog.js';
import { meta, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const DOUBLE_TAP_MS = 500;

// Settings: language, elder mode, my neighborhood (with its poster), and leaving it.
export default function Settings() {
  const { user, group, lang, setMe, logout } = useUser();
  const [failed, setFailed] = useState(false);
  const [leaveTappedAt, setLeaveTappedAt] = useState(null); // time of the first tap on "Leave"

  // The server answers with the updated { user, group }. Handing that to setMe re-renders the whole
  // app at once, in the new language or size.
  async function save(change) {
    setFailed(false);
    try {
      setMe(await api.patch('/api/me', change));
    } catch {
      setFailed(true);
    }
  }

  // Leaving forgets the token, and without it nobody can come back as the same person.
  // So it takes two separate taps; an accidental double tap doesn't count.
  function tapLeave() {
    if (leaveTappedAt === null) {
      setLeaveTappedAt(Date.now());
    } else if (Date.now() - leaveTappedAt > DOUBLE_TAP_MS) {
      logout();
    }
  }

  const languageOptions = LANGUAGES.map((language) => ({ value: language, label: meta(language).name }));
  const confirming = leaveTappedAt !== null;

  return (
    <section>
      <h1>{t(lang, 'settings.title')}</h1>

      <div className="field">
        <p className="label">{t(lang, 'settings.language')}</p>
        <ChipGroup
          label={t(lang, 'settings.language')}
          options={languageOptions}
          value={lang}
          onChange={(language) => save({ lang: language })}
        />
      </div>

      <div className="field">
        <label className="switch-row">
          <span>
            <strong>{t(lang, 'settings.elderMode')}</strong>
            <span className="hint">{t(lang, 'settings.elderModeHint')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={user.elder_mode}
            onChange={() => save({ elder_mode: !user.elder_mode })}
          />
        </label>
        {failed && <p className="error">{t(lang, 'common.error')}</p>}
      </div>

      <div className="field">
        <p className="label">{t(lang, 'settings.group')}</p>
        <div className="group-preview">
          <div>
            <strong>{group.name}</strong>
            <p>{t(lang, `groupType.${group.type}`)}</p>
          </div>
        </div>
      </div>

      <div className="actions">
        <Link to="/poster" className="button-secondary button-link">
          {t(lang, 'settings.poster')}
        </Link>
        <button
          type="button"
          className={confirming ? 'button-secondary button-danger' : 'button-secondary'}
          onClick={tapLeave}
        >
          {t(lang, confirming ? 'settings.leaveConfirm' : 'settings.leave')}
        </button>
      </div>
    </section>
  );
}
