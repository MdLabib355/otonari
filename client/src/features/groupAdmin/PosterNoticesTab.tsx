import { useState } from 'react';
import type { AuditLogEntry, Group, GroupAnnouncement, Lang } from '../../../../shared/types.ts';
import SpeakButton from '../../components/SpeakButton.tsx';
import { api, ApiError } from '../../core/api.ts';
import { LANGUAGES } from '../../data/catalog.ts';
import { formatDate, meta, renderPhrase, t } from '../../i18n/index.ts';
import PosterCard from '../group/PosterCard.tsx';

const NOTICE_KEYS = ['notice.welcome', 'notice.newPoster', 'notice.rainySeason', 'notice.entranceTidy'] as const;

export interface PosterNoticesTabProps {
  lang: Lang;
  group: Group;
  activeAnnouncement: GroupAnnouncement | null;
  activityLog: AuditLogEntry[];
  onGroupUpdated: (group: Group) => void;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export default function PosterNoticesTab({
  lang,
  group,
  activeAnnouncement,
  activityLog,
  onGroupUpdated,
  onRefresh,
  onNotify,
}: PosterNoticesTabProps) {
  const [selectedNotice, setSelectedNotice] = useState<string>(
    activeAnnouncement?.phrase_key ?? NOTICE_KEYS[0]
  );
  const [busy, setBusy] = useState(false);

  const isSelectedPinned = activeAnnouncement?.phrase_key === selectedNotice;

  async function rotateCode() {
    setBusy(true);
    try {
      const updated = await api.post<Group>('/group-admin/invite-code/rotate');
      onGroupUpdated(updated);
      await onRefresh();
      onNotify(`${t(lang, 'groupAdmin.rotateCode')}: ${updated.code}`);
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    } finally {
      setBusy(false);
    }
  }

  async function pinNotice() {
    setBusy(true);
    try {
      await api.post<GroupAnnouncement>('/group-admin/announcements', { phrase_key: selectedNotice });
      onGroupUpdated({ ...group, active_announcement_key: selectedNotice });
      await onRefresh();
      onNotify(t(lang, 'groupAdmin.pinBanner'));
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    } finally {
      setBusy(false);
    }
  }

  async function unpinNotice() {
    setBusy(true);
    try {
      await api.delete('/group-admin/announcements/active');
      onGroupUpdated({ ...group, active_announcement_key: null });
      await onRefresh();
      onNotify(t(lang, 'groupAdmin.unpinBanner'));
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ga-stack">
      {/* Printable A4 QR Join Poster (reuses PosterCard) */}
      <div className="ga-card">
        <div className="print-button">
          <h2>{t(lang, 'groupAdmin.posterTitle')}</h2>
          <p className="ga-meta">{t(lang, 'groupAdmin.posterSub')}</p>
        </div>

        <PosterCard name={group.name} city={group.city} code={group.code} />

        <div className="ga-actions print-button" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className="ga-btn ga-btn-soft" disabled={busy} onClick={rotateCode}>
            {t(lang, 'groupAdmin.rotateCode')}
          </button>
          <button type="button" className="ga-btn ga-btn-primary" onClick={() => window.print()}>
            {t(lang, 'poster.print')}
          </button>
        </div>
      </div>

      {/* Structured Building Announcements */}
      <div className="ga-card print-button">
        <h2>{t(lang, 'groupAdmin.noticesTitle')}</h2>
        <p className="ga-meta">{t(lang, 'groupAdmin.noticesSub')}</p>

        <div className="ga-stack" style={{ marginTop: 12 }}>
          {NOTICE_KEYS.map((key) => {
            const pinned = activeAnnouncement?.phrase_key === key;
            return (
              <label
                key={key}
                className={`ga-radio-option ${selectedNotice === key ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="building-notice"
                  value={key}
                  checked={selectedNotice === key}
                  onChange={() => setSelectedNotice(key)}
                />
                <div style={{ flex: 1 }}>
                  <div className="ga-entity-name">
                    <span className="ga-code-chip">{key}</span>
                    {pinned && (
                      <span className="ga-badge ga-badge-green">{t(lang, 'groupAdmin.pinnedBannerTag')}</span>
                    )}
                  </div>
                  <p style={{ margin: '4px 0 0' }}>{renderPhrase(lang, key)}</p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="ga-preview-grid">
          {LANGUAGES.map((locale) => {
            const text = renderPhrase(locale, selectedNotice);
            return (
              <div key={locale} className="ga-preview-box">
                <div className="ga-preview-head">
                  <span>
                    {meta(locale).name} ({locale})
                  </span>
                  <SpeakButton lang={locale} text={text} />
                </div>
                <p style={{ margin: 0 }}>{text}</p>
              </div>
            );
          })}
        </div>

        <div className="ga-actions" style={{ marginTop: 14 }}>
          {isSelectedPinned ? (
            <button type="button" className="ga-btn ga-btn-amber" disabled={busy} onClick={unpinNotice}>
              {t(lang, 'groupAdmin.unpinBanner')}
            </button>
          ) : (
            <button type="button" className="ga-btn ga-btn-primary" disabled={busy} onClick={pinNotice}>
              {t(lang, 'groupAdmin.pinBanner')}
            </button>
          )}
        </div>
      </div>

      {/* Group Activity Log */}
      <div className="ga-card print-button">
        <h2>
          {t(lang, 'groupAdmin.activityTitle')} ({activityLog.length})
        </h2>
        <p className="ga-meta">{t(lang, 'groupAdmin.activitySub')}</p>

        <div className="ga-stack" style={{ marginTop: 12 }}>
          {activityLog.length === 0 ? (
            <p className="ga-meta">{t(lang, 'groupAdmin.activityEmpty')}</p>
          ) : (
            activityLog.slice(0, 25).map((entry) => (
              <div key={entry.id} className="ga-activity-row">
                <div>
                  <strong>{entry.actor_label}</strong> · <span className="ga-code-chip">{entry.action}</span>{' '}
                  <span>{entry.detail}</span>
                </div>
                <span className="ga-mono-time">{formatDate(lang, entry.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
