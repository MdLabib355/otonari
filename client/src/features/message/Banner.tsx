import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { InboxMessage, Lang } from '../../../../shared/types.ts';
import { findItem } from '../../data/catalog.ts';
import { displayName, renderPhrase, t } from '../../i18n/index.ts';
import { useUser } from '../../core/UserContext.ts';
import { BellIcon } from '../../components/Icons.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';
import TrustLine from '../../components/TrustLine.tsx';

const POLL_EVERY_MS = 5000;

// The new-message banner, below the header of every page. It asks the server for unread messages every
// 5 seconds (simple polling) and shows the newest one in my language.
// "Open" goes to the loan page, which marks that loan's messages as read.
export default function Banner() {
  const { lang, inbox, refreshInbox } = useUser();
  const { pathname } = useLocation();

  useEffect(() => {
    refreshInbox();
    const timer = setInterval(refreshInbox, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  // No banner for the conversation that is already open: its messages appear on the page itself.
  const message = inbox.filter((unread) => pathname !== `/loan/${unread.loan_id}`).at(-1);

  // The empty "status" box is always there, so screen readers notice when a message appears in it.
  return (
    <div className="alerts-container" role="status">
      {message && <BannerMessage message={message} lang={lang} />}
    </div>
  );
}

function BannerMessage({ message, lang }: { message: InboxMessage; lang: Lang }) {
  const text = renderPhrase(lang, message.phrase_key, message.params);
  const isReminder = message.from_nickname === null; // reminders have no sender
  const title =
    message.from_nickname === null
      ? t(lang, 'banner.reminder')
      : t(lang, 'banner.new', { name: displayName(lang, message.from_nickname) });

  return (
    <div className="banner">
      <span className="banner-emoji" aria-hidden="true">
        {findItem(message.item_key)?.emoji}
      </span>
      <div className="banner-text">
        <strong className="inline-icon-text">
          {isReminder && <BellIcon className="icon-sm" />}
          {title}
        </strong>
        <p>{text}</p>
        {message.borrower_trust && <TrustLine lang={lang} trust={message.borrower_trust} />}
      </div>
      <div className="banner-buttons">
        {/* Reminder texts already begin with "Reminder", so only other messages need their title read. */}
        <SpeakButton lang={lang} text={isReminder ? text : `${title}\n${text}`} />
        <Link to={`/loan/${message.loan_id}`} className="banner-open">
          {t(lang, 'banner.open')}
        </Link>
      </div>
    </div>
  );
}
