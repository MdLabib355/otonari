import { useState } from 'react';
import type { GroupAdminItem, Lang } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';
import { api, ApiError } from '../../core/api.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { displayName, itemName, spotName, t } from '../../i18n/index.ts';

type ShelfFilter = 'all' | 'available' | 'lent' | 'trusted' | 'hidden';

export interface ShelfTabProps {
  lang: Lang;
  items: GroupAdminItem[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export default function ShelfTab({ lang, items, onRefresh, onNotify }: ShelfTabProps) {
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = items.filter((item) => {
    if (filter === 'available') return item.status === 'available' && !item.hidden_at;
    if (filter === 'lent') return item.status === 'lent' || item.status === 'reserved';
    if (filter === 'trusted') return item.trusted_only;
    if (filter === 'hidden') return Boolean(item.hidden_at);
    return true;
  });

  async function moderate(item: GroupAdminItem, change: { trusted_only?: boolean; hidden?: boolean }) {
    setBusyId(item.id);
    try {
      await api.patch(`/group-admin/items/${item.id}/moderate`, change);
      await onRefresh();
      onNotify(itemName(lang, item.item_key));
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
      <div>
        <h2>
          {t(lang, 'groupAdmin.shelfTitle')} ({items.length})
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
            const label = itemName(lang, item.item_key);
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
                    <ItemVisual itemKey={item.item_key} photo={item.photo} alt="" />
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
    </div>
  );
}
