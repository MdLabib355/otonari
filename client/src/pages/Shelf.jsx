import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { CATEGORIES, findItem } from '../data/catalog.js';
import { categoryName, displayName, itemName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// The neighborhood shelf: everything the neighbors in my group are happy to lend.
export default function Shelf() {
  const { user, group, lang } = useUser();
  const [items, setItems] = useState(null); // null = still loading
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    api
      .get('/api/shelf')
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  return (
    <section>
      <h1>{t(lang, 'shelf.title', { group: group.name })}</h1>
      <p className="subtitle">{t(lang, 'shelf.subtitle')}</p>

      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      {!items && !failed && <p>{t(lang, 'common.loading')}</p>}
      {items?.length === 0 && (
        <div className="empty-state">
          <p className="empty">{t(lang, 'shelf.empty')}</p>
          <Link to="/my-items" className="button-primary button-link">
            {t(lang, 'shelf.addFirst')}
          </Link>
        </div>
      )}
      {items?.length > 0 && (
        <ShelfGrid items={items} category={category} setCategory={setCategory} myId={user.id} lang={lang} />
      )}
    </section>
  );
}

function ShelfGrid({ items, category, setCategory, myId, lang }) {
  const categoryOf = (item) => findItem(item.item_key)?.category;

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

function ItemCard({ item, mine, lang }) {
  const badge = mine ? 'mine' : item.status;
  return (
    <Link to={`/item/${item.id}`} className="item-card">
      {item.photo_url ? (
        <img className="item-thumb" src={item.photo_url} alt="" loading="lazy" />
      ) : (
        <span className="item-emoji" aria-hidden="true">
          {findItem(item.item_key)?.emoji}
        </span>
      )}
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
