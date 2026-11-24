import { useState } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import FilterStrip from '../../components/FilterStrip.tsx';
import { useCatalog } from '../../data/catalog.ts';
import { categoryName, itemName, t } from '../../i18n/index.ts';

// Everything that can be lent, by category.
export default function Catalog({ lang, onPick }: { lang: Lang; onPick: (itemKey: string) => void }) {
  const { items, categories } = useCatalog();
  const [category, setCategory] = useState('all');
  const visibleCategories = category === 'all' ? categories : [category];
  const options = [
    { value: 'all', label: t(lang, 'shelf.allCategories') },
    ...categories.map((key) => ({ value: key, label: categoryName(lang, key) })),
  ];

  return (
    <>
      <FilterStrip label={t(lang, 'shelf.allCategories')} options={options} value={category} onChange={setCategory} />
      {visibleCategories.map((key) => (
        <div key={key}>
          <h3 className="catalog-heading">{categoryName(lang, key)}</h3>
          <div className="catalog-grid">
            {items.filter((item) => item.category === key).map((item) => (
              <button key={item.key} type="button" className="catalog-item" onClick={() => onPick(item.key)}>
                <span className="catalog-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <span>{itemName(lang, item.key)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
