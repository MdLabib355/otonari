// The types used by both sides: what the server answers is what the client reads.
// Types only (no code): both sides use "import type", so nothing of this file is left at run time.

export type Lang = 'en' | 'ja' | 'ja-easy' | 'bn';
export type Role = 'super_admin' | 'group_admin' | 'user';
export type GroupType = 'building' | 'block';
export type ItemStatus = 'available' | 'reserved' | 'lent';
export type LoanStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'active' | 'returned';

// Golden rule: keys and raw values only, never translated text.
export interface PhraseParams {
  item?: string; // key from the catalog
  spot?: string; // key from SPOTS
  start?: string; // ISO 8601
  end?: string; // ISO 8601
  name?: string; // nickname of the other person
  n?: number;
}

// How reliable a borrower has been.
export interface Trust {
  joined_days: number;
  on_time: number;
  late: number;
}

export interface User {
  id: number;
  group_id: number | null;
  nickname: string;
  lang: Lang;
  elder_mode: boolean;
  email: string;
  role: Role;
}

export interface Group {
  id: number;
  code: string;
  name: string;
  type: GroupType;
  city: string;
}

// GET /api/v1/me
export interface Me {
  user: User;
  group: Group | null; // null before joining one
}

// POST /api/v1/auth/email-codes/verify
export interface RegistrationTicket {
  ticket: string;
}

// GET /api/v1/auth/config
export interface AuthConfig {
  google_client_id: string | null; // null: no Google login
  email_code: boolean;
  demo_mode: boolean;
  mailbox_url: string | null; // the test mailbox, if emails go there
}

// POST /api/v1/auth/register, /login, /login-with-code and /google
export interface Login extends Me {
  token: string;
}

// GET /api/v1/groups/:code
export interface GroupPreview {
  name: string;
  type: GroupType;
  city: string;
  member_count: number;
}

// GET /api/v1/me/group/members
export interface GroupMember {
  id: number;
  nickname: string;
  lang: Lang;
  role: Role;
  joined_at: string | null;
}

// GET /api/v1/admin/groups
export interface AdminGroup extends Group {
  member_count: number;
}

// GET /api/v1/admin/users
export interface AdminUser {
  id: number;
  email: string;
  nickname: string;
  role: Role;
  group_name: string | null;
  created_at: string;
  active: boolean;
}

// GET /api/v1/me/items
export interface MyItem {
  id: number;
  item_key: string;
  max_days: number;
  spot: string;
  trusted_only: boolean;
  status: ItemStatus;
}

// GET /api/v1/items
export interface ShelfItem extends MyItem {
  owner_id: number;
  owner_nickname: string;
}

// GET /api/v1/items/:id
export interface ItemDetails extends ShelfItem {
  group_id: number;
  owner_lang: Lang;
  my_loan_id: number | null;
  allowed_for_me: boolean;
}

export interface Loan {
  id: number;
  item_id: number;
  borrower_id: number;
  lender_id: number;
  start_at: string;
  end_at: string;
  status: LoanStatus;
  handover_photo: string | null;
  return_photo: string | null;
  returned_at: string | null;
  reminded_soon_at: string | null;
  reminded_overdue_at: string | null;
  created_at: string;
}

// One card on the loans page.
export interface LoanSummary {
  id: number;
  status: LoanStatus;
  start_at: string;
  end_at: string;
  item_key: string;
  spot: string;
  other_nickname: string;
  other_lang: Lang;
  unread: number;
}

// GET /api/v1/loans
export interface MyLoans {
  borrowing: LoanSummary[];
  lending: LoanSummary[];
}

export type Person = Pick<User, 'id' | 'nickname' | 'lang'>;
export type LoanItem = Pick<MyItem, 'id' | 'item_key' | 'max_days' | 'spot' | 'status'>;

export interface Message {
  id: number;
  from_user_id: number | null; // null = system reminder
  to_user_id: number;
  phrase_key: string;
  params: PhraseParams;
  read_at: string | null;
  created_at: string;
  from_lang: Lang | null; // null for system reminders
}

// GET /api/v1/loans/:id, and the answer to every action on a loan
export interface LoanDetails {
  loan: Loan;
  item: LoanItem;
  borrower: Person;
  lender: Person;
  borrower_trust: Trust | null; // only for the lender
  messages: Message[];
}

// GET /api/v1/me/inbox
export interface InboxMessage {
  id: number;
  loan_id: number;
  from_user_id: number | null;
  phrase_key: string;
  params: PhraseParams;
  created_at: string;
  from_nickname: string | null; // null for system reminders
  from_lang: Lang | null;
  item_key: string;
  borrower_trust: Trust | null; // only with a request
}
