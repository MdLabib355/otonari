import { useState, type FormEvent } from 'react';
import type { GroupLifecycleStatus, GroupType, SuperAdminGroupSummary } from '../../../../shared/types.ts';
import { api, ApiError } from '../../core/api.ts';

export interface GroupsDirectoryProps {
  groups: SuperAdminGroupSummary[];
  onRefresh: () => Promise<void>;
  onNotify: (text: string, isError?: boolean) => void;
}

const RESCUE_REASONS = [
  'Device token lost — verified with building manager',
  'Previous admin relocated — neighborhood handover',
  'Emergency backup caretaker appointment',
];

export default function GroupsDirectory({ groups, onRefresh, onNotify }: GroupsDirectoryProps) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<GroupType>('building');
  const [newCity, setNewCity] = useState('Nagasaki');
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [rescueGroup, setRescueGroup] = useState<SuperAdminGroupSummary | null>(null);
  const [rescueUserId, setRescueUserId] = useState<number>(0);
  const [rescueReason, setRescueReason] = useState(RESCUE_REASONS[0]);
  const [busy, setBusy] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = groups.filter(
    (g) =>
      !q ||
      g.name.toLowerCase().includes(q) ||
      g.code.toLowerCase().includes(q) ||
      g.city.toLowerCase().includes(q) ||
      (g.admin_nickname ?? '').toLowerCase().includes(q)
  );

  async function submitCreate(event: FormEvent, createAnyway = false) {
    event.preventDefault();
    setBusy(true);
    setDuplicateNotice(null);
    try {
      await api.post('/super-admin/groups', {
        name: newName.trim(),
        type: newType,
        city: newCity.trim(),
        create_anyway: createAnyway,
      });
      setCreateOpen(false);
      setNewName('');
      await onRefresh();
      onNotify(`Provisioned "${newName.trim()}"`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.existing_name) {
        setDuplicateNotice(`Similar group already exists in ${newCity.trim()}: ${err.data.existing_name}`);
      } else {
        onNotify(err instanceof ApiError ? err.message : 'Failed to create group', true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function rotateCode(group: SuperAdminGroupSummary) {
    setBusy(true);
    try {
      const updated = await api.post<{ code: string }>(`/super-admin/groups/${group.id}/rotate-code`);
      await onRefresh();
      onNotify(`Rotated code for ${group.name}: ${updated.code}`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Code rotation failed', true);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(group: SuperAdminGroupSummary, next: GroupLifecycleStatus) {
    setBusy(true);
    try {
      await api.patch(`/super-admin/groups/${group.id}/status`, { lifecycle_status: next });
      await onRefresh();
      onNotify(`${group.name} -> ${next}`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Status update failed', true);
    } finally {
      setBusy(false);
    }
  }

  async function submitRescue(event: FormEvent) {
    event.preventDefault();
    if (!rescueGroup || !rescueUserId) return;
    setBusy(true);
    try {
      await api.post(`/super-admin/groups/${rescueGroup.id}/rescue-admin`, {
        user_id: rescueUserId,
        reason: rescueReason,
      });
      setRescueGroup(null);
      await onRefresh();
      onNotify(`Reassigned Group Admin for ${rescueGroup.name}`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Admin rescue failed', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="sa-page-head">
        <div>
          <h1>Groups &amp; Admin Rescue</h1>
          <p>Provision residential buildings and blocks, rotate leaked poster join codes, and recover orphaned groups.</p>
        </div>
        <button
          type="button"
          className="ga-btn ga-btn-primary"
          onClick={() => {
            setDuplicateNotice(null);
            setCreateOpen(true);
          }}
        >
          + Create Group
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-card-head">
          <input
            type="search"
            className="text-input ga-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by group name, code, city, or admin…"
          />
          <span className="ga-badge ga-badge-muted">
            Showing {filtered.length} of {groups.length} groups
          </span>
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Join Code</th>
                <th>Type</th>
                <th>City</th>
                <th>Group Admin</th>
                <th>Members</th>
                <th>Overdue</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>{g.name}</strong>
                  </td>
                  <td>
                    <span className="ga-code-chip">{g.code}</span>
                  </td>
                  <td>
                    <span className="ga-badge ga-badge-muted">{g.type}</span>
                  </td>
                  <td>{g.city}</td>
                  <td>
                    {g.admin_nickname ? (
                      <strong>{g.admin_nickname}</strong>
                    ) : (
                      <span className="ga-badge ga-badge-amber">NONE !</span>
                    )}
                  </td>
                  <td>{g.member_count}</td>
                  <td>{g.overdue_count}</td>
                  <td>
                    <span
                      className={`ga-badge ${
                        g.lifecycle_status === 'active'
                          ? 'ga-badge-green'
                          : g.lifecycle_status === 'read_only'
                            ? 'ga-badge-amber'
                            : 'ga-badge-red'
                      }`}
                    >
                      {g.lifecycle_status}
                    </span>
                  </td>
                  <td>
                    <div className="ga-actions">
                      <button
                        type="button"
                        className="ga-btn ga-btn-soft"
                        disabled={busy}
                        onClick={() => rotateCode(g)}
                      >
                        Rotate Code
                      </button>
                      <button
                        type="button"
                        className="ga-btn"
                        disabled={busy || g.members.length === 0}
                        onClick={() => {
                          setRescueGroup(g);
                          setRescueUserId(g.members[0]?.id ?? 0);
                          setRescueReason(RESCUE_REASONS[0]);
                        }}
                      >
                        Admin Rescue
                      </button>
                      <button
                        type="button"
                        className={`ga-btn ${g.lifecycle_status === 'active' ? 'ga-btn-danger' : 'ga-btn-green'}`}
                        disabled={busy}
                        onClick={() => setStatus(g, g.lifecycle_status === 'active' ? 'suspended' : 'active')}
                      >
                        {g.lifecycle_status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Group Modal */}
      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Create Neighborhood Group</h2>
            </div>
            <form onSubmit={(e) => submitCreate(e, false)}>
              <div className="modal-body">
                <div className="field">
                  <label className="label" htmlFor="sa-cg-name">
                    Group Name
                  </label>
                  <input
                    id="sa-cg-name"
                    className="text-input"
                    required
                    maxLength={60}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Midori Dorm B"
                  />
                </div>
                <div className="sa-form-row">
                  <div className="field">
                    <label className="label" htmlFor="sa-cg-type">
                      Type
                    </label>
                    <select
                      id="sa-cg-type"
                      className="sa-select"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as GroupType)}
                    >
                      <option value="building">building</option>
                      <option value="block">block</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="sa-cg-city">
                      City
                    </label>
                    <input
                      id="sa-cg-city"
                      className="text-input"
                      required
                      maxLength={40}
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                    />
                  </div>
                </div>

                {duplicateNotice && (
                  <div className="sa-alert sa-alert-amber">
                    <span>{duplicateNotice}</span>
                    <button
                      type="button"
                      className="ga-btn ga-btn-amber"
                      disabled={busy}
                      onClick={(e) => submitCreate(e, true)}
                    >
                      Create anyway
                    </button>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button-primary" disabled={busy}>
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Rescue Modal */}
      {rescueGroup && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Admin Rescue — {rescueGroup.name}</h2>
            </div>
            <form onSubmit={submitRescue}>
              <div className="modal-body">
                <p className="ga-meta" style={{ marginBottom: 12 }}>
                  Promote an active neighbor to Group Admin. Action is permanently audit-logged.
                </p>
                <div className="field">
                  <label className="label" htmlFor="sa-rescue-member">
                    Select Neighbor
                  </label>
                  <select
                    id="sa-rescue-member"
                    className="sa-select"
                    value={rescueUserId}
                    onChange={(e) => setRescueUserId(Number(e.target.value))}
                  >
                    {rescueGroup.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nickname} ({m.role} · {m.on_time_returns} on-time returns)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="sa-rescue-reason">
                    Verification Reason
                  </label>
                  <select
                    id="sa-rescue-reason"
                    className="sa-select"
                    value={rescueReason}
                    onChange={(e) => setRescueReason(e.target.value)}
                  >
                    {RESCUE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={() => setRescueGroup(null)}>
                  Cancel
                </button>
                <button type="submit" className="button-primary" disabled={busy}>
                  Promote to Group Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
