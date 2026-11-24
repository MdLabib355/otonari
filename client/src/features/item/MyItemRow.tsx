import type { Lang, MyItem } from '../../../../shared/types.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { itemDisplayTitle, spotName, t } from '../../i18n/index.ts';
import TrustedSwitch from './TrustedSwitch.tsx';

// One of my items. It can't be removed while it is reserved or lent.
interface MyItemRowProps {
  item: MyItem;
  lang: Lang;
  onEdit: (item: MyItem) => void;
  onRemove: (id: number) => void;
  onTrustedOnly: (id: number, value: boolean) => void;
}

export default function MyItemRow({ item, lang, onEdit, onRemove, onTrustedOnly }: MyItemRowProps) {
  const canRemove = item.status === 'available';
  const days = item.max_days === 1 ? t(lang, 'item.maxDay') : t(lang, 'item.maxDays', { n: item.max_days });

  return (
    <li className="my-item">
      <ItemVisual itemKey={item.item_key} categoryKey={item.category_key} photo={item.photo} alt="" />
      <div className="my-item-text">
        <strong>{itemDisplayTitle(lang, item.item_key, item.custom_title)}</strong>
        <span className="muted">
          {days} · {t(lang, 'item.spot', { spot: spotName(lang, item.spot) })}
        </span>
        {item.approval_status === 'pending' && (
          <span className="badge badge-approval">{t(lang, 'itemRequest.pending')}</span>
        )}
        {!canRemove && <span className="hint">{t(lang, 'myItems.cantRemove')}</span>}
      </div>
      <button type="button" className="button-secondary" onClick={() => onEdit(item)}>
        {t(lang, 'myItems.edit')}
      </button>
      {canRemove ? (
        <button type="button" className="button-secondary" onClick={() => onRemove(item.id)}>
          {t(lang, 'myItems.remove')}
        </button>
      ) : (
        <span className={`badge badge-${item.status}`}>{t(lang, `shelf.${item.status}`)}</span>
      )}
      <TrustedSwitch lang={lang} checked={item.trusted_only} onChange={(value) => onTrustedOnly(item.id, value)} />
      {item.trusted_only && <p className="hint">{t(lang, 'trust.hint')}</p>}
    </li>
  );
}
