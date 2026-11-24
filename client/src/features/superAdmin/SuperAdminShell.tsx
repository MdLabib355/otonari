import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdminUser,
  AuditLogEntry,
  CatalogItemRecord,
  DisputeSummary,
  SuperAdminGroupSummary,
  SuperAdminOverview,
  User,
} from '../../../../shared/types.ts';
import {
  BookOpenIcon,
  BuildingIcon,
  DocumentTextIcon,
  ShieldIcon,
  SquaresIcon,
  UsersIcon,
} from '../../components/Icons.tsx';
import { api } from '../../core/api.ts';
import { syncDynamicCatalog } from '../../data/catalog.ts';
import AccountsDirectory from './AccountsDirectory.tsx';
import AuditLogViewer from './AuditLogViewer.tsx';
import CatalogPhraseStudio from './CatalogPhraseStudio.tsx';
import GroupsDirectory from './GroupsDirectory.tsx';
import PlatformOverview from './PlatformOverview.tsx';
import SafetyQueue from './SafetyQueue.tsx';

export type SuperTab = 'overview' | 'groups' | 'accounts' | 'catalog' | 'disputes' | 'audit';

export default function SuperAdminShell({
  user,
  onSignOut,
}: {
  user: User;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<SuperTab>('overview');
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [groups, setGroups] = useState<SuperAdminGroupSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [catalog, setCatalog] = useState<CatalogItemRecord[]>([]);
  const [disputes, setDisputes] = useState<DisputeSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    window.setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 3500);
  }, []);

  const refreshAll = useCallback(async () => {
    const [ov, grp, acc, cat, disp, logs] = await Promise.all([
      api.get<SuperAdminOverview>('/super-admin/overview'),
      api.get<SuperAdminGroupSummary[]>('/super-admin/groups'),
      api.get<AdminUser[]>('/admin/users'),
      api.get<CatalogItemRecord[]>('/super-admin/catalog'),
      api.get<DisputeSummary[]>('/super-admin/disputes'),
      api.get<AuditLogEntry[]>('/super-admin/audit-logs'),
    ]);
    setOverview(ov);
    setGroups(grp);
    setUsers(acc);
    setCatalog(cat);
    setDisputes(disp);
    setAuditLogs(logs);
    syncDynamicCatalog(cat.filter((c) => c.is_active));
  }, []);

  useEffect(() => {
    refreshAll()
      .catch(() => notify('Failed to load Super Admin data', true))
      .finally(() => setLoading(false));
  }, [refreshAll, notify]);

  const openDisputes = disputes.filter((d) => d.status === 'open').length;

  return (
    <div className="sa-root">
      <header className="sa-topbar" role="banner">
        <div className="sa-topbar-left">
          <div className="sa-brand-mark" aria-hidden="true">
            隣
          </div>
          <div>
            <div className="sa-brand-title">Otonari (お隣) · Super Admin</div>
            <div className="sa-brand-sub">Platform-Wide Neighborhood Governance</div>
          </div>
        </div>

        <div className="sa-topbar-right">
          {overview && (
            <>
              <span className="sa-status-chip">
                <span className="sa-dot sa-dot-green" />
                PostgreSQL · {overview.db_latency_ms}ms
              </span>
              <span className="sa-status-chip">
                <span className="sa-dot sa-dot-indigo" />
                Reminder Job: {overview.reminder_health.interval_seconds}s
              </span>
              <span className="sa-status-chip">
                <span className="sa-dot sa-dot-amber" />
                DEMO_MODE: {overview.demo_mode ? 'ON' : 'OFF'}
              </span>
            </>
          )}
          <span className="ga-badge ga-badge-indigo">{user.nickname || user.email}</span>
          <Link to={user.group_id ? '/' : '/join'} className="ga-btn">
            {user.group_id ? 'Neighbor App' : 'Join a Group'}
          </Link>
          <button type="button" className="ga-btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="sa-shell">
        <aside className="sa-sidebar" aria-label="Super Admin Navigation">
          <div>
            <div className="sa-sidebar-label">Platform Controls</div>
            <nav className="sa-nav">
              <button
                type="button"
                className={`sa-nav-btn ${tab === 'overview' ? 'active' : ''}`}
                onClick={() => setTab('overview')}
              >
                <span className="sa-nav-left">
                  <SquaresIcon className="icon-sm" />
                  Overview
                </span>
              </button>

              <button
                type="button"
                className={`sa-nav-btn ${tab === 'groups' ? 'active' : ''}`}
                onClick={() => setTab('groups')}
              >
                <span className="sa-nav-left">
                  <BuildingIcon className="icon-sm" />
                  Groups &amp; Admin Rescue
                </span>
                <span className="ga-badge ga-badge-indigo">{groups.length}</span>
              </button>

              <button
                type="button"
                className={`sa-nav-btn ${tab === 'accounts' ? 'active' : ''}`}
                onClick={() => setTab('accounts')}
              >
                <span className="sa-nav-left">
                  <UsersIcon className="icon-sm" />
                  Accounts &amp; Users
                </span>
                <span className="ga-badge ga-badge-muted">{users.length}</span>
              </button>

              <button
                type="button"
                className={`sa-nav-btn ${tab === 'catalog' ? 'active' : ''}`}
                onClick={() => setTab('catalog')}
              >
                <span className="sa-nav-left">
                  <BookOpenIcon className="icon-sm" />
                  Fixed Catalog &amp; i18n
                </span>
                <span className="ga-badge ga-badge-muted">{catalog.length}</span>
              </button>

              <button
                type="button"
                className={`sa-nav-btn ${tab === 'disputes' ? 'active' : ''}`}
                onClick={() => setTab('disputes')}
              >
                <span className="sa-nav-left">
                  <ShieldIcon className="icon-sm" />
                  Break-Glass Dispute
                </span>
                <span className={`ga-badge ${openDisputes > 0 ? 'ga-badge-amber' : 'ga-badge-green'}`}>
                  {openDisputes}
                </span>
              </button>

              <button
                type="button"
                className={`sa-nav-btn ${tab === 'audit' ? 'active' : ''}`}
                onClick={() => setTab('audit')}
              >
                <span className="sa-nav-left">
                  <DocumentTextIcon className="icon-sm" />
                  Audit Log
                </span>
                <span className="ga-badge ga-badge-muted">{auditLogs.length}</span>
              </button>
            </nav>
          </div>

          <div className="sa-sidebar-footnote">
            <strong>Privacy-First Governance</strong>
            Condition photos and neighbor messages stay blurred unless unlocked via an audited Break-Glass session.
          </div>
        </aside>

        <main className="sa-main">
          {toast && (
            <div className={`ga-toast ${toast.isError ? 'ga-toast-error' : ''}`} role="status" style={{ marginBottom: 16 }}>
              {toast.text}
            </div>
          )}

          {loading || !overview ? (
            <p>Loading platform console…</p>
          ) : (
            <>
              {tab === 'overview' && (
                <PlatformOverview
                  overview={overview}
                  onNavigate={setTab}
                  onRefresh={refreshAll}
                  onNotify={notify}
                />
              )}
              {tab === 'groups' && (
                <GroupsDirectory groups={groups} onRefresh={refreshAll} onNotify={notify} />
              )}
              {tab === 'accounts' && (
                <AccountsDirectory meId={user.id} users={users} onRefresh={refreshAll} onNotify={notify} />
              )}
              {tab === 'catalog' && (
                <CatalogPhraseStudio catalog={catalog} onRefresh={refreshAll} onNotify={notify} />
              )}
              {tab === 'disputes' && (
                <SafetyQueue disputes={disputes} onRefresh={refreshAll} onNotify={notify} />
              )}
              {tab === 'audit' && <AuditLogViewer logs={auditLogs} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
