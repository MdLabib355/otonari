import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { GroupAnnouncement, InboxMessage, Lang } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { displayName, renderPhrase, t } from '../../i18n/index.ts';
import { useUser } from '../../core/UserContext.ts';
import { BellIcon, MegaphoneIcon } from '../../components/Icons.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';
import TrustLine from '../../components/TrustLine.tsx';

const POLL_EVERY_MS = 5000;

// The new-message banner & pinned building announcement, below the header of every page.
export default function Banner() {
  const { user, group, lang, inbox, refreshInbox } = useUser();
  const { pathname } = useLocation();
  const [announcementKey, setAnnouncementKey] = useState<string | null>(group?.active_announcement_key ?? null);

  useEffect(() => {
    setAnnouncementKey(group?.active_announcement_key ?? null);
  }, [group?.active_announcement_key]);

  useEffect(() => {
    if (!user || user.member_status === 'pending') return;
    const poll = () => {
      refreshInbox();
      api
        .get<GroupAnnouncement | null>('/group/announcement')
        .then((ann) => setAnnouncementKey(ann?.phrase_key ?? null))
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [user?.id, user?.member_status]);

  // No banner for the conversation that is already open: its messages appear on the page itself.
  const message = inbox.filter((unread) => pathname !== `/loan/${unread.loan_id}`).at(-1);
  const announcementText = announcementKey ? renderPhrase(lang, announcementKey) : null;

  return (
    <div className="alerts-container" role="status">
      {announcementText && (
        <div className="announcement-banner">
          <div>
            <div className="announcement-banner-tag inline-icon-text">
              <MegaphoneIcon className="icon-xs" />
              {t(lang, 'groupAdmin.pinnedBannerTag')}
            </div>
            <p>{announcementText}</p>
          </div>
          <SpeakButton lang={lang} text={announcementText} />
        </div>
      )}
      {message && <BannerMessage message={message} lang={lang} />}
    </div>
  );
}

function BannerMessage({ message, lang }: { message: InboxMessage; lang: Lang }) {
  const text = renderPhrase(lang, message.phrase_key, message.params);
  const isReminder = message.from_nickname === null;
  const title =
    message.from_nickname === null
      ? t(lang, 'banner.reminder')
      : t(lang, 'banner.new', { name: displayName(lang, message.from_nickname) });

  return (
    <div className="banner">
      <ItemVisual itemKey={message.item_key} alt="" size="sm" />
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
