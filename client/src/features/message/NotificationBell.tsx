import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { InboxMessage, Lang } from '../../../../shared/types.ts';
import { BellIcon, CloseIcon } from '../../components/Icons.tsx';
import { useMember } from '../../core/UserContext.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { displayName, renderPhrase, t } from '../../i18n/index.ts';

// The bell in the header: opens a list of all my unread messages.
export default function NotificationBell() {
  const { lang, inbox, markRead } = useMember();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // A tap outside, or Escape, closes the list.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!area.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const newestFirst = [...inbox].reverse();

  return (
    <div className="notif-anchor" ref={area}>
      <button
        type="button"
        className={open ? 'notif-bell notif-bell-open' : 'notif-bell'}
        aria-expanded={open}
        aria-label={t(lang, 'notifications.title')}
        title={t(lang, 'notifications.title')}
        onClick={() => setOpen(!open)}
      >
        <BellIcon />
        {inbox.length > 0 && <span className="count-badge notif-bell-badge">{inbox.length}</span>}
      </button>

      {open && (
        <div className="notif-drawer" role="dialog" aria-label={t(lang, 'notifications.title')}>
          <div className="notif-drawer-header">
            <strong>{t(lang, 'notifications.title')}</strong>
            <div className="notif-drawer-actions">
              {inbox.length > 0 && (
                <button
                  type="button"
                  className="text-button text-button-sm"
                  onClick={() => markRead(inbox.map((message) => message.id))}
                >
                  {t(lang, 'notifications.markAllRead')}
                </button>
              )}
              <button
                type="button"
                className="icon-close-btn"
                aria-label={t(lang, 'common.close')}
                onClick={() => setOpen(false)}
              >
                <CloseIcon className="icon-sm" />
              </button>
            </div>
          </div>

          {inbox.length === 0 ? (
            <p className="muted notif-empty">{t(lang, 'notifications.empty')}</p>
          ) : (
            <ul className="notif-list">
              {newestFirst.map((message) => (
                <NotificationItem key={message.id} message={message} lang={lang} onOpen={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationItemProps {
  message: InboxMessage;
  lang: Lang;
  onOpen: () => void;
}

function NotificationItem({ message, lang, onOpen }: NotificationItemProps) {
  return (
    <li>
      <Link to={`/loan/${message.loan_id}`} className="notif-item-link" onClick={onOpen}>
        <ItemVisual itemKey={message.item_key} categoryKey={message.category_key} alt="" size="sm" />
        <div className="notif-item-text">
          <strong className="inline-icon-text">
            {message.from_nickname === null && <BellIcon className="icon-sm" />}
            {message.from_nickname === null
              ? t(lang, 'banner.reminder')
              : t(lang, 'banner.new', { name: displayName(lang, message.from_nickname) })}
          </strong>
          <p>{renderPhrase(lang, message.phrase_key, message.params)}</p>
        </div>
      </Link>
    </li>
  );
}
