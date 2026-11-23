import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { shrinkPhoto } from '../components/PhotoCapture.jsx';
import { CATEGORIES, DURATIONS, ITEMS, SPOTS, findItem } from '../data/catalog.js';
import { categoryName, itemName, spotName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// My items: what I lend, plus the "Add an item" form (fixed catalog + optional real photo).
export default function MyItems() {
  const { lang } = useUser();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [itemKey, setItemKey] = useState(null);
  const [maxDays, setMaxDays] = useState(3);
  const [spot, setSpot] = useState('entrance');
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [itemPhoto, setItemPhoto] = useState(null); // { file, url }
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoRefused, setPhotoRefused] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadItems() {
    api
      .get('/api/my-items')
      .then(setItems)
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    return () => {
      if (itemPhoto) URL.revokeObjectURL(itemPhoto.url);
    };
  }, [itemPhoto]);

  async function pickPhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    setItemPhoto(null);
    setPhotoRefused(false);
    setPhotoBusy(true);
    try {
      const jpeg = await shrinkPhoto(file);
      setItemPhoto({ file: jpeg, url: URL.createObjectURL(jpeg) });
    } catch {
      setPhotoRefused(true);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function addItem() {
    setBusy(true);
    setFailed(false);
    try {
      if (itemPhoto) {
        const form = new FormData();
        form.append('item_key', itemKey);
        form.append('max_days', String(maxDays));
        form.append('spot', spot);
        form.append('trusted_only', String(trustedOnly));
        form.append('photo', itemPhoto.file, 'item.jpg');
        await api.post('/api/items', form);
      } else {
        await api.post('/api/items', { item_key: itemKey, max_days: maxDays, spot, trusted_only: trustedOnly });
      }
      setItemKey(null);
      setTrustedOnly(false);
      setItemPhoto(null);
      setPhotoRefused(false);
      loadItems();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id) {
    setFailed(false);
    try {
      await api.delete(`/api/items/${id}`);
    } catch (error) {
      if (error.status !== 409) setFailed(true);
    }
    loadItems();
  }

  async function changeTrustedOnly(id, value) {
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
      {items?.length > 0 && (
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
        <p className="label">{t(lang, 'myItems.photoOptional')}</p>
        <div className="actions">
          <label className="photo-button button-secondary">
            <span aria-hidden="true">📷</span> {t(lang, 'loan.takePhoto')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              disabled={busy || photoBusy}
              onChange={pickPhoto}
            />
          </label>
          {photoBusy && <p className="hint">{t(lang, 'common.loading')}</p>}
          {photoRefused && <p className="error">{t(lang, 'loan.photoRefused')}</p>}
          {itemPhoto && (
            <>
              <img className="photo-preview" src={itemPhoto.url} alt="" />
              <button type="button" className="button-secondary" disabled={busy} onClick={() => setItemPhoto(null)}>
                {t(lang, 'myItems.photoRemove')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="field">
        <TrustedSwitch lang={lang} checked={trustedOnly} onChange={setTrustedOnly} />
        <p className="hint">{t(lang, 'trust.explain')}</p>
        <p className="hint">{t(lang, 'trust.hint')}</p>
      </div>

      <button type="button" className="button-primary" disabled={!itemKey || busy || photoBusy} onClick={addItem}>
        {itemKey && `${findItem(itemKey).emoji} `}
        {t(lang, 'myItems.save')}
      </button>
    </section>
  );
}

function TrustedSwitch({ lang, checked, onChange }) {
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

function MyItemRow({ item, lang, onRemove, onTrustedOnly }) {
  const canRemove = item.status === 'available';
  const days = item.max_days === 1 ? t(lang, 'item.maxDay') : t(lang, 'item.maxDays', { n: item.max_days });

  return (
    <li className="my-item">
      {item.photo_url ? (
        <img className="my-item-thumb" src={item.photo_url} alt="" loading="lazy" />
      ) : (
        <span className="item-emoji" aria-hidden="true">
          {findItem(item.item_key)?.emoji}
        </span>
      )}
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
