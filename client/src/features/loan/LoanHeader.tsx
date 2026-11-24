import type { Lang, Loan, LoanItem, Person } from '../../../../shared/types.ts';
import Avatar from '../../components/Avatar.tsx';
import ItemVisual from '../../components/ItemVisual.tsx';
import LoanStepper from './LoanStepper.tsx';
import { displayName, formatDate, itemDisplayTitle, t } from '../../i18n/index.ts';

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
        <ItemVisual itemKey={item.item_key} categoryKey={item.category_key} photo={item.photo} alt="" size="lg" />
        <div>
          <h1>{itemDisplayTitle(lang, item.item_key, item.custom_title)}</h1>
          <p className="muted inline-icon-text">
            <Avatar url={other.avatar ?? null} />
            {t(lang, 'loans.with', { name: displayName(lang, other.nickname) })}
          </p>
        </div>
      </header>
      <p className="loan-facts">
        {t(lang, 'loan.period', { start: formatDate(lang, loan.start_at), end: formatDate(lang, loan.end_at) })}
      </p>
      <span className={`badge badge-${loan.status}`}>{t(lang, `status.${loan.status}`)}</span>
      <LoanStepper status={loan.status} lang={lang} />
    </>
  );
}
