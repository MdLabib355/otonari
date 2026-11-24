import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ItemDetails } from '../../../../shared/types.ts';
import { ArrowLeftIcon, LockIcon } from '../../components/Icons.tsx';
import { api, errorStatus } from '../../core/api.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { displayName, itemDisplayTitle, spotName, t } from '../../i18n/index.ts';
import { useMember, useUser } from '../../core/UserContext.ts';
import BorrowForm from './BorrowForm.tsx';

// The item page: what it is, whose it is, and the tap-only borrow request.
export default function ItemPage() {
  const { id } = useParams();
  const { user, lang } = useMember();
  const [item, setItem] = useState<ItemDetails | null>(null);
  const [problem, setProblem] = useState<'missing' | 'failed' | null>(null);

  function loadItem() {
    api
      .get<ItemDetails>(`/items/${id}`)
      .then(setItem)
      .catch((error) => setProblem([403, 404].includes(errorStatus(error) ?? 0) ? 'missing' : 'failed'));
  }

  useEffect(() => {
    loadItem();
  }, [id]);

  const backLink = (
    <Link to="/" className="back-link">
      <ArrowLeftIcon className="icon-sm" /> {t(lang, 'common.back')}
    </Link>
  );

  if (problem === 'missing') {
    return (
      <section className="narrow-page surface-card">
        {backLink}
        <p className="notice">{t(lang, 'borrow.notAvailable')}</p>
      </section>
    );
  }
  if (problem === 'failed') return <p className="error narrow-page">{t(lang, 'common.error')}</p>;
  if (!item) return <p className="narrow-page">{t(lang, 'common.loading')}</p>;

  const mine = item.owner_id === user.id;
  const alreadyAsked = Boolean(item.my_loan_id);
  const canAsk = !mine && !alreadyAsked;
  const maxDays = item.max_days === 1 ? t(lang, 'item.maxDay') : t(lang, 'item.maxDays', { n: item.max_days });

  return (
    <section className="narrow-page surface-card">
      {backLink}
      <header className="item-header">
        <ItemVisual itemKey={item.item_key} categoryKey={item.category_key} photo={item.photo} alt="" size="lg" />
        <div>
          <h1>{itemDisplayTitle(lang, item.item_key, item.custom_title)}</h1>
          <p className="muted">
            {mine ? t(lang, 'shelf.mine') : t(lang, 'shelf.from', { name: displayName(lang, item.owner_nickname) })}
          </p>
        </div>
      </header>
      <p className="item-facts">
        {maxDays} · {t(lang, 'item.spot', { spot: spotName(lang, item.spot) })}
      </p>

      {alreadyAsked && <AlreadyAsked item={item} />}
      {canAsk && <AskForItem item={item} onRefused={loadItem} />}
    </section>
  );
}

// The request form, or the reason why I can't ask for this item.
interface AskProps {
  item: ItemDetails;
  onRefused: () => void;
}

function AskForItem({ item, onRefused }: AskProps) {
  const { lang } = useUser();
  if (item.status !== 'available') return <p className="notice">{t(lang, 'borrow.notAvailable')}</p>;
  if (!item.allowed_for_me) {
    return (
      <p className="notice inline-icon-text">
        <LockIcon className="icon-sm" /> {t(lang, 'trust.explain')}
      </p>
    );
  }
  return <BorrowForm item={item} onRefused={onRefused} />;
}

// I already have a pending or accepted request for this item: link to it instead of asking again.
function AlreadyAsked({ item }: { item: ItemDetails }) {
  const { lang } = useUser();
  const navigate = useNavigate();
  return (
    <>
      <p className="notice">{t(lang, 'borrow.alreadyAsked', { name: displayName(lang, item.owner_nickname) })}</p>
      <button type="button" className="button-primary" onClick={() => navigate(`/loan/${item.my_loan_id}`)}>
        {t(lang, 'borrow.openLoan')}
      </button>
    </>
  );
}
