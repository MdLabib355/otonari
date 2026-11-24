import { useEffect, useState } from 'react';
import type { MyItem } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import AddItemDialog from './AddItemDialog.tsx';
import Catalog from './Catalog.tsx';
import MyItemRow from './MyItemRow.tsx';

// My items: what I lend, and beside it (on a phone: below it) the catalog to add more. Tapping
// something in the catalog opens a dialog with its settings. Items are picked, never typed.
export default function MyItems() {
  const { lang } = useUser();
  const [items, setItems] = useState<MyItem[] | null>(null); // null = still loading
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<MyItem | null>(null); // the item I'm about to change
  const [itemKey, setItemKey] = useState<string | null>(null); // the item I'm about to add

  function loadItems() {
    api
      .get<MyItem[]>('/me/items')
      .then(setItems)
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    loadItems();
  }, []);

  function handleAdded() {
    setItemKey(null);
    loadItems();
    window.scrollTo({ top: 0, behavior: 'smooth' }); // the new item appears in the list at the top
  }

  function handleEdited() {
    setEditing(null);
    loadItems();
  }

  async function removeItem(id: number) {
    setFailed(false);
    try {
      await api.delete(`/items/${id}`);
    } catch (error) {
      // 409: it was reserved or lent in the meantime; reloading shows that.
      if (errorStatus(error) !== 409) setFailed(true);
    }
    loadItems();
  }

  async function changeTrustedOnly(id: number, value: boolean) {
    setFailed(false);
    try {
      await api.patch(`/items/${id}`, { trusted_only: value });
    } catch {
      setFailed(true);
    }
    loadItems();
  }

  return (
    <section className="wide-page">
      <h1>{t(lang, 'myItems.title')}</h1>
      {failed && <p className="error">{t(lang, 'common.error')}</p>}

      <div className="two-col-layout">
        <div>
          {!items && !failed && <p>{t(lang, 'common.loading')}</p>}
          {items?.length === 0 && <p className="empty surface-card">{t(lang, 'myItems.empty')}</p>}
          {items && items.length > 0 && (
            <ul className="my-items">
              {items.map((item) => (
                <MyItemRow
                  key={item.id}
                  item={item}
                  lang={lang}
                  onEdit={setEditing}
                  onRemove={removeItem}
                  onTrustedOnly={changeTrustedOnly}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="add-item-panel">
          <h2 className="section-title-mobile">{t(lang, 'myItems.add')}</h2>
          <p className="hint">{t(lang, 'myItems.pick')}</p>
          <Catalog lang={lang} onPick={setItemKey} />
        </div>
      </div>

      {itemKey && (
        <AddItemDialog lang={lang} itemKey={itemKey} onSaved={handleAdded} onClose={() => setItemKey(null)} />
      )}
      {editing && (
        <AddItemDialog
          lang={lang}
          itemKey={editing.item_key}
          item={editing}
          onSaved={handleEdited}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
