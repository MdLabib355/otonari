import { Link } from 'react-router-dom';
import type { Lang, ShelfItem } from '../../../../shared/types.ts';
import { LockSolidIcon } from '../../components/Icons.tsx';
import { findItem } from '../../data/catalog.ts';
import { displayName, itemName, t } from '../../i18n/index.ts';

// One card on the shelf. Tapping it opens the item page.
export default function ItemCard({ item, mine, lang }: { item: ShelfItem; mine: boolean; lang: Lang }) {
  const badge = mine ? 'mine' : item.status; // available | reserved | lent | mine
  return (
    <Link to={`/item/${item.id}`} className="item-card">
      <span className="item-emoji" aria-hidden="true">
        {findItem(item.item_key)?.emoji}
      </span>
      <strong>{itemName(lang, item.item_key)}</strong>
      {!mine && (
        <span className="muted">{t(lang, 'shelf.from', { name: displayName(lang, item.owner_nickname) })}</span>
      )}
      <span className={`badge badge-${badge}`}>{t(lang, `shelf.${badge}`)}</span>
      {item.trusted_only && (
        <span className="badge lock-badge" role="img" aria-label={t(lang, 'trust.only')} title={t(lang, 'trust.only')}>
          <LockSolidIcon />
        </span>
      )}
    </Link>
  );
}
