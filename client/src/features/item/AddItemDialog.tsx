import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { CloseIcon } from '../../components/Icons.tsx';
import { api } from '../../core/api.ts';
import { DURATIONS, SPOTS, findItem } from '../../data/catalog.ts';
import { itemName, spotName, t } from '../../i18n/index.ts';
import TrustedSwitch from './TrustedSwitch.tsx';

interface Props {
  lang: Lang;
  itemKey: string;
  onAdded: () => void;
  onClose: () => void;
}

// Spot names are lowercase because they sit inside sentences ("at the building entrance").
// On a chip they look better with a capital letter (no effect on Japanese or Bengali).
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// How I lend the item I picked. It starts with sensible defaults, so often one tap is enough.
// <dialog> is the browser's own dialog: it keeps the keyboard focus inside, and Escape closes it.
export default function AddItemDialog({ lang, itemKey, onAdded, onClose }: Props) {
  const [maxDays, setMaxDays] = useState(3);
  const [spot, setSpot] = useState('entrance');
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  async function addItem() {
    setBusy(true);
    setFailed(false);
    try {
      await api.post('/items', { item_key: itemKey, max_days: maxDays, spot, trusted_only: trustedOnly });
      onAdded();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const durationOptions = DURATIONS.map((n) => ({
    value: n,
    label: n === 1 ? t(lang, 'borrow.day') : t(lang, 'borrow.days', { n }),
  }));
  const spotOptions = SPOTS.map((key) => ({ value: key, label: capitalize(spotName(lang, key)) }));

  return (
    <dialog
      ref={dialog}
      className="modal-backdrop"
      aria-labelledby="add-item-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(); // a tap beside the dialog
      }}
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <div className="inline-icon-text">
            <span className="item-emoji" aria-hidden="true">
              {findItem(itemKey)?.emoji}
            </span>
            <h2 id="add-item-title">{itemName(lang, itemKey)}</h2>
          </div>
          <button type="button" className="icon-close-btn" aria-label={t(lang, 'common.close')} onClick={onClose}>
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
          <TrustedSwitch lang={lang} checked={trustedOnly} onChange={setTrustedOnly} />
          <p className="hint">{t(lang, 'trust.explain')}</p>
          <p className="hint">{t(lang, 'trust.hint')}</p>
          {failed && <p className="error">{t(lang, 'common.error')}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t(lang, 'common.cancel')}
          </button>
          <button type="button" className="button-primary" disabled={busy} onClick={addItem}>
            {findItem(itemKey)?.emoji} {t(lang, 'myItems.save')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
