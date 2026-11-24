import { useEffect, useState } from 'react';
import type { Lang, MyItem } from '../../../shared/types.ts';
import { api, errorStatus } from '../api.ts';
import ChipGroup from '../components/ChipGroup.tsx';
import { CATEGORIES, DURATIONS, ITEMS, SPOTS, findItem } from '../data/catalog.ts';
import { categoryName, itemName, spotName, t } from '../i18n/index.ts';
import { useUser } from '../UserContext.ts';

// Spot names are lowercase because they sit inside sentences ("at the building entrance").
// On a chip they look better with a capital letter (no effect on Japanese or Bengali).
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// My items: what I lend, plus the "Add an item" form (pick from the fixed catalog, never typed).
export default function MyItems() {
  const { lang } = useUser();
  const [items, setItems] = useState<MyItem[] | null>(null); // null = still loading
  const [failed, setFailed] = useState(false);
  // The form starts with sensible defaults, so often picking the item is the only choice needed.
  const [itemKey, setItemKey] = useState<string | null>(null);
  const [maxDays, setMaxDays] = useState(3);
  const [spot, setSpot] = useState('entrance');
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadItems() {
    api
      .get<MyItem[]>('/api/my-items')
      .then(setItems)
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function addItem() {
    setBusy(true);
    setFailed(false);
    try {
      await api.post('/api/items', { item_key: itemKey, max_days: maxDays, spot, trusted_only: trustedOnly });
      setItemKey(null);
      setTrustedOnly(false); // off by default, for every new item
      loadItems();
      window.scrollTo({ top: 0, behavior: 'smooth' }); // the new item appears in the list at the top
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: number) {
    setFailed(false);
    try {
      await api.delete(`/api/items/${id}`);
    } catch (error) {
      // 409: it was reserved or lent in the meantime; reloading shows that.
      if (errorStatus(error) !== 409) setFailed(true);
    }
    loadItems();
  }

  async function changeTrustedOnly(id: number, value: boolean) {
    setFailed(false);
    try {
      await api.patch(`/api/items/${id}`, { trusted_only: value });
    } catch {
      setFailed(true);
    }
    loadItems();
  }

  const durationOptions = DURATIONS.map((n) => ({
    value: n,
    label: n === 1 ? t(lang, 'borrow.day') : t(lang, 'borrow.days', { n }),
  }));
  const spotOptions = SPOTS.map((key) => ({ value: key, label: capitalize(spotName(lang, key)) }));

  return (
    <section>
      <h1>{t(lang, 'myItems.title')}</h1>

      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      {!items && !failed && <p>{t(lang, 'common.loading')}</p>}
      {items?.length === 0 && <p className="empty">{t(lang, 'myItems.empty')}</p>}
      {items && items.length > 0 && (
        <ul className="my-items">
          {items.map((item) => (
            <MyItemRow
              key={item.id}
              item={item}
              lang={lang}
              onRemove={removeItem}
              onTrustedOnly={changeTrustedOnly}
            />
          ))}
        </ul>
      )}

      <h2 className="section-title">{t(lang, 'myItems.add')}</h2>

      <div className="field">
        <p className="label">{t(lang, 'myItems.pick')}</p>
        {CATEGORIES.map((category) => (
          <div key={category}>
            <h3 className="catalog-heading">{categoryName(lang, category)}</h3>
            <div className="catalog-grid">
              {ITEMS.filter((item) => item.category === category).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={item.key === itemKey ? 'catalog-item selected' : 'catalog-item'}
                  aria-pressed={item.key === itemKey}
                  onClick={() => setItemKey(item.key)}
                >
                  <span className="catalog-emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  {itemName(lang, item.key)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="field">
        <p className="label">{t(lang, 'myItems.maxDays')}</p>
        <ChipGroup label={t(lang, 'myItems.maxDays')} options={durationOptions} value={maxDays} onChange={setMaxDays} />
      </div>

      <div className="field">
        <p className="label">{t(lang, 'myItems.spot')}</p>
        <ChipGroup label={t(lang, 'myItems.spot')} options={spotOptions} value={spot} onChange={setSpot} />
      </div>

      <div className="field">
        <TrustedSwitch lang={lang} checked={trustedOnly} onChange={setTrustedOnly} />
        <p className="hint">{t(lang, 'trust.explain')}</p>
        <p className="hint">{t(lang, 'trust.hint')}</p>
      </div>

      <button type="button" className="button-primary" disabled={!itemKey || busy} onClick={addItem}>
        {itemKey && `${findItem(itemKey)?.emoji} `}
        {t(lang, 'myItems.save')}
      </button>
    </section>
  );
}

// "Trusted neighbors only": for one item, when adding it and later in the list.
interface TrustedSwitchProps {
  lang: Lang;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function TrustedSwitch({ lang, checked, onChange }: TrustedSwitchProps) {
  return (
    <label className="switch-row">
      <span>🔒 {t(lang, 'trust.only')}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

// One of my items. It can't be removed while it is reserved or lent.
interface MyItemRowProps {
  item: MyItem;
  lang: Lang;
  onRemove: (id: number) => void;
  onTrustedOnly: (id: number, value: boolean) => void;
}

function MyItemRow({ item, lang, onRemove, onTrustedOnly }: MyItemRowProps) {
  const canRemove = item.status === 'available';
  const days = item.max_days === 1 ? t(lang, 'item.maxDay') : t(lang, 'item.maxDays', { n: item.max_days });

  return (
    <li className="my-item">
      <span className="item-emoji" aria-hidden="true">
        {findItem(item.item_key)?.emoji}
      </span>
      <div className="my-item-text">
        <strong>{itemName(lang, item.item_key)}</strong>
        <span className="muted">
          {days} · {t(lang, 'item.spot', { spot: spotName(lang, item.spot) })}
        </span>
        {!canRemove && <span className="hint">{t(lang, 'myItems.cantRemove')}</span>}
      </div>
      {canRemove ? (
        <button type="button" className="button-secondary" onClick={() => onRemove(item.id)}>
          {t(lang, 'myItems.remove')}
        </button>
      ) : (
        <span className={`badge badge-${item.status}`}>{t(lang, `shelf.${item.status}`)}</span>
      )}
      <TrustedSwitch lang={lang} checked={item.trusted_only} onChange={(value) => onTrustedOnly(item.id, value)} />
      {item.trusted_only && <p className="hint">{t(lang, 'trust.hint')}</p>}
    </li>
  );
}
