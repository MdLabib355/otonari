// DTO projections for Group Admin responses (never exposes emails or password hashes).

import type {
  ActiveLoanBadge,
  Group,
  GroupAdminDashboard,
  GroupAnnouncement,
  GroupMemberSummary,
} from '../../../shared/types.ts';
import type { UserRow } from '../../types.ts';
import { isTrusted, resolveEffectiveMemberStatus, trustOf } from '../user/userModel.ts';

export function dashboardView(
  group: Group,
  stats: {
    pending_count: number;
    pending_item_count: number;
    active_member_count: number;
    overdue_loan_count: number;
    flagged_loan_count: number;
    active_announcement: GroupAnnouncement | null;
  }
): GroupAdminDashboard {
  return {
    group,
    ...stats,
  };
}

export async function memberSummaryView(
  user: UserRow,
  activeLoans: ActiveLoanBadge[],
  ownedAvailableItems: number
): Promise<GroupMemberSummary> {
  const [effectiveStatus, trust, trusted] = await Promise.all([
    resolveEffectiveMemberStatus(user),
    trustOf(user.id),
    isTrusted(user.id),
  ]);

  return {
    id: user.id,
    nickname: user.nickname,
    lang: user.lang,
    elder_mode: user.elder_mode,
    role: user.role,
    member_status: effectiveStatus,
    muted_until: effectiveStatus === 'borrow_muted' ? user.muted_until : null,
    is_trusted: trusted,
    trust_override: user.trust_override,
    trust,
    created_at: user.created_at,
    active_loans: activeLoans,
    owned_available_items: ownedAvailableItems,
  };
}
