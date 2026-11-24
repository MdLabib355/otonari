import { useState } from 'react';
import type { GroupAdminItem, Lang } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';
import { api, ApiError } from '../../core/api.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { categoryName, displayName, itemDisplayTitle, spotName, t } from '../../i18n/index.ts';
import ItemEditor from './ItemEditor.tsx';

type ShelfFilter = 'all' | 'available' | 'lent' | 'trusted' | 'hidden';

export interface ShelfTabProps {
  lang: Lang;
  items: GroupAdminItem[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export default function ShelfTab({ lang, items, onRefresh, onNotify }: ShelfTabProps) {
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [editing, setEditing] = useState<GroupAdminItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const requests = items.filter((item) => item.approval_status === 'pending');
  const shelfItems = items.filter((item) => item.approval_status === 'approved');

  const filtered = shelfItems.filter((item) => {
    if (filter === 'available') return item.status === 'available' && !item.hidden_at;
    if (filter === 'lent') return item.status === 'lent' || item.status === 'reserved';
    if (filter === 'trusted') return item.trusted_only;
    if (filter === 'hidden') return Boolean(item.hidden_at);
    return true;
  });

  function moderate(item: GroupAdminItem, change: { trusted_only?: boolean; hidden?: boolean }) {
    return run(item, () => api.patch(`/group-admin/items/${item.id}/moderate`, change));
  }

  async function run(item: GroupAdminItem, action: () => Promise<unknown>) {
    setBusyId(item.id);
    try {
      await action();
      await onRefresh();
      onNotify(itemDisplayTitle(lang, item.item_key, item.custom_title));
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    } finally {
      setBusyId(null);
    }
  }

  const filterOptions: { value: ShelfFilter; label: string }[] = [
    { value: 'all', label: t(lang, 'groupAdmin.filterAll') },
    { value: 'available', label: t(lang, 'groupAdmin.filterAvailable') },
    { value: 'lent', label: t(lang, 'groupAdmin.filterLent') },
    { value: 'trusted', label: t(lang, 'groupAdmin.filterTrustedOnly') },
    { value: 'hidden', label: t(lang, 'groupAdmin.filterHidden') },
  ];

  return (
    <div className="ga-stack">
      <div className="ga-card">
        <h2>
          {t(lang, 'groupAdmin.itemRequests')} ({requests.length})
        </h2>
        {requests.length === 0 && <p className="ga-meta">{t(lang, 'groupAdmin.itemRequestsNone')}</p>}
        <div className="ga-stack">
          {requests.map((item) => (
            <div key={item.id} className="ga-card ga-card-pending">
              <div className="ga-identity ga-card-top">
                <ItemVisual itemKey={item.item_key} categoryKey={item.category_key} photo={item.photo} alt="" size="lg" />
                <div className="ga-identity-text">
                  <div className="ga-entity-name">{itemDisplayTitle(lang, item.item_key, item.custom_title)}</div>
                  <p className="ga-meta">
                    {t(lang, 'shelf.from', { name: displayName(lang, item.owner_nickname) })} ·{' '}
                    {item.category_key ? categoryName(lang, item.category_key) : t(lang, 'itemRequest.adminDecides')}
                  </p>
                </div>
              </div>
              <div className="ga-actions">
                <button
                  type="button"
                  className="ga-btn ga-btn-primary"
                  disabled={busyId === item.id}
                  onClick={() => setEditing(item)}
                >
                  {t(lang, 'groupAdmin.reviewItem')}
                </button>
                <button
                  type="button"
                  className="ga-btn ga-btn-danger"
                  disabled={busyId === item.id}
                  onClick={() => run(item, () => api.post(`/group-admin/items/${item.id}/reject`))}
                >
                  {t(lang, 'groupAdmin.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2>
          {t(lang, 'groupAdmin.shelfTitle')} ({shelfItems.length})
        </h2>
        <p className="ga-meta">{t(lang, 'groupAdmin.shelfSub')}</p>
      </div>

      <ChipGroup
        label={t(lang, 'groupAdmin.shelfTitle')}
        options={filterOptions}
        value={filter}
        onChange={setFilter}
      />

      <div className="ga-stack">
        {filtered.length === 0 ? (
          <div className="ga-card">
            <p className="ga-meta">{t(lang, 'shelf.noMatch')}</p>
          </div>
        ) : (
          filtered.map((item) => {
            const label = itemDisplayTitle(lang, item.item_key, item.custom_title);
            const spot = spotName(lang, item.spot);
            const isHidden = Boolean(item.hidden_at);
            const isLocked = item.status !== 'available';
            const badgeClass = isHidden
              ? 'ga-badge-muted'
              : item.status === 'available'
                ? 'ga-badge-green'
                : 'ga-badge-indigo';
            const statusText = isHidden
              ? t(lang, 'groupAdmin.statusHidden')
              : item.status === 'available'
                ? t(lang, 'shelf.available')
                : item.status === 'reserved'
                  ? t(lang, 'shelf.reserved')
                  : t(lang, 'shelf.lent');

            return (
              <div key={item.id} className={`ga-card ${isHidden ? 'ga-card-dimmed' : ''}`}>
                <div className="ga-card-top">
                  <div className="ga-identity">
                    <ItemVisual itemKey={item.item_key} categoryKey={item.category_key} photo={item.photo} alt="" />
                    <div>
                      <div className="ga-entity-name">
                        <span>{label}</span>
                        <span className={`ga-badge ${badgeClass}`}>{statusText}</span>
                        {item.trusted_only && (
                          <span className="ga-badge ga-badge-indigo">{t(lang, 'trust.only')}</span>
                        )}
                      </div>
                      <p className="ga-meta">
                        {t(lang, 'shelf.from', { name: displayName(lang, item.owner_nickname) })} ·{' '}
                        {t(lang, 'item.spot', { spot })} ·{' '}
                        {item.max_days === 1
                          ? t(lang, 'item.maxDay')
                          : t(lang, 'item.maxDays', { n: item.max_days })}
                      </p>
                    </div>
                  </div>
                  <SpeakButton lang={lang} text={`${label}. ${spot}.`} />
                </div>

                <div className="ga-actions">
                  <button
                    type="button"
                    className="ga-btn ga-btn-soft"
                    disabled={busyId === item.id}
                    onClick={() => setEditing(item)}
                  >
                    {t(lang, 'groupAdmin.editItem')}
                  </button>
                  <label className="ga-btn">
                    <input
                      type="checkbox"
                      className="switch"
                      checked={item.trusted_only}
                      disabled={busyId === item.id}
                      onChange={() => moderate(item, { trusted_only: !item.trusted_only })}
                    />
                    <span>{t(lang, 'trust.only')}</span>
                  </label>

                  <button
                    type="button"
                    className={`ga-btn ${isHidden ? 'ga-btn-primary' : ''}`}
                    disabled={busyId === item.id || (!isHidden && isLocked)}
                    onClick={() => moderate(item, { hidden: !isHidden })}
                  >
                    {isHidden ? t(lang, 'groupAdmin.restoreItem') : t(lang, 'groupAdmin.hideItem')}
                  </button>
                </div>

                {isLocked && !isHidden && <div className="ga-note">{t(lang, 'groupAdmin.cannotHideLent')}</div>}
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <ItemEditor
          key={editing.id}
          lang={lang}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(title) => {
            setEditing(null);
            onNotify(title);
            onRefresh().catch(() => onNotify(t(lang, 'common.error'), true));
          }}
        />
      )}
    </div>
  );
}
