import { useState } from 'react';
import type { StorageCleanupResult, SuperAdminOverview } from '../../../../shared/types.ts';
import { api, ApiError } from '../../core/api.ts';
import type { SuperTab } from './SuperAdminShell.tsx';

export interface PlatformOverviewProps {
  overview: SuperAdminOverview;
  onNavigate: (tab: SuperTab) => void;
  onRefresh: () => Promise<void>;
  onNotify: (text: string, isError?: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PlatformOverview({
  overview,
  onNavigate,
  onRefresh,
  onNotify,
}: PlatformOverviewProps) {
  const [busyOp, setBusyOp] = useState<string | null>(null);

  const isS3 = overview.storage_health.mode === 's3';
  const storagePct = isS3
    ? 0
    : Math.min(
        100,
        Math.round((overview.storage_health.used_bytes / Math.max(1, overview.storage_health.quota_bytes)) * 100)
      );

  async function triggerReminderSweep() {
    setBusyOp('reminders');
    try {
      const res = await api.post<{ checkedLoans: number }>('/super-admin/operations/run-reminders');
      await onRefresh();
      onNotify(`Reminder sweep completed (${res.checkedLoans} active loans checked).`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Reminder check failed', true);
    } finally {
      setBusyOp(null);
    }
  }

  async function runStorageCleanup(dryRun: boolean) {
    setBusyOp('storage');
    try {
      const res = await api.post<StorageCleanupResult>('/super-admin/operations/cleanup-uploads', { dry_run: dryRun });
      await onRefresh();
      if (res.mode === 's3') {
        onNotify('Photo storage is managed in AWS S3; automatic local purge is disabled.');
      } else {
        onNotify(
          dryRun
            ? `Dry-run: ${res.orphan_files.length} orphan file(s) (${formatBytes(res.reclaimed_bytes)}).`
            : `Deleted ${res.deleted_count} orphan file(s), reclaimed ${formatBytes(res.reclaimed_bytes)}.`
        );
      }
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Storage cleanup failed', true);
    } finally {
      setBusyOp(null);
    }
  }

  return (
    <div>
      <div className="sa-page-head">
        <div>
          <h1>Platform Overview</h1>
          <p>Real-time health, group integrity, and governance summary across all Otonari neighborhoods.</p>
        </div>
        <div className="ga-actions">
          <button type="button" className="ga-btn ga-btn-soft" onClick={() => onNavigate('disputes')}>
            Inspect Flagged Disputes
          </button>
          <button type="button" className="ga-btn ga-btn-primary" onClick={() => onNavigate('groups')}>
            Manage Groups
          </button>
        </div>
      </div>

      {overview.orphaned_groups.length > 0 && (
        <div className="sa-alert sa-alert-amber">
          <div>
            <strong>Orphaned Group Alert:</strong>{' '}
            {overview.orphaned_groups.map((g) => `${g.name} (${g.code})`).join(', ')} currently have no active
            Primary Group Admin.
          </div>
          <button type="button" className="ga-btn ga-btn-amber" onClick={() => onNavigate('groups')}>
            Open Admin Rescue →
          </button>
        </div>
      )}

      <div className="sa-kpi-grid">
        <div className="sa-kpi">
          <div className="sa-kpi-label">Active Neighborhoods</div>
          <div className="sa-kpi-value">{overview.active_groups}</div>
          <div className="sa-kpi-note">{overview.total_groups} total registered groups</div>
        </div>
        <div className="sa-kpi">
          <div className="sa-kpi-label">Active Neighbors</div>
          <div className="sa-kpi-value">{overview.total_neighbors}</div>
          <div className="sa-kpi-note">Across building &amp; block circles</div>
        </div>
        <div className="sa-kpi">
          <div className="sa-kpi-label">Active / Completed Loans</div>
          <div className="sa-kpi-value">
            {overview.active_loans}{' '}
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>
              / {overview.completed_loans}
            </span>
          </div>
          <div className="sa-kpi-note">
            {overview.active_loans} in progress · {overview.completed_loans} returned
          </div>
        </div>
        <div className="sa-kpi">
          <div className="sa-kpi-label">Open Escalations</div>
          <div
            className="sa-kpi-value"
            style={{ color: overview.open_disputes > 0 ? 'var(--warn)' : 'var(--success)' }}
          >
            {overview.open_disputes}
          </div>
          <div className="sa-kpi-note">
            {overview.open_disputes > 0 ? 'Awaiting Break-Glass review' : 'All disputes resolved'}
          </div>
        </div>
      </div>

      <div className="sa-health-grid">
        <div className="sa-health-tile">
          <div className="ga-card-top" style={{ marginBottom: 0 }}>
            <strong>Database Engine</strong>
            <span className="ga-badge ga-badge-green">● OK ({overview.db_latency_ms} ms)</span>
          </div>
          <div className="ga-meta">PostgreSQL connected · idempotent schema ready</div>
        </div>

        <div className="sa-health-tile">
          <div className="ga-card-top" style={{ marginBottom: 0 }}>
            <strong>Auto-Reminder Worker ({overview.reminder_health.interval_seconds}s)</strong>
            <span className="ga-badge ga-badge-green">● Running</span>
          </div>
          <div className="ga-meta">
            Last sweep: <span className="sa-mono">{overview.reminder_health.last_run_at ?? 'Pending first tick'}</span>{' '}
            ({overview.reminder_health.last_checked_loans} checked)
          </div>
          <div>
            <button
              type="button"
              className="ga-btn ga-btn-soft"
              disabled={busyOp === 'reminders'}
              onClick={triggerReminderSweep}
            >
              ↻ Trigger Check Now
            </button>
          </div>
        </div>

        <div className="sa-health-tile">
          <div className="ga-card-top" style={{ marginBottom: 0 }}>
            <strong>{isS3 ? 'Photo Storage (AWS S3)' : 'Photo Storage (server/uploads/)'}</strong>
            <span className={`ga-badge ${isS3 ? 'ga-badge-green' : 'ga-badge-indigo'}`}>
              {isS3 ? 'S3 Signed URLs' : `${storagePct}% used`}
            </span>
          </div>
          {isS3 ? (
            <div className="ga-meta">
              Private S3 bucket active · {overview.storage_health.total_files} referenced loan photo(s). Lifecycle
              rules managed in AWS.
            </div>
          ) : (
            <>
              <div
                className="sa-progress"
                role="progressbar"
                aria-valuenow={storagePct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="sa-progress-fill" style={{ width: `${storagePct}%` }} />
              </div>
              <div className="ga-meta">
                {formatBytes(overview.storage_health.used_bytes)} / {formatBytes(overview.storage_health.quota_bytes)}{' '}
                · {overview.storage_health.total_files} file(s), {overview.storage_health.orphan_files} orphan(s)
              </div>
              <div className="ga-actions">
                <button
                  type="button"
                  className="ga-btn"
                  disabled={busyOp === 'storage'}
                  onClick={() => runStorageCleanup(true)}
                >
                  Dry-Run Scan
                </button>
                {overview.storage_health.orphan_files > 0 && (
                  <button
                    type="button"
                    className="ga-btn ga-btn-danger"
                    disabled={busyOp === 'storage'}
                    onClick={() => runStorageCleanup(false)}
                  >
                    Purge Orphans
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-head">
          <div>
            <h2>Recent Platform Activity</h2>
            <p className="ga-meta">Synced directly from the append-only Audit Log.</p>
          </div>
          <button type="button" className="ga-btn" onClick={() => onNavigate('audit')}>
            Open Full Audit Log →
          </button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Category</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {overview.recent_audits.map((entry) => (
                <tr key={entry.id}>
                  <td className="sa-mono">{entry.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    <span className="ga-badge ga-badge-indigo">{entry.category}</span>
                  </td>
                  <td>
                    <span className="ga-code-chip">{entry.action}</span>
                  </td>
                  <td>
                    <strong>{entry.actor_label}</strong>
                  </td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
