import { useState } from 'react';
import type { Lang, MyItem } from '../../../../shared/types.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import Modal from '../../components/Modal.tsx';
import PhotoField, { appendPhoto, type PhotoChange } from '../../components/PhotoField.tsx';
import { api } from '../../core/api.ts';
import { itemName, t } from '../../i18n/index.ts';
import LendingFields, { NEW_LENDING, appendLending, type Lending } from './LendingFields.tsx';

interface Props {
  lang: Lang;
  itemKey: string;
  item?: MyItem; // to change one of my items; without it: a new one
  onSaved: () => void;
  onClose: () => void;
}

// How I lend an item: the one I have just picked in the catalog, or one that I already lend.
export default function AddItemDialog({ lang, itemKey, item, onSaved, onClose }: Props) {
  const [lending, setLending] = useState<Lending>(item ?? NEW_LENDING);
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    setBusy(true);
    setFailed(false);
    try {
      const form = new FormData();
      appendLending(form, lending);
      appendPhoto(form, photo);
      if (item) {
        await api.patch(`/items/${item.id}`, form);
      } else {
        form.append('item_key', itemKey);
        await api.post('/items', form);
      }
      onSaved();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={itemName(lang, itemKey)}
      icon={<ItemVisual itemKey={itemKey} alt="" size="sm" />}
      onClose={onClose}
    >
      <div className="modal-body">
        <PhotoField lang={lang} current={item?.photo} change={photo} onChange={setPhoto} onBusy={setPreparing} />
        <LendingFields
          lang={lang}
          value={lending}
          onChange={setLending}
          spotLocked={item !== undefined && item.status !== 'available'}
        />
        {failed && <p className="error">{t(lang, 'common.error')}</p>}
      </div>
      <div className="modal-footer">
        <button type="button" className="button-secondary" onClick={onClose}>
          {t(lang, 'common.cancel')}
        </button>
        <button type="button" className="button-primary" disabled={busy || preparing} onClick={save}>
          {t(lang, item ? 'profile.save' : 'myItems.save')}
        </button>
      </div>
    </Modal>
  );
}
