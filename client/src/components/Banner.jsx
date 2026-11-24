import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { openEventStream } from '../api.js';
import { findItem } from '../data/catalog.js';
import { displayName, formatDate, formatNumber, itemName, renderPhrase, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';
import { BellIcon, BlockIcon, BuildingIcon, ClockIcon, CloseIcon, UserIcon, WarningIcon } from './Icons.jsx';
import SpeakButton from './SpeakButton.jsx';
import TrustLine from './TrustLine.jsx';

const FALLBACK_POLL_MS = 10_000;
const RECONNECT_MS = 2_500;

// Responsive App Header + 3-Layer Notification UI:
//   1. Full-bleed sticky 3-zone header (Brand + Group left | Centered Nav | User pill + Bell right)
//      with floating Notification Center popover.
//   2. Persistent sticky return-due / overdue bar until return photo is uploaded.
//   3. Live unread message banner, driven instantly (<100 ms) by authenticated SSE + 30s fallback poll.
export default function Banner({ tabs = [] }) {
  const { user, group, lang, inbox, dueLoans, refreshInbox, markAllRead, logout } = useUser();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notifAnchorRef = useRef(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close floating Notification Center popover on outside click or Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    function onPointerDown(event) {
      if (notifAnchorRef.current && !notifAnchorRef.current.contains(event.target)) {
        setDrawerOpen(false);
      }
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

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
  const GroupIcon = group?.type === 'block' ? BlockIcon : BuildingIcon;

  return (
    <div className="banner-area">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="header-brand">
            <span className="header-logo">{t(lang, 'appName')}</span>
            {group?.name && (
              <span className="header-group">
                <GroupIcon className="icon-xs" />
                <span className="header-group-name">{group.name}</span>
              </span>
            )}
          </Link>

          <nav className="desktop-nav" aria-label={t(lang, 'appName')}>
            {tabs.map(({ to, Icon, label, end }) => (
              <NavLink key={to} to={to} end={end} className="desktop-nav-link">
                <Icon className="icon-sm" />
                <span>{t(lang, label)}</span>
                {to === '/loans' && inbox.length > 0 && (
                  <span className="count-badge">{formatNumber(lang, inbox.length)}</span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="header-right">
            {user?.nickname && (
              <Link to="/settings" className="header-user-pill" title={t(lang, 'nav.settings')}>
                <UserIcon className="icon-sm" />
                <span>{displayName(lang, user.nickname)}</span>
              </Link>
            )}

            <div className="notif-anchor" ref={notifAnchorRef}>
            <button
              type="button"
              className={drawerOpen ? 'notif-bell notif-bell-open' : 'notif-bell'}
              aria-expanded={drawerOpen}
              aria-label={t(lang, 'notifications.title')}
              title={t(lang, 'notifications.title')}
              onClick={() => setDrawerOpen((open) => !open)}
            >
              <BellIcon />
              {inbox.length > 0 && <span className="count-badge notif-bell-badge">{formatNumber(lang, inbox.length)}</span>}
            </button>

            {drawerOpen && (
              <NotificationCenter
                inbox={inbox}
                lang={lang}
                onMarkAllRead={markAllRead}
                onClose={() => setDrawerOpen(false)}
              />
            )}
            </div>
          </div>
        </div>
      </header>

      {(urgentDue || (!drawerOpen && newestMessage)) && (
        <div className="alerts-container" role="status">
          {urgentDue && <DueBanner loan={urgentDue} extraCount={extraDueCount} lang={lang} />}
          {!drawerOpen && newestMessage && <BannerMessage message={newestMessage} lang={lang} />}
        </div>
      )}
    </div>
  );
}

function NotificationCenter({ inbox, lang, onMarkAllRead, onClose }) {
  const newestFirst = [...inbox].reverse();
  return (
    <div className="notif-drawer" role="dialog" aria-label={t(lang, 'notifications.title')}>
      <div className="notif-drawer-header">
        <strong>{t(lang, 'notifications.title')}</strong>
        <div className="notif-drawer-actions">
          {newestFirst.length > 0 && (
            <button type="button" className="text-button text-button-sm" onClick={onMarkAllRead}>
              {t(lang, 'notifications.markAllRead')}
            </button>
          )}
          <button type="button" className="icon-close-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="icon-sm" />
          </button>
        </div>
      </div>

      {newestFirst.length === 0 ? (
        <p className="muted notif-empty">{t(lang, 'notifications.empty')}</p>
      ) : (
        <ul className="notif-list">
          {newestFirst.map((msg) => {
            const text = renderPhrase(lang, msg.phrase_key, msg.params);
            const isReminder = msg.from_user_id === null;
            const title = isReminder
              ? t(lang, 'banner.reminder')
              : t(lang, 'banner.new', { name: displayName(lang, msg.from_nickname) });
            return (
              <li key={msg.id} className="notif-item">
                <Link to={`/loan/${msg.loan_id}`} className="notif-item-link" onClick={onClose}>
                  <span className="notif-emoji" aria-hidden="true">
                    {findItem(msg.item_key)?.emoji}
                  </span>
                  <div className="notif-item-text">
                    <strong className="inline-icon-text">
                      {isReminder && <BellIcon className="icon-sm" />}
                      {title}
                    </strong>
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
      <span className="banner-icon-wrap" aria-hidden="true">
        {loan.overdue ? <WarningIcon /> : <ClockIcon />}
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
        <SpeakButton lang={lang} text={isReminder ? text : `${title}\n${text}`} />
        <Link to={`/loan/${message.loan_id}`} className="banner-open">
          {t(lang, 'banner.open')}
        </Link>
      </div>
    </div>
  );
}
