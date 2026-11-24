// Rows exactly as PostgreSQL returns them (the tables are in core/database.ts). Times are ISO 8601 text.

import type {
  GroupLifecycleStatus,
  GroupRole,
  GroupType,
  ItemStatus,
  JoinPolicy,
  Lang,
  Loan,
  MemberStatus,
  TrustOverride,
} from '../shared/types.ts';

export interface GroupRow {
  id: number;
  code: string;
  name: string;
  type: GroupType;
  city: string;
  join_policy: JoinPolicy;
  lifecycle_status: GroupLifecycleStatus;
  invite_code_version: number;
  suspended_at: string | null;
  suspension_reason: string | null;
}

export interface UserRow {
  id: number;
  group_id: number;
  nickname: string;
  lang: Lang;
  elder_mode: boolean;
  token: string;
  is_demo: boolean;
  group_role: GroupRole;
  member_status: MemberStatus;
  muted_until: string | null;
  trust_override: TrustOverride;
  created_at: string;
  left_at: string | null;
}

export interface ItemRow {
  id: number;
  owner_id: number;
  group_id: number;
  item_key: string;
  max_days: number;
  spot: string;
  trusted_only: boolean;
  status: ItemStatus;
  created_at: string;
  removed_at: string | null;
  hidden_at: string | null;
}

export type LoanRow = Loan; // all columns go to the client as they are

// SELECT COUNT(*)::int AS count
export interface CountRow {
  count: number;
}

export interface SuperAdminSession {
  label: string;
  token: string;
  expiresAt: string;
}

// What the steps add to requests: requireUser / requireSuperAdmin (core/auth.ts) and loanRole (modules/loan).
declare global {
  namespace Express {
    interface Request {
      user: UserRow;
      loan: LoanRow;
      superAdmin?: SuperAdminSession;
    }
  }
}
