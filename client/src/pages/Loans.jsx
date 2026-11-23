import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { findItem } from '../data/catalog.js';
import { displayName, formatDate, formatNumber, itemName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const ACTIVE_STATUSES = new Set(['pending', 'accepted', 'active']);

// All my loans, as borrower and as lender, grouped into Active & waiting vs. Past history.
export default function Loans() {
  const { lang, inbox } = useUser();
  const [loans, setLoans] = useState(null);
  const [failed, setFailed] = useState(false);

  const unreadIds = inbox.map((message) => message.id).join(',');
  useEffect(() => {
    api
      .get('/api/loans')
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

function LoanList({ title, loans, lang }) {
  const active = loans.filter((loan) => ACTIVE_STATUSES.has(loan.status));
  const past = loans.filter((loan) => !ACTIVE_STATUSES.has(loan.status));

  return (
    <div className="loan-list">
      <h2>{title}</h2>
      {loans.length === 0 && <p className="muted">{t(lang, 'loans.empty')}</p>}
      {active.length > 0 && (
        <>
          <h3 className="catalog-heading">{t(lang, 'loans.activeSection')}</h3>
          {active.map((loan) => (
            <LoanCard key={loan.id} loan={loan} lang={lang} />
          ))}
        </>
      )}
      {past.length > 0 && (
        <>
          <h3 className="catalog-heading">{t(lang, 'loans.pastSection')}</h3>
          {past.map((loan) => (
            <LoanCard key={loan.id} loan={loan} lang={lang} />
          ))}
        </>
      )}
    </div>
  );
}

function LoanCard({ loan, lang }) {
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
      {loan.unread > 0 && <span className="count-badge">{formatNumber(lang, loan.unread)}</span>}
    </Link>
  );
}
