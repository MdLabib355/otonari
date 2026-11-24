import { useState, type FormEvent } from 'react';
import type { GroupAdminItem, Lang } from '../../../../shared/types.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import Modal from '../../components/Modal.tsx';
import PhotoField, { appendPhoto, type PhotoChange } from '../../components/PhotoField.tsx';
import { api, ApiError } from '../../core/api.ts';
import { useCatalog } from '../../data/catalog.ts';
import { categoryName, displayName, itemDisplayTitle, itemName, t } from '../../i18n/index.ts';

const CUSTOM = 'custom';

interface Props {
  lang: Lang;
  item: GroupAdminItem;
  onSaved: (title: string) => void;
  onClose: () => void;
}

// Name, category and photo of an item: to approve a request, or to change what is on the shelf.
export default function ItemEditor({ lang, item, onSaved, onClose }: Props) {
  const { items, categories } = useCatalog();
  const [itemKey, setItemKey] = useState(item.item_key);
  const [title, setTitle] = useState(item.custom_title ?? '');
  const [category, setCategory] = useState(item.category_key ?? '');
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const isRequest = item.approval_status === 'pending';
  const isCustom = itemKey === CUSTOM;
  // What it already has can be chosen, even if it has been disabled in the meantime.
  const itemKeys = items.map((entry) => entry.key);
  if (!isCustom && !itemKeys.includes(itemKey)) itemKeys.push(itemKey);
  const categoryKeys = [...categories];
  if (!isRequest && item.category_key && !categoryKeys.includes(item.category_key)) categoryKeys.push(item.category_key);

  // An item of the catalog has a name in every language: no title of its own is needed.
  function chooseItem(key: string) {
    setItemKey(key);
    setTitle(key === CUSTOM ? (item.custom_title ?? '') : '');
    setCategory(key === CUSTOM ? (item.category_key ?? '') : '');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append('item_key', itemKey);
      form.append('custom_title', title.trim());
      form.append('category_key', category);
      appendPhoto(form, photo);
      if (isRequest) await api.post(`/group-admin/items/${item.id}/approve`, form);
      else await api.patch(`/group-admin/items/${item.id}`, form);
      onSaved(itemDisplayTitle(lang, itemKey, title.trim()));
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : t(lang, 'common.error'));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t(lang, isRequest ? 'groupAdmin.reviewItem' : 'groupAdmin.editItem')}
      icon={<ItemVisual itemKey={itemKey} categoryKey={category || null} alt="" size="sm" />}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={save}>
        <div className="modal-body">
          <p className="ga-meta">{t(lang, 'shelf.from', { name: displayName(lang, item.owner_nickname) })}</p>
          <div className="field">
            <label className="label" htmlFor="edit-item-key">
              {t(lang, 'groupAdmin.catalogItem')}
            </label>
            <select
              id="edit-item-key"
              className="select-input"
              value={itemKey}
              onChange={(event) => chooseItem(event.target.value)}
            >
              {item.item_key === CUSTOM && <option value={CUSTOM}>{t(lang, 'groupAdmin.customItem')}</option>}
              {itemKeys.map((key) => (
                <option key={key} value={key}>
                  {itemName(lang, key)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="edit-item-title">
              {t(lang, 'groupAdmin.customTitle')}
            </label>
            <input
              id="edit-item-title"
              className="text-input"
              required={isCustom}
              minLength={isCustom ? 2 : undefined}
              maxLength={60}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            {!isCustom && <p className="hint">{t(lang, 'groupAdmin.customTitleHint')}</p>}
          </div>
          <div className="field">
            <label className="label" htmlFor="edit-item-category">
              {t(lang, 'itemRequest.category')}
            </label>
            <select
              id="edit-item-category"
              className="select-input"
              required={isCustom}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">
                {t(lang, isCustom ? 'groupAdmin.chooseCategory' : 'groupAdmin.catalogCategory')}
              </option>
              {categoryKeys.map((key) => (
                <option key={key} value={key}>
                  {categoryName(lang, key)}
                </option>
              ))}
            </select>
          </div>
          <PhotoField lang={lang} current={item.photo} change={photo} onChange={setPhoto} onBusy={setPreparing} />
          {problem && <p className="error">{problem}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t(lang, 'common.cancel')}
          </button>
          <button type="submit" className="button-primary" disabled={busy || preparing}>
            {t(lang, isRequest ? 'groupAdmin.approve' : 'profile.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
