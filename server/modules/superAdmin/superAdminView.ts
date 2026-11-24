// View projections for Super Admin responses, enforcing minimum-necessary data exposure.

import type {
  AuditLogEntry,
  ReminderHealth,
  StorageHealth,
  SuperAdminGroupSummary,
  SuperAdminOverview,
} from '../../../shared/types.ts';

export function overviewView(
  counters: Omit<
    SuperAdminOverview,
    'demo_mode' | 'reminder_health' | 'storage_health' | 'recent_audits'
  >,
  demoMode: boolean,
  reminderHealth: ReminderHealth,
  storageHealth: StorageHealth,
  recentAudits: AuditLogEntry[]
): SuperAdminOverview {
  return {
    ...counters,
    demo_mode: demoMode,
    reminder_health: reminderHealth,
    storage_health: storageHealth,
    recent_audits: recentAudits,
  };
}

// Ensures non-break-glass group summaries never expose auth tokens or private metadata.
export function groupDirectoryView(groups: SuperAdminGroupSummary[]): SuperAdminGroupSummary[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    code: group.code,
    type: group.type,
    city: group.city,
    join_policy: group.join_policy,
    lifecycle_status: group.lifecycle_status,
    admin_nickname: group.admin_nickname,
    member_count: group.member_count,
    overdue_count: group.overdue_count,
    members: group.members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      role: m.role,
      member_status: m.member_status,
      on_time_returns: m.on_time_returns,
    })),
  }));
}
