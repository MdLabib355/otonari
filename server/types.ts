// Rows exactly as SQLite returns them (the tables are in db.ts). SQLite has no booleans: 0 / 1.

import type { ItemStatus, Lang, Loan } from '../shared/types.ts';

export interface UserRow {
  id: number;
  group_id: number;
  nickname: string;
  lang: Lang;
  elder_mode: number;
  token: string;
  is_demo: number;
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
  trusted_only: number;
  status: ItemStatus;
  created_at: string;
  removed_at: string | null;
}

export type LoanRow = Loan; // all columns go to the client as they are

// SELECT COUNT(*) AS count
export interface CountRow {
  count: number;
}

// What our middleware adds to requests: requireUser (auth.ts) and loanRole (routes/loans.ts).
declare global {
  namespace Express {
    interface Request {
      user: UserRow;
      loan: LoanRow;
    }
  }
}
