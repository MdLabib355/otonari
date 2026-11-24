import type { Lang, Loan, LoanItem, Person } from '../../../../shared/types.ts';
import { findItem } from '../../data/catalog.ts';
import { displayName, formatDate, itemName, t } from '../../i18n/index.ts';

interface Props {
  loan: Loan;
  item: LoanItem;
  other: Person;
  lang: Lang;
}

export default function LoanHeader({ loan, item, other, lang }: Props) {
  return (
    <>
      <header className="item-header">
        <span className="item-header-emoji" aria-hidden="true">
          {findItem(item.item_key)?.emoji}
        </span>
        <div>
          <h1>{itemName(lang, item.item_key)}</h1>
          <p className="muted">{t(lang, 'loans.with', { name: displayName(lang, other.nickname) })}</p>
        </div>
      </header>
      <p className="loan-facts">
        {t(lang, 'loan.period', { start: formatDate(lang, loan.start_at), end: formatDate(lang, loan.end_at) })}
      </p>
      <span className={`badge badge-${loan.status}`}>{t(lang, `status.${loan.status}`)}</span>
    </>
  );
}
