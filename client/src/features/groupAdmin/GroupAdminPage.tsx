import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type {
  AuditLogEntry,
  Group,
  GroupAdminDashboard,
  GroupAdminItem,
  GroupAdminLoan,
  GroupMemberSummary,
} from '../../../../shared/types.ts';
import { LoansIcon, QrCodeIcon, ShelfIcon, UsersIcon } from '../../components/Icons.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';
import { api } from '../../core/api.ts';
import { useMember } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import LoansTab from './LoansTab.tsx';
import NeighborsTab from './NeighborsTab.tsx';
import PosterNoticesTab from './PosterNoticesTab.tsx';
import ShelfTab from './ShelfTab.tsx';

type AdminSubTab = 'neighbors' | 'shelf' | 'loans' | 'poster';

export default function GroupAdminPage({ onAlertCountChange }: { onAlertCountChange?: (count: number) => void }) {
  const { user, group, lang, setMe } = useMember();
  const [tab, setTab] = useState<AdminSubTab>('neighbors');
  const [dashboard, setDashboard] = useState<GroupAdminDashboard | null>(null);
  const [members, setMembers] = useState<GroupMemberSummary[]>([]);
  const [items, setItems] = useState<GroupAdminItem[]>([]);
  const [loans, setLoans] = useState<GroupAdminLoan[]>([]);
  const [activityLog, setActivityLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null);

  const isAdmin = user.group_role === 'group_admin' || user.group_role === 'co_admin';

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    window.setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 3400);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!isAdmin) return;
    const [dash, memberRows, itemRows, loanRows, logs] = await Promise.all([
      api.get<GroupAdminDashboard>('/group-admin/dashboard'),
      api.get<GroupMemberSummary[]>('/group-admin/members'),
      api.get<GroupAdminItem[]>('/group-admin/items'),
      api.get<GroupAdminLoan[]>('/group-admin/loans'),
      api.get<AuditLogEntry[]>('/group-admin/activity-log'),
    ]);
    setDashboard(dash);
    setMembers(memberRows);
    setItems(itemRows);
    setLoans(loanRows);
    setActivityLog(logs);
    onAlertCountChange?.(dash.pending_count + dash.overdue_loan_count + dash.flagged_loan_count);
  }, [isAdmin, onAlertCountChange]);

  useEffect(() => {
    if (!isAdmin) return;
    refreshAll()
      .catch(() => showToast(t(lang, 'common.error'), true))
      .finally(() => setLoading(false));
  }, [isAdmin, refreshAll, lang, showToast]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  function handleGroupUpdated(updated: Group) {
    setMe({ user, group: updated });
    setDashboard((prev) => (prev ? { ...prev, group: updated } : prev));
  }

  const currentGroup = dashboard?.group ?? group;
  const pendingCount = dashboard?.pending_count ?? 0;
  const attentionLoans = (dashboard?.overdue_loan_count ?? 0) + (dashboard?.flagged_loan_count ?? 0);
  const roleBadge =
    user.group_role === 'group_admin' ? t(lang, 'groupAdmin.roleBadge') : t(lang, 'groupAdmin.coAdminBadge');

  return (
    <section className="ga-page">
      <div className="ga-header print-button">
        <div className="ga-header-title">
          <h1>{t(lang, 'groupAdmin.title')}</h1>
          <span className="ga-badge ga-badge-indigo">{roleBadge}</span>
          <span className="ga-code-chip">{currentGroup.code}</span>
        </div>
        <SpeakButton lang={lang} text={`${t(lang, 'groupAdmin.title')}. ${currentGroup.name}.`} />
      </div>

      <nav className="ga-subtabs print-button" aria-label={t(lang, 'groupAdmin.title')}>
        <button
          type="button"
          className={`ga-subtab ${tab === 'neighbors' ? 'active' : ''}`}
          onClick={() => setTab('neighbors')}
        >
          <UsersIcon className="icon-sm" />
          <span>{t(lang, 'groupAdmin.tabNeighbors')}</span>
          {pendingCount > 0 && <span className="ga-count">{pendingCount}</span>}
        </button>

        <button
          type="button"
          className={`ga-subtab ${tab === 'shelf' ? 'active' : ''}`}
          onClick={() => setTab('shelf')}
        >
          <ShelfIcon className="icon-sm" />
          <span>{t(lang, 'groupAdmin.tabShelf')}</span>
        </button>

        <button
          type="button"
          className={`ga-subtab ${tab === 'loans' ? 'active' : ''}`}
          onClick={() => setTab('loans')}
        >
          <LoansIcon className="icon-sm" />
          <span>{t(lang, 'groupAdmin.tabLoans')}</span>
          {attentionLoans > 0 && <span className="ga-count">{attentionLoans}</span>}
        </button>

        <button
          type="button"
          className={`ga-subtab ${tab === 'poster' ? 'active' : ''}`}
          onClick={() => setTab('poster')}
        >
          <QrCodeIcon className="icon-sm" />
          <span>{t(lang, 'groupAdmin.tabPoster')}</span>
        </button>
      </nav>

      {toast && (
        <div className={`ga-toast print-button ${toast.isError ? 'ga-toast-error' : ''}`} role="status">
          {toast.text}
        </div>
      )}

      {loading ? (
        <p>{t(lang, 'common.loading')}</p>
      ) : (
        <>
          {tab === 'neighbors' && (
            <NeighborsTab
              lang={lang}
              me={user}
              group={currentGroup}
              members={members}
              onRefresh={refreshAll}
              onGroupUpdated={handleGroupUpdated}
              onNotify={showToast}
            />
          )}
          {tab === 'shelf' && (
            <ShelfTab lang={lang} items={items} onRefresh={refreshAll} onNotify={showToast} />
          )}
          {tab === 'loans' && (
            <LoansTab lang={lang} loans={loans} onRefresh={refreshAll} onNotify={showToast} />
          )}
          {tab === 'poster' && (
            <PosterNoticesTab
              lang={lang}
              group={currentGroup}
              activeAnnouncement={dashboard?.active_announcement ?? null}
              activityLog={activityLog}
              onGroupUpdated={handleGroupUpdated}
              onRefresh={refreshAll}
              onNotify={showToast}
            />
          )}
        </>
      )}
    </section>
  );
}
