import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lang, LoanSummary, MyLoans } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { findItem } from '../data/catalog.ts';
import { displayName, formatDate, itemName, t } from '../i18n/index.ts';
import { useUser } from '../UserContext.ts';

// All my loans, as borrower and as lender, newest first.
export default function Loans() {
  const { lang, inbox } = useUser();
  const [loans, setLoans] = useState<MyLoans | null>(null); // { borrowing, lending }, null = still loading
  const [failed, setFailed] = useState(false);

  // Load on start, and again whenever a message arrives (a new request, an answer, ...).
  const unreadIds = inbox.map((message) => message.id).join(',');
  useEffect(() => {
    api
      .get<MyLoans>('/api/loans')
      .then((result) => {
        setLoans(result);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [unreadIds]);

  return (
    <section>
      <h1>{t(lang, 'loans.title')}</h1>
      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      {!loans && !failed && <p>{t(lang, 'common.loading')}</p>}
      {loans && (
        <>
          <LoanList title={t(lang, 'loans.borrowing')} loans={loans.borrowing} lang={lang} />
          <LoanList title={t(lang, 'loans.lending')} loans={loans.lending} lang={lang} />
        </>
      )}
    </section>
  );
}

function LoanList({ title, loans, lang }: { title: string; loans: LoanSummary[]; lang: Lang }) {
  return (
    <div className="loan-list">
      <h2>{title}</h2>
      {loans.length === 0 && <p className="muted">{t(lang, 'loans.empty')}</p>}
      {loans.map((loan) => (
        <LoanCard key={loan.id} loan={loan} lang={lang} />
      ))}
    </div>
  );
}

// One loan. Tapping it opens the conversation.
function LoanCard({ loan, lang }: { loan: LoanSummary; lang: Lang }) {
  return (
    <Link to={`/loan/${loan.id}`} className="loan-card">
      <span className="item-emoji" aria-hidden="true">
        {findItem(loan.item_key)?.emoji}
      </span>
      <div className="loan-card-text">
        <strong>{itemName(lang, loan.item_key)}</strong>
        <span className="muted">{t(lang, 'loans.with', { name: displayName(lang, loan.other_nickname) })}</span>
        <span className="muted">
          {t(lang, 'loan.period', { start: formatDate(lang, loan.start_at), end: formatDate(lang, loan.end_at) })}
        </span>
        <span className={`badge badge-${loan.status}`}>{t(lang, `status.${loan.status}`)}</span>
      </div>
      {loan.unread > 0 && <span className="count-badge">{loan.unread}</span>}
    </Link>
  );
}
