// Rows exactly as PostgreSQL returns them (the tables are in core/database.ts). Times are ISO 8601 text.

import type {
  ApprovalStatus,
  GroupLifecycleStatus,
  GroupType,
  ItemStatus,
  JoinPolicy,
  Lang,
  Loan,
  MemberStatus,
  Role,
  TrustOverride,
} from '../shared/types.ts';

export interface GroupRow {
  id: number;
  code: string;
  name: string;
  type: GroupType;
  city: string;
  image: string | null;
  join_policy: JoinPolicy;
  lifecycle_status: GroupLifecycleStatus;
  invite_code_version: number;
  suspended_at: string | null;
  suspension_reason: string | null;
}

export interface UserRow {
  id: number;
  email: string;
  email_verified: boolean;
  password_hash: string | null;
  google_sub: string | null;
  google_only: boolean;
  role: Role;
  group_id: number | null;
  joined_at: string | null;
  nickname: string;
  avatar: string | null;
  lang: Lang;
  elder_mode: boolean;
  is_demo: boolean;
  deactivated_at: string | null;
  member_status: MemberStatus;
  muted_until: string | null;
  trust_override: TrustOverride;
  created_at: string;
}

export interface ItemRow {
  id: number;
  owner_id: number;
  group_id: number;
  item_key: string;
  max_days: number;
  spot: string;
  trusted_only: boolean;
  custom_title: string | null;
  category_key: string | null;
  approval_status: ApprovalStatus;
  photo: string | null; // 's3:photos/xxx.jpg' or '/uploads/xxx.jpg'
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

// What the steps add to requests: requireUser / requireMember (core/auth.ts) and loanRole (modules/loan).
declare global {
  namespace Express {
    interface Request {
      user: UserRow;
      groupId: number; // only after requireMember
      loan: LoanRow;
      photo: string; // only after storePhoto
      optionalPhoto: string | undefined; // after storeOptionalPhoto, if there was one
    }
  }
}
