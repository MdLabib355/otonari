import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { CameraIcon, CloseIcon, EditIcon, LockIcon, PauseIcon } from '../components/Icons.jsx';
import { shrinkPhoto } from '../components/PhotoCapture.jsx';
import { CATEGORIES, DURATIONS, ITEMS, SPOTS, findItem } from '../data/catalog.js';
import { categoryName, itemName, spotName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// My items: responsive 2-column layout with instant Configure & Share modal when tapping any catalog item.
export default function MyItems() {
  const { lang } = useUser();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState('all');

  // Modal state: either adding a new catalog item ({ mode: 'add', itemKey }) or editing an existing one ({ mode: 'edit', item })
  const [modal, setModal] = useState(null);
  const [maxDays, setMaxDays] = useState(3);
  const [spot, setSpot] = useState('entrance');
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [itemPhoto, setItemPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoRefused, setPhotoRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

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

  useEffect(() => {
    if (!modal) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTarget = modalRef.current?.querySelector('button, input, [tabindex]') ?? modalRef.current;
    focusTarget?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) closeModal();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, busy]);

  function openAddModal(key) {
    triggerRef.current = document.activeElement;
    setMaxDays(3);
    setSpot('entrance');
    setTrustedOnly(false);
    setItemPhoto(null);
    setPhotoRefused(false);
    setFailed(false);
    setModal({ mode: 'add', itemKey: key });
  }

  function openEditModal(item) {
    triggerRef.current = document.activeElement;
    setMaxDays(item.max_days);
    setSpot(item.spot);
    setTrustedOnly(Boolean(item.trusted_only));
    setItemPhoto(null);
    setPhotoRefused(false);
    setFailed(false);
    setModal({ mode: 'edit', item });
  }

  function closeModal() {
    setModal(null);
    setItemPhoto(null);
    setPhotoRefused(false);
  }

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

  async function submitModal() {
    if (!modal) return;
    setBusy(true);
    setFailed(false);
    try {
      if (modal.mode === 'add') {
        if (itemPhoto) {
          const form = new FormData();
          form.append('item_key', modal.itemKey);
          form.append('max_days', String(maxDays));
          form.append('spot', spot);
          form.append('trusted_only', String(trustedOnly));
          form.append('photo', itemPhoto.file, 'item.jpg');
          await api.post('/api/items', form);
        } else {
          await api.post('/api/items', {
            item_key: modal.itemKey,
            max_days: maxDays,
            spot,
            trusted_only: trustedOnly,
          });
        }
      } else {
        await api.patch(`/api/items/${modal.item.id}`, {
          max_days: maxDays,
          spot,
          trusted_only: trustedOnly,
        });
      }
      closeModal();
      loadItems();
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

  async function patchItem(id, change) {
    setFailed(false);
    try {
      await api.patch(`/api/items/${id}`, change);
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
  const visibleCategories = catalogCategory === 'all' ? CATEGORIES : [catalogCategory];
  const modalItemKey = modal ? (modal.mode === 'add' ? modal.itemKey : modal.item.item_key) : null;

  return (
    <section className="wide-page">
      <h1>{t(lang, 'myItems.title')}</h1>

      {failed && !modal && <p className="error">{t(lang, 'common.error')}</p>}

      <div className="two-col-layout">
        <div className="two-col-main">
          {!items && !failed && <p>{t(lang, 'common.loading')}</p>}
          {items?.length === 0 && <p className="empty surface-card">{t(lang, 'myItems.empty')}</p>}
          {items?.length > 0 && (
            <ul className="my-items">
              {items.map((item) => (
                <MyItemRow
                  key={item.id}
                  item={item}
                  lang={lang}
                  onEdit={openEditModal}
                  onRemove={removeItem}
                  onPatch={patchItem}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="two-col-side add-item-panel">
          <h2 className="section-title-mobile">{t(lang, 'myItems.add')}</h2>
          <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
            {t(lang, 'myItems.pick')}
          </p>

          <div
            className="filter-strip"
            style={{ marginBottom: 10 }}
            role="group"
            aria-label={t(lang, 'shelf.allCategories')}
          >
            <button
              type="button"
              className={catalogCategory === 'all' ? 'filter-chip selected' : 'filter-chip'}
              aria-pressed={catalogCategory === 'all'}
              onClick={() => setCatalogCategory('all')}
            >
              {t(lang, 'shelf.allCategories')}
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={catalogCategory === category ? 'filter-chip selected' : 'filter-chip'}
                aria-pressed={catalogCategory === category}
                onClick={() => setCatalogCategory(category)}
              >
                {categoryName(lang, category)}
              </button>
            ))}
          </div>

          {visibleCategories.map((category) => (
            <div key={category}>
              {catalogCategory === 'all' && <h3 className="catalog-heading">{categoryName(lang, category)}</h3>}
              <div className="catalog-grid">
                {ITEMS.filter((item) => item.category === category).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="catalog-item"
                    onClick={() => openAddModal(item.key)}
                  >
                    <span className="catalog-emoji" aria-hidden="true">
                      {item.emoji}
                    </span>
                    <span>{itemName(lang, item.key)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && modalItemKey && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) closeModal();
          }}
        >
          <div
            ref={modalRef}
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-modal-title"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div className="inline-icon-text" style={{ gap: 10 }}>
                <span className="item-emoji" aria-hidden="true" style={{ fontSize: '1.9em' }}>
                  {findItem(modalItemKey)?.emoji}
                </span>
                <h2 id="item-modal-title">{itemName(lang, modalItemKey)}</h2>
              </div>
              <button type="button" className="icon-close-btn" aria-label="Close" disabled={busy} onClick={closeModal}>
                <CloseIcon className="icon-sm" />
              </button>
            </div>

            <div className="modal-body">
              <div className="field">
                <p className="label">{t(lang, 'myItems.maxDays')}</p>
                <ChipGroup
                  label={t(lang, 'myItems.maxDays')}
                  options={durationOptions}
                  value={maxDays}
                  onChange={setMaxDays}
                />
              </div>

              <div className="field">
                <p className="label">{t(lang, 'myItems.spot')}</p>
                <ChipGroup label={t(lang, 'myItems.spot')} options={spotOptions} value={spot} onChange={setSpot} />
              </div>

              {modal.mode === 'add' && (
                <div className="field">
                  <p className="label">{t(lang, 'myItems.photoOptional')}</p>
                  <div className="actions" style={{ marginBottom: 0 }}>
                    <label className="photo-button button-secondary">
                      <CameraIcon /> {t(lang, 'loan.takePhoto')}
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
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={busy}
                          onClick={() => setItemPhoto(null)}
                        >
                          {t(lang, 'myItems.photoRemove')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="field" style={{ marginBottom: 0 }}>
                <TrustedSwitch lang={lang} checked={trustedOnly} onChange={setTrustedOnly} />
                <p className="hint">{t(lang, 'trust.explain')}</p>
                <p className="hint">{t(lang, 'trust.hint')}</p>
              </div>

              {failed && <p className="error">{t(lang, 'common.error')}</p>}
            </div>

            <div className="modal-footer">
              <button type="button" className="button-secondary" disabled={busy} onClick={closeModal}>
                {t(lang, 'myItems.cancelEdit')}
              </button>
              <button type="button" className="button-primary" disabled={busy || photoBusy} onClick={submitModal}>
                {findItem(modalItemKey)?.emoji}{' '}
                {t(lang, modal.mode === 'add' ? 'myItems.save' : 'myItems.saveEdit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TrustedSwitch({ lang, checked, onChange }) {
  return (
    <label className="switch-row">
      <span className="inline-icon-text">
        <LockIcon className="icon-sm" /> {t(lang, 'trust.only')}
      </span>
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

function MyItemRow({ item, lang, onEdit, onRemove, onPatch }) {
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
        <div className="my-item-buttons">
          <button type="button" className="button-secondary inline-btn" onClick={() => onEdit(item)}>
            <EditIcon className="icon-sm" /> {t(lang, 'myItems.edit')}
          </button>
          <button type="button" className="button-secondary" onClick={() => onRemove(item.id)}>
            {t(lang, 'myItems.remove')}
          </button>
        </div>
      ) : (
        <span className={`badge badge-${item.status}`}>{t(lang, `shelf.${item.status}`)}</span>
      )}

      <label className="switch-row">
        <span className="inline-icon-text">
          <PauseIcon className="icon-sm" /> {t(lang, 'myItems.pause')}
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={Boolean(item.paused)}
          onChange={(event) => onPatch(item.id, { paused: event.target.checked })}
        />
      </label>
      {item.paused && <p className="hint">{t(lang, 'myItems.pausedHint')}</p>}

      <TrustedSwitch
        lang={lang}
        checked={Boolean(item.trusted_only)}
        onChange={(value) => onPatch(item.id, { trusted_only: value })}
      />
      {item.trusted_only && <p className="hint">{t(lang, 'trust.hint')}</p>}
    </li>
  );
}
