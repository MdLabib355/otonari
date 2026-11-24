# Otonari (お隣) — Complete v3 Technical & Product Specification

## 1. Product Overview

**Otonari** (お隣, "next door") is an installable neighborhood sharing PWA built for the **TSUNAGU — Update the Way We Connect** hackathon. It connects foreign residents and elderly Japanese neighbors within the same apartment building or residential block to lend and borrow household items without language barriers or awkward confrontations (*enryo* / 遠慮).

- **Zero free-text neighbor chat:** Every message is stored as `(phrase_key, params JSONB)` and rendered in each reader's chosen language (`en`, `ja` polite keigo, `ja-easy` やさしい日本語, `bn` Bengali). Fallback chain: `ja-easy → ja → en`, `bn → en`, `ja → en`.
- **Zero runtime AI or external APIs:** All phrases, catalog items (28 items across 5 categories), handover spots (5 shared public spots), quick replies (5), structured issue reports (2), and thank-you stamps (4) are pre-written and parity-tested across all 4 locales.
- **Elder-friendly accessibility:** Elder Mode raises base font to `22px`, tap targets to `64px`, and adds 🔊 browser `speechSynthesis` read-aloud on every message and banner.

---

## 2. PostgreSQL 16 Data Model (`server/db/schema.js`)

| Table | Purpose & Key Columns |
|---|---|
| `managers` | Building manager accounts (`id`, `name`, `email`, `password_hash` via `crypto.scrypt`, `is_demo`, `created_at`). Unique case-insensitive email index `idx_managers_email_lower`. |
| `manager_sessions` | Multi-device manager Bearer tokens (`token`, `manager_id`, `created_at`). |
| `groups` | Neighborhood buildings/blocks (`id`, `code`, `name`, `type`, `city`, `manager_id`, `require_approval`, `created_at`). |
| `users` | Residents (`id`, `group_id`, `nickname`, `lang`, `elder_mode`, `token`, `is_demo`, `status` `'pending'\|'approved'\|'rejected'`, `manager_note`, `created_at`, `left_at`). Partial unique index `idx_users_active_nickname` prevents duplicate active nicknames per group (case-insensitive). |
| `transfer_codes` | 10-minute single-use device-transfer / lost-phone restore codes (`code`, `user_id`, `expires_at`, `used_at`, `created_at`). |
| `items` | Shared shelf items (`id`, `owner_id`, `group_id`, `item_key`, `max_days`, `spot`, `trusted_only`, `paused`, `photo_url`, `status`, `created_at`, `removed_at`). Max 50 active items per resident. |
| `loans` | Borrow lifecycle (`id`, `item_id`, `borrower_id`, `lender_id`, `start_at`, `end_at`, `status` `'pending'\|'accepted'\|'declined'\|'cancelled'\|'active'\|'returned'\|'expired'`, `handover_photo`, `return_photo`, `issue_photo`, `returned_at`, `reminded_soon_at`, `reminded_overdue_at`, `last_pinged_at`, `created_at`). |
| `messages` | Structured phrasebook messages (`id`, `loan_id`, `from_user_id` nullable for system, `to_user_id`, `phrase_key`, `params JSONB`, `read_at`, `created_at`). |
| `app_settings` | Key/value settings (`key`, `value`), used to auto-persist generated VAPID keypair (`vapid_public_key`, `vapid_private_key`). |
| `push_subscriptions` | Browser Web Push endpoints (`id`, `user_id`, `endpoint` unique, `p256dh`, `auth`, `created_at`). |

---

## 3. Loan Lifecycle & Core Rules

```text
pending ──accept──▶ accepted ──(lender handover photo)──▶ accepted + handover_photo
   │                   │                                      ──(borrower received)──▶ active
   ├──decline──▶ declined                                        active ──(borrower return photo)──▶ active + return_photo
   ├──cancel───▶ cancelled   (borrower on pending; either side        ──(lender return-confirmed)──▶ returned
   └──auto-expire──▶ expired  on accepted before handover_photo)
```

