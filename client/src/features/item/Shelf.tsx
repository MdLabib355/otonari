import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lang, ShelfItem } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { CATEGORIES, findItem } from '../../data/catalog.ts';
import { categoryName, displayName, itemName, t } from '../../i18n/index.ts';
import { useMember } from '../../core/UserContext.ts';

// The neighborhood shelf: everything the neighbors in my group are happy to lend.
export default function Shelf() {
  const { user, group, lang } = useMember();
  const [items, setItems] = useState<ShelfItem[] | null>(null); // null = still loading
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    api
      .get<ShelfItem[]>('/api/shelf')
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  return (
    <section>
      <h1>{t(lang, 'shelf.title', { group: group.name })}</h1>
      <p className="subtitle">{t(lang, 'shelf.subtitle')}</p>

      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      {!items && !failed && <p>{t(lang, 'common.loading')}</p>}
      {items?.length === 0 && <p className="empty">{t(lang, 'shelf.empty')}</p>}
      {items && items.length > 0 && (
        <ShelfGrid items={items} category={category} setCategory={setCategory} myId={user.id} lang={lang} />
      )}
    </section>
  );
}

interface ShelfGridProps {
  items: ShelfItem[];
  category: string;
  setCategory: (category: string) => void;
  myId: number;
  lang: Lang;
}

function ShelfGrid({ items, category, setCategory, myId, lang }: ShelfGridProps) {
  const categoryOf = (item: ShelfItem) => findItem(item.item_key)?.category;

  // Only offer the categories that actually have something on the shelf.
  const categoryOptions = [
    { value: 'all', label: t(lang, 'shelf.allCategories') },
    ...CATEGORIES.filter((key) => items.some((item) => categoryOf(item) === key)).map((key) => ({
      value: key,
      label: categoryName(lang, key),
    })),
  ];
  const visibleItems = items.filter((item) => category === 'all' || categoryOf(item) === category);

  return (
    <>
      <ChipGroup options={categoryOptions} value={category} onChange={setCategory} />
      <div className="item-grid">
        {visibleItems.map((item) => (
          <ItemCard key={item.id} item={item} mine={item.owner_id === myId} lang={lang} />
        ))}
      </div>
    </>
  );
}

// One card on the shelf. Tapping it opens the item page.
function ItemCard({ item, mine, lang }: { item: ShelfItem; mine: boolean; lang: Lang }) {
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
          🔒
        </span>
      )}
    </Link>
  );
}
