import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GroupType, Lang, NewGroupAnswer } from '../../../../shared/types.ts';
import { api, ApiError } from '../../core/api.ts';
import { ArrowRightIcon, BuildingIcon } from '../../components/Icons.tsx';
import { t } from '../../i18n/index.ts';
import ChipGroup from '../../components/ChipGroup.tsx';

const GROUP_TYPES: GroupType[] = ['building', 'block'];
const EMPTY_FORM: { name: string; type: GroupType; city: string } = { name: '', type: 'building', city: '' };

// "Set up Otonari for your building or block", on the join page: for a building manager or a
// neighborhood association leader. Creates the group and shows its new join code.
// The creator does not become a member.
export default function NewGroup({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [existingName, setExistingName] = useState<string | null>(null); // the similar group we warn about
  const [created, setCreated] = useState<NewGroupAnswer | null>(null); // { code, name, type, city }
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function change(field: 'name' | 'type' | 'city', value: string) {
    setForm({ ...form, [field]: value });
    setExistingName(null); // the warning was about the previous input
  }

  async function create(createAnyway: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      setCreated(await api.post<NewGroupAnswer>('/groups', { ...form, create_anyway: createAnyway }));
    } catch (error) {
      // 409: a similar group exists. The server tells us its name (and never its code).
      if (error instanceof ApiError && error.status === 409) setExistingName(error.data?.existing_name ?? form.name);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
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

  const typeOptions = GROUP_TYPES.map((type) => ({ value: type, label: t(lang, `groupType.${type}`) }));

  return (
    <section className="new-group">
      <button type="button" className="portal-card" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="portal-card-icon">
          <BuildingIcon />
        </span>
        <span className="portal-card-text">
          <strong>{t(lang, 'newGroup.link')}</strong>
          <span className="muted">{t(lang, 'newGroup.hint')}</span>
        </span>
        <ArrowRightIcon className="portal-card-arrow icon-sm" />
      </button>

      {open && (
        <form className="new-group-form" onSubmit={handleSubmit}>
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
