import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { openEventStream } from '../api.js';
import { findItem } from '../data/catalog.js';
import { displayName, formatDate, formatNumber, itemName, renderPhrase, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';
import SpeakButton from './SpeakButton.jsx';
import TrustLine from './TrustLine.jsx';

const FALLBACK_POLL_MS = 30_000;
const RECONNECT_MS = 2_500;

// 3-Layer Notification UI at the top of every screen:
//   1. Top bar with 🔔 Notification Center (opens full list of ALL piled-up unread notifications + Mark all read).
//   2. Persistent sticky return-due / overdue bar until return photo is uploaded.
//   3. Live unread message banner, driven instantly (<100 ms) by authenticated SSE + 30s fallback poll.
export default function Banner() {
  const { group, lang, inbox, dueLoans, refreshInbox, markAllRead, logout } = useUser();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer when navigating between screens.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Authenticated SSE live subscription with automatic reconnect + 30s fallback poll.
  useEffect(() => {
    let active = true;
    let controller = null;
    let reconnectTimer = null;

    refreshInbox();

    async function connect() {
      if (!active) return;
      controller = new AbortController();
      try {
        await openEventStream({
          signal: controller.signal,
          onEvent: () => refreshInbox(),
          onRevoked: () => {
            active = false;
            logout();
          },
        });
      } catch {
        // Stream aborted or disconnected; reconnect if still active.
      }
      if (active) {
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      }
    }

    connect();

    const pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshInbox();
    }, FALLBACK_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshInbox();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      controller?.abort();
    };
  }, []);

  const visibleDue = (dueLoans ?? []).filter((loan) => pathname !== `/loan/${loan.id}`);
  const urgentDue = visibleDue[0] ?? null;
  const extraDueCount = Math.max(0, visibleDue.length - 1);
  const newestMessage = inbox.filter((unread) => pathname !== `/loan/${unread.loan_id}`).at(-1);

  return (
    <div className="banner-area" role="status">
      <div className="topbar">
        <span className="topbar-group">{group?.name}</span>
        <button
          type="button"
          className="notif-bell"
          aria-expanded={drawerOpen}
          aria-label={t(lang, 'notifications.title')}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span aria-hidden="true">🔔</span>
          <span>{t(lang, 'notifications.title')}</span>
          {inbox.length > 0 && <span className="count-badge">{formatNumber(lang, inbox.length)}</span>}
        </button>
      </div>

      {drawerOpen && (
        <NotificationCenter
          inbox={inbox}
          lang={lang}
          onMarkAllRead={markAllRead}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {urgentDue && <DueBanner loan={urgentDue} extraCount={extraDueCount} lang={lang} />}
      {!drawerOpen && newestMessage && <BannerMessage message={newestMessage} lang={lang} />}
    </div>
  );
}

function NotificationCenter({ inbox, lang, onMarkAllRead, onClose }) {
  const newestFirst = [...inbox].reverse();
  return (
    <div className="notif-drawer">
      <div className="notif-drawer-header">
        <strong>{t(lang, 'notifications.title')}</strong>
        {newestFirst.length > 0 && (
          <button type="button" className="text-button" onClick={onMarkAllRead}>
            {t(lang, 'notifications.markAllRead')}
          </button>
        )}
      </div>

      {newestFirst.length === 0 ? (
        <p className="muted">{t(lang, 'notifications.empty')}</p>
      ) : (
        <ul className="notif-list">
          {newestFirst.map((msg) => {
            const text = renderPhrase(lang, msg.phrase_key, msg.params);
            const isReminder = msg.from_user_id === null;
            const title = isReminder
              ? `🔔 ${t(lang, 'banner.reminder')}`
              : t(lang, 'banner.new', { name: displayName(lang, msg.from_nickname) });
            return (
              <li key={msg.id} className="notif-item">
                <Link to={`/loan/${msg.loan_id}`} className="notif-item-link" onClick={onClose}>
                  <span className="notif-emoji" aria-hidden="true">
                    {findItem(msg.item_key)?.emoji}
                  </span>
                  <div className="notif-item-text">
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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
