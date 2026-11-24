import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ShelfItem } from '../../../../shared/types.ts';
import { ArrowRightIcon } from '../../components/Icons.tsx';
import { api } from '../../core/api.ts';
import { useMember } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import ItemCard from './ItemCard.tsx';
import NeighborShelf from './NeighborShelf.tsx';

// The neighborhood shelf: what my neighbors are happy to lend, and below it what I lend myself.
export default function Shelf() {
  const { user, group, lang } = useMember();
  const [items, setItems] = useState<ShelfItem[] | null>(null); // null = still loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get<ShelfItem[]>('/shelf')
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  const neighborItems = items?.filter((item) => item.owner_id !== user.id) ?? [];
  const myItems = items?.filter((item) => item.owner_id === user.id) ?? [];

  return (
    <section className="wide-page">
      <div className="page-header-row">
        <div>
          <h1>{t(lang, 'shelf.title', { group: group.name })}</h1>
          <p className="subtitle">{t(lang, 'shelf.subtitle')}</p>
        </div>
      </div>

      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      {!items && !failed && <p>{t(lang, 'common.loading')}</p>}
      {items?.length === 0 && (
        <div className="empty-state surface-card narrow-page">
          <p className="empty">{t(lang, 'shelf.empty')}</p>
          <Link to="/my-items" className="button-primary button-link">
            {t(lang, 'shelf.addFirst')}
          </Link>
        </div>
      )}

      {neighborItems.length > 0 && <NeighborShelf items={neighborItems} lang={lang} />}

      {myItems.length > 0 && (
        <div className="my-shelf-section">
          <div className="my-shelf-header">
            <h2>
              {t(lang, 'myItems.title')} <span className="section-count">{myItems.length}</span>
            </h2>
            <Link to="/my-items" className="section-manage-link inline-icon-text">
              <span>{t(lang, 'nav.myItems')}</span>
              <ArrowRightIcon className="icon-xs" />
            </Link>
          </div>
          <div className="item-grid">
            {myItems.map((item) => (
              <ItemCard key={item.id} item={item} mine lang={lang} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
