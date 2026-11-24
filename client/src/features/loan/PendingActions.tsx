import { useEffect, useState } from 'react';
import type { Lang, Loan, MyLoans, Trust } from '../../../../shared/types.ts';
import TipCard from '../../components/TipCard.tsx';
import TrustLine from '../../components/TrustLine.tsx';
import { api } from '../../core/api.ts';
import { t } from '../../i18n/index.ts';
import type { Act } from './loanProps.ts';

interface Props {
  loan: Loan;
  iAmLender: boolean;
  trust: Trust | null;
  lang: Lang;
  busy: boolean;
  act: Act;
}

// While a request waits for an answer: the lender answers, the borrower can still cancel.
export default function PendingActions({ loan, iAmLender, trust, lang, busy, act }: Props) {
  if (!iAmLender) {
    return (
      <div className="actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => act('cancel')}>
          {t(lang, 'loan.cancel')}
        </button>
      </div>
    );
  }

  const datesOver = Date.parse(loan.end_at) <= Date.now(); // too late for a yes
  const decline = (reason: 'default' | 'busy') => act('decline', { reason });
  return (
    <div className="actions">
      <FirstRequestTip loanId={loan.id} lang={lang} />
      {trust && <TrustLine lang={lang} trust={trust} />}
      {datesOver ? (
        <p className="notice">{t(lang, 'loan.datesOver')}</p>
      ) : (
        <button type="button" className="button-primary" disabled={busy} onClick={() => act('accept')}>
          {t(lang, 'loan.accept')}
        </button>
      )}
      <button type="button" className="button-secondary" disabled={busy} onClick={() => decline('default')}>
        {t(lang, 'loan.decline')}
      </button>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => decline('busy')}>
        {t(lang, 'loan.declineBusy')}
      </button>
    </div>
  );
}

// Only on the first request a lender ever gets from someone who uses another language: don't worry.
function FirstRequestTip({ loanId, lang }: { loanId: number; lang: Lang }) {
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    api
      .get<MyLoans>('/api/loans')
      .then(({ lending }) => {
        const otherLanguage = lending.filter((loan) => loan.other_lang !== lang);
        setIsFirst(otherLanguage.at(-1)?.id === loanId); // newest first, so the last one is the first
      })
      .catch(() => setIsFirst(false));
  }, [loanId, lang]);

  return isFirst && <TipCard lang={lang} tipKey="forLender" />;
}