- **Auto-expiry (`server/services/reminders.js`):** Every 30s, `pending` loans whose `end_at < NOW()` transition to `expired` and send `sys.expired` to the borrower (so unanswered requests stay acceptable throughout the requested borrowing window and expire only once obsolete).
- **Reminders:** Active loans without `return_photo` trigger `sys.dueSoon` (≤24h before `end_at`) and `sys.overdue` + `sys.overdueLender` (past `end_at`), guarded by `FOR UPDATE SKIP LOCKED` and idempotent timestamp columns.
- **Item controls:** Owners can edit `max_days`, `spot`, `trusted_only`, and `paused` (`PATCH /api/items/:id`). Paused items cannot be requested (`409`).
- **Issue reports & thank-you stamps:** Either participant can send a structured non-confrontational issue report (`POST /api/loans/:id/issue`, optional EXIF-stripped photo) on `active`/`returned` loans, and send warm Japanese thank-you stamps (`POST /api/loans/:id/stamp`) on `returned` loans.
- **Trust:** Calculated strictly from `returned` loans (`returned_at <= end_at` = on time). At least 1 on-time return unlocks `trusted_only` items.
- **Neighborhood stats (`GET /api/group/stats`):** Returns active members, shared items, completed loans, and cross-language completed exchanges (`borrower.lang <> lender.lang`).

---

## 4. Building Manager Auth, Approval Toggle, Moderation & Device Restore

### Authentication & Domain Separation
- Managers register/sign in with email + password (`crypto.scrypt` with random 16-byte salt, verified with `crypto.timingSafeEqual`).
- Multi-device `manager_sessions` tokens are strictly isolated from resident `users.token` (a manager token receives `401` on resident routes and vice versa).
- `POST /api/groups` requires `requireManager`. Managers can only manage groups where `groups.manager_id = req.manager.id` (`403` otherwise).

### Edge Cases Covered (15/15)
1. **Duplicate email (case-insensitive):** `409` via `LOWER(email)` unique index.
2. **Multi-device manager sign-in:** Each login issues an independent session token; logout revokes only the active token.
3. **Cross-group isolation:** Ownership verified on every `/api/manager/groups/:id/*` route (`403`).
4. **Join code rotation:** `POST /api/manager/groups/:id/rotate-code` changes `groups.code` without disconnecting already-joined residents; old code returns `404` on new lookups.
5. **Approval toggle (`require_approval`):** When `false` (default), new residents join immediately as `approved`. When `true`, new residents start as `pending` (`403` on shelf/items/loans; allowed on `GET /api/me`, `PATCH /api/me`, `POST /api/leave`, `GET /api/events`) and unlock live via SSE once approved.
6. **Private `manager_note`:** Optional `<=40` char note entered during join when approval is required; returned **only** on `GET /api/manager/groups/:id/members`, never exposed in resident APIs.
7. **Duplicate active nickname:** Case-insensitive unique active nickname per group (`409`), automatically freed if the user leaves or is removed.
8. **Pending member rejection:** `POST .../reject` sets `status = 'rejected'` and pushes SSE status update; rejected user cannot re-enter with that token.
9. **Safe resident removal (active loan guard):** `POST .../remove` returns `409` while the resident has an `active` loan or an `accepted` loan with `handover_photo` already uploaded.
10. **Safe resident removal (unhanded-over cleanup):** Before handover, removal cancels `accepted`/`pending` loans, frees reserved items, soft-deletes owned `available` items, marks `left_at = NOW()`, and immediately drops SSE streams (`disconnectUser`).
11. **Self-service device transfer:** `POST /api/me/transfer-code` creates a 10-minute single-use `XXXX-XXXX` code & QR keeping the resident's token valid on both devices (for switching browser → installed PWA).
12. **Manager-assisted lost-phone restore:** `POST /api/manager/groups/:id/members/:userId/transfer-code` creates a 10-minute single-use code **and rotates `users.token`**, immediately revoking the lost phone's session and closing its SSE stream.
13. **Single-use & expired transfer code redemption:** `POST /api/restore` atomically marks `used_at = NOW()` (`WHERE used_at IS NULL AND expires_at > NOW()`); second use or expired code returns `404`.
14. **Reported item issues feed:** `GET /api/manager/groups/:id/issues` surfaces structured `ISSUE_KEYS` messages (with item, spot, reporter, counterparty, timestamp, optional EXIF-stripped photo) to the building manager.
15. **Demo manager quick-login:** When `DEMO_MODE=true`, `POST /api/demo/manager-login` signs into the seeded Sakura Heights manager without hardcoded credentials in source code.

