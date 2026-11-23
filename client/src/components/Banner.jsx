import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { findItem } from '../data/catalog.js';
import { displayName, formatDate, itemName, renderPhrase, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';
import SpeakButton from './SpeakButton.jsx';
import TrustLine from './TrustLine.jsx';

const POLL_EVERY_MS = 5000;

// Sticky notification area at the top of every screen:
//   1. Persistent return-due / overdue bar for active borrowed items (stays visible until return photo).
//   2. New-message banner for unread messages.
// Pauses polling when the tab is hidden and refreshes immediately on return.
export default function Banner() {
  const { lang, inbox, dueLoans, refreshInbox } = useUser();
  const { pathname } = useLocation();

  useEffect(() => {
    refreshInbox();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshInbox();
    }, POLL_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshInbox();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const visibleDue = (dueLoans ?? []).filter((loan) => pathname !== `/loan/${loan.id}`);
  const urgentDue = visibleDue[0] ?? null;
  const extraDueCount = Math.max(0, visibleDue.length - 1);

  const message = inbox.filter((unread) => pathname !== `/loan/${unread.loan_id}`).at(-1);

  return (
    <div className="banner-area" role="status">
      {urgentDue && <DueBanner loan={urgentDue} extraCount={extraDueCount} lang={lang} />}
      {message && <BannerMessage message={message} lang={lang} />}
    </div>
  );
}

function DueBanner({ loan, extraCount, lang }) {
  const item = itemName(lang, loan.item_key);
  const text = loan.overdue
    ? t(lang, 'banner.overdue', { item, name: displayName(lang, loan.lender_nickname) })
    : t(lang, 'banner.dueSoon', { item, end: formatDate(lang, loan.end_at) });

  return (
    <div className={loan.overdue ? 'due-banner due-banner-overdue' : 'due-banner'}>
      <span className="banner-emoji" aria-hidden="true">
        {loan.overdue ? '⚠️' : '⏰'}
      </span>
      <div className="banner-text">
        <p>
          <strong>{text}</strong>
          {extraCount > 0 && <span className="due-more"> ({t(lang, 'banner.moreDue', { n: extraCount })})</span>}
        </p>
      </div>
      <div className="banner-buttons">
        <SpeakButton lang={lang} text={text} />
        <Link to={`/loan/${loan.id}`} className="banner-open">
          {t(lang, 'banner.returnNow')}
        </Link>
      </div>
    </div>
  );
}

function BannerMessage({ message, lang }) {
  const text = renderPhrase(lang, message.phrase_key, message.params);
  const isReminder = message.from_user_id === null;
  const title = isReminder
    ? `🔔 ${t(lang, 'banner.reminder')}`
    : t(lang, 'banner.new', { name: displayName(lang, message.from_nickname) });

  return (
    <div className="banner">
      <span className="banner-emoji" aria-hidden="true">
        {findItem(message.item_key)?.emoji}
      </span>
      <div className="banner-text">
        <strong>{title}</strong>
        <p>{text}</p>
        {message.borrower_trust && <TrustLine lang={lang} trust={message.borrower_trust} />}
      </div>
      <div className="banner-buttons">
        <SpeakButton lang={lang} text={isReminder ? text : `${title}\n${text}`} />
        <Link to={`/loan/${message.loan_id}`} className="banner-open">
          {t(lang, 'banner.open')}
        </Link>
      </div>
    </div>
  );
}
