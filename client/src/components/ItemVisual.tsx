import { useEffect, useState } from 'react';
import { categoryIconKey, findItem, useCatalog } from '../data/catalog.ts';
import { ItemIcon } from './ItemIcons.tsx';

interface Props {
  itemKey: string;
  photo?: string | null;
  categoryKey?: string | null; // if it isn't the one of the catalog
  alt: string; // '' where the name is written next to it
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'card';
}

// What an item looks like: the owner's photo, or the drawing of that kind of item.
export default function ItemVisual({ itemKey, photo, categoryKey, alt, size = 'md' }: Props) {
  useCatalog();
  // The photo that could not be loaded. A signed URL works for an hour, so the next one gets a new try.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  useEffect(() => {
    setFailedPhoto(null);
  }, [photo]);

  const category = categoryKey ?? findItem(itemKey)?.category ?? 'default';
  return (
    <span className={`item-visual item-visual-${size}`}>
      {photo && photo !== failedPhoto ? (
        <img
          src={photo}
          alt={alt}
          className="item-visual-img"
          loading="lazy"
          onError={() => setFailedPhoto(photo)}
        />
      ) : (
        <span className="item-visual-icon" role={alt ? 'img' : undefined} aria-label={alt || undefined}>
          <ItemIcon itemKey={itemKey} categoryIcon={categoryIconKey(category)} />
        </span>
      )}
    </span>
  );
}
