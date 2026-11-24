// The types used by both sides: what the server answers is what the client reads.
// Types only (no code): both sides use "import type", so nothing of this file is left at run time.

export type Lang = 'en' | 'ja' | 'ja-easy' | 'bn';
export type Role = 'super_admin' | 'group_admin' | 'user';
export type GroupRole = 'user' | 'group_admin';
export type GroupType = 'building' | 'block';
export type ItemStatus = 'available' | 'reserved' | 'lent';
export type LoanStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'active' | 'returned';

export type MemberStatus = 'pending' | 'active' | 'borrow_muted' | 'suspended';
export type GroupLifecycleStatus = 'active' | 'read_only' | 'suspended' | 'archived';
export type JoinPolicy = 'open' | 'approval_required' | 'locked';
export type TrustOverride = 'granted' | 'revoked' | null;
export type AuditCategory = 'Group' | 'Member' | 'Shelf' | 'Loan' | 'Notice' | 'Catalog' | 'Break-Glass' | 'System';
export type DisputeStatus = 'open' | 'resolved';

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
  member_status: MemberStatus;
  muted_until: string | null;
  is_trusted: boolean;
  trust_override: TrustOverride;
  avatar: string | null; // URL of the profile photo
  has_password: boolean; // false: logs in with Google, or with a code
  google_only: boolean;
}

export interface Group {
  id: number;
  code: string;
  name: string;
  type: GroupType;
  city: string;
  image: string | null; // URL of the group's icon
  join_policy: JoinPolicy;
  lifecycle_status: GroupLifecycleStatus;
  invite_code_version: number;
  active_announcement_key: string | null;
}

// GET /api/v1/me
export interface Me {
  user: User;
  group: Group | null; // null before joining one
}

// POST /api/v1/auth/email-codes/verify: for registering, or for a new password
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

// POST /api/v1/auth/register, /login, /login-with-code, /reset-password and /google
export interface Login extends Me {
  token: string;
}

// GET /api/v1/groups/:code
export interface GroupPreview {
  name: string;
  type: GroupType;
  city: string;
  image: string | null;
  member_count: number;
  join_policy: JoinPolicy;
  lifecycle_status: GroupLifecycleStatus;
}

// GET /api/v1/me/group/members
export interface GroupMember {
  id: number;
  nickname: string;
  lang: Lang;
  avatar: string | null;
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

export type Person = Pick<User, 'id' | 'nickname' | 'lang'> & { avatar?: string | null };
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

// ---------- Group Admin DTOs ----------

export interface GroupAnnouncement {
  id: number;
  group_id: number;
  phrase_key: string;
  is_active: boolean;
  created_at: string;
}

export interface GroupAdminDashboard {
  group: Group;
  pending_count: number;
  active_member_count: number;
  overdue_loan_count: number;
  flagged_loan_count: number;
  active_announcement: GroupAnnouncement | null;
}

export interface ActiveLoanBadge {
  loan_id: number;
  role: 'lender' | 'borrower';
  status: LoanStatus;
  is_overdue: boolean;
}

export interface GroupMemberSummary {
  id: number;
  nickname: string;
  lang: Lang;
  elder_mode: boolean;
  role: Role;
  member_status: MemberStatus;
  muted_until: string | null;
  is_trusted: boolean;
  trust_override: TrustOverride;
  trust: Trust;
  created_at: string;
  active_loans: ActiveLoanBadge[];
  owned_available_items: number;
}

export interface GroupAdminItem extends ShelfItem {
  hidden_at: string | null;
}

export interface GroupAdminLoanTimelineItem {
  id: number;
  phrase_key: string;
  params: PhraseParams;
  from_nickname: string | null;
  from_lang: Lang | null;
  created_at: string;
}

export interface GroupAdminLoan {
  id: number;
  item_id: number;
  item_key: string;
  spot: string;
  status: LoanStatus;
  is_overdue: boolean;
  start_at: string;
  end_at: string;
  returned_at: string | null;
  handover_photo: string | null;
  return_photo: string | null;
  borrower: Person;
  lender: Person;
  flagged_reason: string | null;
  escalated_to_super_admin: boolean;
  last_nudge_at: string | null;
  timeline: GroupAdminLoanTimelineItem[];
}

export interface AuditLogEntry {
  id: number;
  actor_id: number | null;
  actor_label: string;
  actor_role: 'super_admin' | 'group_admin' | 'system';
  scope_group_id: number | null;
  category: AuditCategory;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  detail: string;
  created_at: string;
}

// ---------- Super Admin & Global Catalog DTOs ----------

export interface CatalogItemRecord {
  item_key: string;
  emoji: string;
  category: string;
  is_active: boolean;
  label_en: string;
  label_ja: string;
  label_ja_easy: string;
  label_bn: string;
  updated_at: string;
}

// GET /api/v1/categories (only the active ones) and /api/v1/super-admin/categories
export interface CatalogCategoryRecord {
  category_key: string;
  icon_key: string; // one of CATEGORY_ICON_KEYS
  is_active: boolean;
  sort_order: number;
  label_en: string;
  label_ja: string;
  label_ja_easy: string;
  label_bn: string;
  updated_at: string;
}

export interface ReminderHealth {
  interval_seconds: number;
  last_run_at: string | null;
  last_checked_loans: number;
  last_error: string | null;
}

export interface StorageHealth {
  mode: 'local' | 's3';
  used_bytes: number;
  quota_bytes: number;
  total_files: number;
  orphan_files: number;
}

export interface SuperAdminOverview {
  active_groups: number;
  total_groups: number;
  total_neighbors: number;
  active_loans: number;
  completed_loans: number;
  open_disputes: number;
  orphaned_groups: { id: number; name: string; code: string; member_count: number }[];
  db_latency_ms: number;
  demo_mode: boolean;
  reminder_health: ReminderHealth;
  storage_health: StorageHealth;
  recent_audits: AuditLogEntry[];
}

export interface SuperAdminGroupMemberPreview {
  id: number;
  nickname: string;
  role: Role;
  member_status: MemberStatus;
  on_time_returns: number;
}

export interface SuperAdminGroupSummary {
  id: number;
  name: string;
  code: string;
  type: GroupType;
  city: string;
  join_policy: JoinPolicy;
  lifecycle_status: GroupLifecycleStatus;
  admin_nickname: string | null;
  member_count: number;
  overdue_count: number;
  members: SuperAdminGroupMemberPreview[];
}

export interface DisputeSummary {
  id: number;
  group_id: number;
  group_name: string;
  loan_id: number;
  item_key: string;
  spot: string;
  borrower_nickname: string;
  borrower_lang: Lang;
  lender_nickname: string;
  lender_lang: Lang;
  reason_key: string;
  status: DisputeStatus;
  escalation_notice_sent: boolean;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface BreakGlassUnlockResponse {
  break_glass_token: string;
  expires_at: string;
  ttl_seconds: number;
  reason: string;
}

export interface BreakGlassEvidenceMessage {
  id: number;
  sender_nickname: string | null;
  sender_lang: Lang | null;
  phrase_key: string;
  params: PhraseParams;
  created_at: string;
}

export interface BreakGlassEvidence {
  dispute_id: number;
  loan_id: number;
  item_key: string;
  handover_photo: string | null;
  return_photo: string | null;
  loan_status: LoanStatus;
  start_at: string;
  end_at: string;
  returned_at: string | null;
  messages: BreakGlassEvidenceMessage[];
}

export interface StorageCleanupResult {
  dry_run: boolean;
  mode: 'local' | 's3';
  orphan_files: string[];
  deleted_count: number;
  reclaimed_bytes: number;
}