---

## 5. 3-Layer Notification Pipeline

All live/push deliveries register via `afterCommit(client, fn)` in `server/db/pool.js` so rolled-back transactions never leak ghost notifications.

1. **Layer 1 — Persistent Notification Center (`GET /api/inbox`, `POST /api/inbox/read`, `POST /api/inbox/read-all`):** Every unread message piles up in PostgreSQL until read. The top bar 🔔 button opens the Notification Center drawer listing all piled-up alerts with one-tap navigation and "Mark all read".
2. **Layer 2 — Live Authenticated SSE (`GET /api/events`):** Connected via `fetch()` with `Authorization: Bearer <token>` (never URL query tokens), capped at 5 concurrent streams per resident, delivering instant `<100ms` updates + `revoked` disconnect events, backed by a 10s fallback poll.
3. **Layer 3 — Background Web Push (`GET /api/push/vapid-key`, `POST/DELETE /api/push/subscribe`, `client/src/sw.js`):** Uses `web-push` with zero-config VAPID keys auto-generated and persisted in `app_settings` (or overridden via `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`). Delivers localized OS notifications even when the app is closed, automatically pruning `404`/`410` expired endpoints.

---

## 6. Interactive OpenAPI 3.0.3 Documentation

- Raw spec: `GET /api/openapi.json`
- Interactive Swagger UI: `GET /api/docs` (always mounted)
- `server/test/openapi.test.js` verifies 100% parity between all mounted Express routes and `server/docs/openapi.json`.

---

## 7. Nagasaki Seed Data & 5-Step Demo Script

### Seeded Groups (`npm run seed`)
- `SAKURA-2611` — **Sakura Heights** (`building`, Nagasaki), owned by demo manager `manager@sakura.nagasaki.jp`, with Sato (`ja`), Tanaka (`ja`), Yamamoto (`ja`), Maria (`en`, 1 on-time return), Ayesha (`bn`).
- `HAMA-3CHOME` — **Hamaguchi-machi 3-chome** (`block`, Nagasaki), with Inoue (`ja`) and Kobayashi (`ja`).

### 5-Step Live Demo
1. **Join:** Rahim scans `/join?code=SAKURA-2611` (or Manager toggles approval & approves live), picks English → browses shelf with live neighborhood stats & search.
2. **Request:** Rahim selects Sato's 🛏️ Futon dryer, picks date/time, previews polite Japanese → taps "Can I borrow it?".
3. **Instant Bilingual Answer:** Sato's SSE banner + 🔔 Notification Center lights up instantly in Japanese (with optional Elder Mode & 🔊 read-aloud toggleable in Settings). Sato taps はい → Rahim switches language to Bengali and sees the entire thread re-render immediately.
4. **Handover:** Sato uploads EXIF-stripped handover photo; Rahim confirms receipt (with pinned handover spot card + etiquette tip).
5. **Return, Reminders & Stamp:** Fast-forward to overdue fires reminders + Web Push + sticky red return bar → Rahim returns with photo → Sato confirms → both exchange Japanese thank-you stamps (`🙇`, `🍪`) without typing a single free-text word.
