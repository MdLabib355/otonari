import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lang, Me } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { BlockIcon, BuildingIcon } from '../../components/Icons.tsx';
import { LANGUAGES } from '../../data/catalog.ts';
import { meta, t, type UiKey } from '../../i18n/index.ts';
import { useMember } from '../../core/UserContext.ts';

const DOUBLE_TAP_MS = 500;

// Settings: language, elder mode, my neighborhood (with its poster), and leaving it.
export default function Settings() {
  const { user, group, lang, setMe, logout } = useMember();
  const [failed, setFailed] = useState(false);
  const [leaveTappedAt, setLeaveTappedAt] = useState<number | null>(null); // time of the first tap on "Leave"
  const [leaving, setLeaving] = useState(false);
  const [leaveProblem, setLeaveProblem] = useState<UiKey | null>(null); // the text to show if leaving didn't work

  // The server answers with the updated { user, group }. Handing that to setMe re-renders the whole
  // app at once, in the new language or size.
  async function save(change: { lang?: Lang; elder_mode?: boolean }) {
    setFailed(false);
    try {
      setMe(await api.patch<Me>('/me', change));
    } catch {
      setFailed(true);
    }
  }

  // Leaving can't be undone: my items leave the shelf, and nobody can come back as the same person.
  // So it takes two separate taps; an accidental double tap doesn't count.
  function tapLeave() {
    if (leaveTappedAt === null) {
      setLeaveProblem(null);
      setLeaveTappedAt(Date.now());
    } else if (Date.now() - leaveTappedAt > DOUBLE_TAP_MS) {
      leave();
    }
  }

  async function leave() {
    setLeaving(true);
    try {
      await api.delete('/me');
      logout();
    } catch (error) {
      // 409: there is still an accepted or active loan. 403: demo neighbors can't leave.
      const problems: Record<number, UiKey> = { 403: 'settings.leaveDemo', 409: 'settings.leaveBlocked' };
      setLeaveProblem(problems[errorStatus(error) ?? 0] ?? 'common.error');
      setLeaveTappedAt(null);
      setLeaving(false);
    }
  }

  const languageOptions = LANGUAGES.map((language) => ({ value: language, label: meta(language).name }));
  const GroupIcon = group.type === 'block' ? BlockIcon : BuildingIcon;
  const confirming = leaveTappedAt !== null;

  return (
    <section className="settings-page">
      <h1>{t(lang, 'settings.title')}</h1>

      <div className="settings-columns">
        <div className="surface-card">
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
        </div>

        <div className="surface-card">
          <div className="field">
            <p className="label">{t(lang, 'settings.group')}</p>
            <div className="group-preview">
              <GroupIcon className="group-icon-svg" />
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
              disabled={leaving}
              onClick={tapLeave}
            >
              {t(lang, confirming ? 'settings.leaveConfirm' : 'settings.leave')}
            </button>
            {leaveProblem && <p className="error">{t(lang, leaveProblem)}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
