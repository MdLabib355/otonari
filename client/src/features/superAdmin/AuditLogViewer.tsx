import { useState } from 'react';
import type { AuditCategory, AuditLogEntry } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';

const FILTERS: ('All' | AuditCategory)[] = [
  'All',
  'Group',
  'Member',
  'Shelf',
  'Loan',
  'Notice',
  'Catalog',
  'Break-Glass',
  'System',
];

function csvCell(value: string | number | null): string {
  const s = value === null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export default function AuditLogViewer({ logs }: { logs: AuditLogEntry[] }) {
  const [category, setCategory] = useState<'All' | AuditCategory>('All');

  const visible = category === 'All' ? logs : logs.filter((entry) => entry.category === category);

  function exportCsv() {
    const header = ['id', 'created_at', 'category', 'actor_label', 'actor_role', 'action', 'target_type', 'target_id', 'reason', 'detail'];
    const lines = [
      header.join(','),
      ...visible.map((e) =>
        [e.id, e.created_at, e.category, e.actor_label, e.actor_role, e.action, e.target_type, e.target_id, e.reason, e.detail]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `otonari-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="sa-page-head">
        <div>
          <h1>Immutable Audit Log</h1>
          <p>Append-only governance trail (newest first). Records cannot be edited or deleted.</p>
        </div>
        <div className="ga-actions">
          <span className="ga-badge ga-badge-muted">{visible.length} record(s)</span>
          <button type="button" className="ga-btn ga-btn-soft" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="sa-card">
        <div style={{ marginBottom: 14 }}>
          <ChipGroup
            label="Audit category"
            options={FILTERS.map((f) => ({ value: f, label: f }))}
            value={category}
            onChange={setCategory}
          />
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Category</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="Timestamp" className="sa-mono">{entry.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td data-label="Category">
                    <span className="ga-badge ga-badge-indigo">{entry.category}</span>
                  </td>
                  <td data-label="Actor">
                    <strong>{entry.actor_label}</strong>
                  </td>
                  <td data-label="Action">
                    <span className="ga-code-chip">{entry.action}</span>
                  </td>
                  <td data-label="Target">
                    {entry.target_type} #{entry.target_id}
                  </td>
                  <td data-label="Detail">{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
