import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n/index.js';
import ChipGroup from './ChipGroup.jsx';

// "Set up Otonari for your building or block", on the join page: for a building manager or a
// neighborhood association leader. Creates the group and shows its new join code.
// The creator does not become a member.
export default function NewGroup({ lang }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'building', city: '' });
  const [existingName, setExistingName] = useState(null); // the similar group we warn about
  const [created, setCreated] = useState(null); // { code, name, type, city }
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function change(field, value) {
    setForm({ ...form, [field]: value });
    setExistingName(null); // the warning was about the previous input
  }

  async function create(createAnyway) {
    setBusy(true);
    setFailed(false);
    try {
      setCreated(await api.post('/api/groups', { ...form, create_anyway: createAnyway }));
    } catch (error) {
      // 409: a similar group exists. The server tells us its name (and never its code).
      if (error.status === 409) setExistingName(error.data.existing_name);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    create(false);
  }

  if (created) {
    return (
      <section className="new-group">
        <p>{t(lang, 'newGroup.done', { group: created.name })}</p>
        <p className="big-code">{created.code}</p>
        <button type="button" className="button-primary" onClick={() => navigate(`/poster?code=${created.code}`)}>
          {t(lang, 'newGroup.poster')}
        </button>
      </section>
    );
  }

  const typeOptions = ['building', 'block'].map((type) => ({ value: type, label: t(lang, `groupType.${type}`) }));

  return (
    <section className="new-group">
      <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(lang, 'newGroup.link')}
      </button>

      {open && (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <p className="hint">{t(lang, 'newGroup.hint')}</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="new-group-name">
              {t(lang, 'newGroup.name')}
            </label>
            <input
              id="new-group-name"
              className="text-input"
              value={form.name}
              onChange={(event) => change('name', event.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <p className="label">{t(lang, 'newGroup.type')}</p>
            <ChipGroup
              label={t(lang, 'newGroup.type')}
              options={typeOptions}
              value={form.type}
              onChange={(type) => change('type', type)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="new-group-city">
              {t(lang, 'newGroup.city')}
            </label>
            <input
              id="new-group-city"
              className="text-input"
              value={form.city}
              onChange={(event) => change('city', event.target.value)}
              maxLength={40}
              autoComplete="address-level2"
            />
          </div>

          {failed && <p className="error">{t(lang, 'common.error')}</p>}
          {existingName ? (
            <div className="actions">
              <p className="notice">
                {t(lang, 'newGroup.duplicate', { name: existingName, city: form.city.trim() })}
              </p>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => create(true)}>
                {t(lang, 'newGroup.createAnyway')}
              </button>
            </div>
          ) : (
            <button type="submit" className="button-primary" disabled={!form.name.trim() || !form.city.trim() || busy}>
              {t(lang, 'newGroup.create')}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
