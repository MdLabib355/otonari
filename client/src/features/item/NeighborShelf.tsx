import { useState } from 'react';
import type { Lang, ShelfItem } from '../../../../shared/types.ts';
import FilterStrip from '../../components/FilterStrip.tsx';
import { CheckIcon, CloseIcon, SearchIcon } from '../../components/Icons.tsx';
import { CATEGORIES, findItem } from '../../data/catalog.ts';
import { categoryName, displayName, itemName, t } from '../../i18n/index.ts';
import ItemCard from './ItemCard.tsx';

// My neighbors' items, with a search field and filters above them. (The search only filters what is
// already on the screen; nothing that is typed here leaves this device.)
export default function NeighborShelf({ items, lang }: { items: ShelfItem[]; lang: Lang }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);

  const categoryOf = (item: ShelfItem) => findItem(item.item_key)?.category;

  // Only offer the categories that actually have something on the shelf.
  const categoryOptions = [
    { value: 'all', label: t(lang, 'shelf.allCategories') },
    ...CATEGORIES.filter((key) => items.some((item) => categoryOf(item) === key)).map((key) => ({
      value: key,
      label: categoryName(lang, key),
    })),
  ];

  const searchText = search.trim().toLowerCase();
  function isVisible(item: ShelfItem) {
    if (category !== 'all' && categoryOf(item) !== category) return false;
    if (availableOnly && item.status !== 'available') return false;
    const texts = [itemName(lang, item.item_key), displayName(lang, item.owner_nickname)];
    return texts.some((text) => text.toLowerCase().includes(searchText));
  }
  const visibleItems = items.filter(isVisible);

  function showAll() {
    setSearch('');
    setCategory('all');
    setAvailableOnly(false);
  }

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
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(lang, 'shelf.searchPlaceholder')}
              aria-label={t(lang, 'shelf.searchPlaceholder')}
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                aria-label={t(lang, 'common.close')}
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
            onClick={() => setAvailableOnly(!availableOnly)}
          >
            {availableOnly && <CheckIcon className="icon-xs" />}
            <span>{t(lang, 'shelf.availableOnly')}</span>
          </button>
        </div>
        <FilterStrip
          label={t(lang, 'shelf.allCategories')}
          options={categoryOptions}
          value={category}
          onChange={setCategory}
        />
      </div>

      {visibleItems.length === 0 ? (
        <div className="empty-filter-state">
          <p className="muted">{t(lang, 'shelf.noMatch')}</p>
          <button type="button" className="button-secondary" onClick={showAll}>
            {t(lang, 'shelf.allCategories')}
          </button>
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
