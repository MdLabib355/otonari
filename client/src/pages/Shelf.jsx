import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { CATEGORIES, findItem } from '../data/catalog.js';
import { categoryName, displayName, formatNumber, itemName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// The neighborhood shelf: everything the neighbors in my group are happy to lend.
export default function Shelf() {
  const { user, group, lang } = useUser();
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    api
      .get('/api/shelf')
      .then(setItems)
      .catch(() => setFailed(true));
    api.get('/api/group/stats').then(setStats).catch(() => {});
  }, []);

  return (
    <section>
      <h1>{t(lang, 'shelf.title', { group: group.name })}</h1>
      <p className="subtitle">{t(lang, 'shelf.subtitle')}</p>

      {stats && (
        <p className="stats-strip">
          🤝{' '}
          {t(lang, 'shelf.statsLine', {
            members: formatNumber(lang, stats.members),
            items: formatNumber(lang, stats.items),
            crossLang: formatNumber(lang, stats.cross_language_loans),
          })}
        </p>
      )}

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
        <ShelfGrid
          items={items}
          category={category}
          setCategory={setCategory}
          search={search}
          setSearch={setSearch}
          availableOnly={availableOnly}
          setAvailableOnly={setAvailableOnly}
          myId={user.id}
          lang={lang}
        />
      )}
    </section>
  );
}

function ShelfGrid({ items, category, setCategory, search, setSearch, availableOnly, setAvailableOnly, myId, lang }) {
  const categoryOf = (item) => findItem(item.item_key)?.category;

  const categoryOptions = [
    { value: 'all', label: t(lang, 'shelf.allCategories') },
    ...CATEGORIES.filter((key) => items.some((item) => categoryOf(item) === key)).map((key) => ({
      value: key,
      label: categoryName(lang, key),
    })),
  ];

  const q = search.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (category !== 'all' && categoryOf(item) !== category) return false;
    if (availableOnly && (item.status !== 'available' || item.paused || item.owner_id === myId)) return false;
    if (q) {
      const label = itemName(lang, item.item_key).toLowerCase();
      const owner = item.owner_nickname.toLowerCase();
      if (!label.includes(q) && !owner.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="shelf-filters">
        <input
          type="search"
          className="text-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(lang, 'shelf.searchPlaceholder')}
          aria-label={t(lang, 'shelf.searchPlaceholder')}
        />
        <button
          type="button"
          className={availableOnly ? 'chip selected' : 'chip'}
          aria-pressed={availableOnly}
          onClick={() => setAvailableOnly((v) => !v)}
        >
          {t(lang, 'shelf.availableOnly')}
        </button>
      </div>
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
  const badge = item.paused ? 'paused' : mine ? 'mine' : item.status;
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
