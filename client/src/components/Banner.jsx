import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { findItem } from '../data/catalog.js';
import { displayName, renderPhrase, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const POLL_EVERY_MS = 5000;

// The new-message banner at the top of every page. It asks the server for unread messages every
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
    <div className="banner-area" role="status">
      {message && (
        <div className="banner">
          <span className="banner-emoji" aria-hidden="true">
            {findItem(message.item_key)?.emoji}
          </span>
          <div className="banner-text">
            <strong>
              {message.from_user_id === null
                ? `🔔 ${t(lang, 'banner.reminder')}`
                : t(lang, 'banner.new', { name: displayName(lang, message.from_nickname) })}
            </strong>
            <p>{renderPhrase(lang, message.phrase_key, message.params)}</p>
          </div>
          <Link to={`/loan/${message.loan_id}`} className="banner-open">
            {t(lang, 'banner.open')}
          </Link>
        </div>
      )}
    </div>
  );
}
