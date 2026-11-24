// Rows exactly as PostgreSQL returns them (the tables are in core/database.ts). Times are ISO 8601 text.

import type { ItemStatus, Lang, Loan } from '../shared/types.ts';

export interface UserRow {
  id: number;
  group_id: number;
  nickname: string;
  lang: Lang;
  elder_mode: boolean;
  token: string;
  is_demo: boolean;
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
}

export type LoanRow = Loan; // all columns go to the client as they are

// SELECT COUNT(*)::int AS count
export interface CountRow {
  count: number;
}

// What the steps add to requests: requireUser (core/auth.ts) and loanRole (modules/loan).
declare global {
  namespace Express {
    interface Request {
      user: UserRow;
      loan: LoanRow;
    }
  }
}
