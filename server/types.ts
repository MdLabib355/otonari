// Rows exactly as PostgreSQL returns them (the tables are in core/database.ts). Times are ISO 8601 text.

import type { ItemStatus, Lang, Loan, Role } from '../shared/types.ts';

export interface UserRow {
  id: number;
  email: string;
  email_verified: boolean;
  password_hash: string | null;
  google_sub: string | null;
  role: Role;
  group_id: number | null;
  joined_at: string | null;
  nickname: string;
  lang: Lang;
  elder_mode: boolean;
  is_demo: boolean;
  deactivated_at: string | null;
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
  status: ItemStatus;
  created_at: string;
  removed_at: string | null;
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
    }
  }
}
