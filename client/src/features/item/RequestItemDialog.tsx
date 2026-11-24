import { useState, type FormEvent } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import Modal from '../../components/Modal.tsx';
import PhotoField, { appendPhoto, type PhotoChange } from '../../components/PhotoField.tsx';
import { api } from '../../core/api.ts';
import { useCatalog } from '../../data/catalog.ts';
import { categoryName, t } from '../../i18n/index.ts';
import LendingFields, { NEW_LENDING, appendLending } from './LendingFields.tsx';

interface Props {
  lang: Lang;
  onSent: () => void;
  onClose: () => void;
}

// Something that is not in the catalog: a group admin looks at it before it appears on the shelf.
export default function RequestItemDialog({ lang, onSent, onClose }: Props) {
  const { categories } = useCatalog();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(''); // '' = the group admin decides
  const [lending, setLending] = useState(NEW_LENDING);
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const form = new FormData();
      form.append('custom_title', title.trim());
      form.append('category_key', category);
      appendLending(form, lending);
      appendPhoto(form, photo);
      await api.post('/items/request', form);
      onSent();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Modal title={t(lang, 'itemRequest.button')} onClose={onClose}>
      <form className="modal-form" onSubmit={send}>
        <div className="modal-body">
          <div className="field">
            <label className="label" htmlFor="request-title">
              {t(lang, 'itemRequest.title')}
            </label>
            <input
              id="request-title"
              className="text-input"
              required
              minLength={2}
              maxLength={60}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="hint">{t(lang, 'itemRequest.titleHint')}</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="request-category">
              {t(lang, 'itemRequest.category')}
            </label>
            <select
              id="request-category"
              className="select-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">{t(lang, 'itemRequest.adminDecides')}</option>
              {categories.map((key) => (
                <option key={key} value={key}>
                  {categoryName(lang, key)}
                </option>
              ))}
            </select>
          </div>
          <PhotoField lang={lang} change={photo} onChange={setPhoto} onBusy={setPreparing} />
          <LendingFields lang={lang} value={lending} onChange={setLending} />
          {failed && <p className="error">{t(lang, 'common.error')}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t(lang, 'common.cancel')}
          </button>
          <button type="submit" className="button-primary" disabled={busy || preparing || title.trim().length < 2}>
            {t(lang, 'itemRequest.send')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
