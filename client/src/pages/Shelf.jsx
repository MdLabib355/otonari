import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ArrowRightIconWrapped, CheckIcon, CloseIcon, LockSolidIcon, SearchIcon, UsersIcon } from '../components/Icons.jsx';
import { CATEGORIES, findItem } from '../data/catalog.js';
import { categoryName, displayName, formatNumber, itemName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// The neighborhood shelf: neighbors' borrowable items on top with clean 2-row filter toolbar,
// and my own shared items neatly separated below.
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

  const neighborItems = items ? items.filter((item) => item.owner_id !== user.id) : [];
  const myItems = items ? items.filter((item) => item.owner_id === user.id) : [];

  return (
    <section className="wide-page">
      <div className="page-header-row">
        <div>
          <h1>{t(lang, 'shelf.title', { group: group.name })}</h1>
          <p className="subtitle">{t(lang, 'shelf.subtitle')}</p>
        </div>
        {stats && (
          <p className="stats-strip inline-icon-text">
            <UsersIcon className="icon-xs" />
            <span>
              {t(lang, 'shelf.statsLine', {
                members: formatNumber(lang, stats.members),
                items: formatNumber(lang, stats.items),
                crossLang: formatNumber(lang, stats.cross_language_loans),
              })}
            </span>
          </p>
        )}
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
      {items?.length > 0 && (
        <>
          {neighborItems.length > 0 && (
            <NeighborShelfGrid
              items={neighborItems}
              category={category}
              setCategory={setCategory}
              search={search}
              setSearch={setSearch}
              availableOnly={availableOnly}
              setAvailableOnly={setAvailableOnly}
              lang={lang}
            />
          )}

          {myItems.length > 0 && (
            <div className="my-shelf-section">
              <div className="my-shelf-header">
                <h2>
                  {t(lang, 'myItems.title')}{' '}
                  <span className="section-count">{formatNumber(lang, myItems.length)}</span>
                </h2>
                <Link to="/my-items" className="section-manage-link inline-icon-text">
                  <span>{t(lang, 'nav.myItems')}</span>
                  <ArrowRightIconWrapped className="icon-xs" />
                </Link>
              </div>
              <div className="item-grid">
                {myItems.map((item) => (
                  <ItemCard key={item.id} item={item} mine lang={lang} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NeighborShelfGrid({ items, category, setCategory, search, setSearch, availableOnly, setAvailableOnly, lang }) {
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
    if (availableOnly && (item.status !== 'available' || item.paused)) return false;
    if (q) {
      const label = itemName(lang, item.item_key).toLowerCase();
      const owner = item.owner_nickname.toLowerCase();
      if (!label.includes(q) && !owner.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="shelf-toolbar">
        <div className="shelf-search-row">
          <div className="search-field">
            <SearchIcon className="search-icon icon-sm" />
            <input
              type="search"
              className="text-input search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'shelf.searchPlaceholder')}
              aria-label={t(lang, 'shelf.searchPlaceholder')}
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                aria-label="Clear"
                onClick={() => setSearch('')}
              >
                <CloseIcon className="icon-xs" />
              </button>
            )}
          </div>
          <button
            type="button"
            className={availableOnly ? 'available-toggle selected' : 'available-toggle'}
            aria-pressed={availableOnly}
            onClick={() => setAvailableOnly((v) => !v)}
          >
            {availableOnly && <CheckIcon className="icon-xs" />}
            <span>{t(lang, 'shelf.availableOnly')}</span>
          </button>
        </div>

        <div className="filter-strip" role="group" aria-label={t(lang, 'shelf.allCategories')}>
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === category ? 'filter-chip selected' : 'filter-chip'}
              aria-pressed={option.value === category}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="empty-filter-state">
          <p className="muted" style={{ margin: 0 }}>
            {t(lang, 'shelf.empty')}
          </p>
          {(search || category !== 'all' || availableOnly) && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setSearch('');
                setCategory('all');
                setAvailableOnly(false);
              }}
            >
              {t(lang, 'shelf.allCategories')}
            </button>
          )}
        </div>
      ) : (
        <div className="item-grid">
          {visibleItems.map((item) => (
            <ItemCard key={item.id} item={item} mine={false} lang={lang} />
          ))}
        </div>
      )}
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
          <LockSolidIcon />
        </span>
      )}
    </Link>
  );
}
