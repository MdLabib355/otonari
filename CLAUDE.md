# CLAUDE.md — Otonari (お隣)

This file is the single source of truth for the project. Read it fully before writing any code.
If a request conflicts with this file, follow this file and point out the conflict.

---

## 1. What we are building

**Otonari** (お隣, "next door") is a PWA that lets neighbors in the same **building or block** in Japan
lend and borrow rarely-used household items, **without any language barrier**.

- Hackathon theme: **TSUNAGU — Update the Way We Connect**.
- Broken link: neighbors live a few meters apart but never ask each other for help, because of
  language, shyness and Japanese reluctance to impose or to chase overdue items (遠慮).
- Target users: foreign residents (e.g. a Bangladeshi engineer new to Nagasaki) and elderly Japanese
  residents who own useful items but rarely talk to neighbors.

### The core twist (never break this)
**There is NO free-text messaging anywhere in the app.** Every message is a **phrase key + parameters**
(e.g. `request` + item + start + end). Each person sees every message rendered **in their own
language**, and Japanese is always polite (keigo). Translations are pre-written by humans and stored in
JSON files. No AI, no translation API, no API keys.

The only free text a user ever types is their login (email, password, code), their **nickname** (max 20 chars), plus the **group name** and
**city** when starting a new neighborhood (max 60 and 40 chars). Messages never contain free text.

### Supported languages
| code | language | file |
|---|---|---|
| `en` | English | `client/src/i18n/en.json` |
| `ja` | Japanese (polite / keigo) | `client/src/i18n/ja.json` |
| `ja-easy` | Easy Japanese (やさしい日本語, hiragana + spaces) | `client/src/i18n/ja-easy.json` |
| `bn` | Bengali | `client/src/i18n/bn.json` |

Fallback chain when a key is missing: `ja-easy → ja → en`, `bn → en`, `ja → en`.

---

## 2. Features (scope is FIXED — do not add features not listed here)

### Landing page
- Visitors (not a member on this device) see the landing page at `/`: the vision, how it works, a real phrase in two
  languages, and the buttons Register and Log in. Members see the shelf at `/`.
- `/login` and `/register` offer the three ways to log in. The QR code's `/join?code=...` leads there first.

### Accounts and roles
- **Everyone logs in first**, then joins a group (with its code) or starts one. **Registering**: email → 6-digit
  code by email (10 minutes, 5 attempts) → password twice; or "Continue with Google". **Logging in**: "Continue with
  Google" (creates the account if there is none), or with email: with the password, or without it (code by email). One email = one account: who registered with Google
  logs in with Google only; for an account that was made another way, Google is one more way in. One account is in one
  group at a time.
- `user`: a neighbor. `group_admin`: also sees and removes members and makes a new join code (whoever starts a group; if
  the last one leaves, the longest-standing member takes over). `super_admin`: all groups and accounts, roles,
  deactivating; the first one comes from the settings.
- **Profile** (`/profile`, every role, also without a group): photo, nickname, and a new password (the old one is
  needed; other devices are logged out). **Forgot password?**: email → code → new password twice (all devices are logged
  out). Not for Google-only accounts; not for the passwords of demo accounts.
- **Group image**: group admins choose or remove it (`/group-admin`); it is the icon of the group in the header, in
  Settings, on the admin page and on the join page. Without one: a building or block icon.
- Neighbors see only nicknames and profile photos. Emails are seen by their owner and by super admins.
- Seeded accounts have a public password, so they work only in demo mode. There is no "continue as".

### Must-have 1 — Neighborhood shelf
- Join a **neighborhood group** (type `building` or `block`) with a **join code** (from the QR poster).
  User picks nickname + language. The session token is stored in `localStorage`.
- **Start a new neighborhood**: the Join page has a link "Set up Otonari for your building or block", for a
  building manager or neighborhood association leader. They enter a group name, type and city, become its first member
  and admin, and get the poster with a random join code (`XXXX-XXXX`).
  If a group with a similar name exists in the same city, they are asked to look for its poster first
  ("Create anyway" is possible). Another group's code is never shown.
- Add items to share by picking from the **fixed item catalog** (`client/src/data/catalog.ts`),
  choosing max loan days and a **handover spot** (never a home address or room number).
- Browse the shelf: all items in my group, with emoji icon, item name (in my language), owner nickname,
  status (available / lent / mine).

### Must-have 2 — Bilingual borrow flow
- On an item: tap-only time picker → start day chips (Today / Tomorrow / Day after) + time-of-day chips
  (Morning 9:00 / Afternoon 13:00 / Evening 18:00) + duration chips (1, 2, 3, 7 days, capped by the
  item's max days).
- **Preview box: "Your neighbor will see:"** shows the request rendered in the LENDER's language.
  (This reassures shy users and is a key demo moment.)
- Button "Can I borrow it?" sends the request.
- Lender sees it in their language and taps **Yes** / **No** / **No – I need it those days**.
- Quick replies (fixed phrases): On my way · I'm at the spot · Running a little late · No problem ·
  Thank you.
- Every message bubble has a small toggle **"Show original"** that renders the same phrase in the
  sender's language (proves both sides saw the same meaning).
- **Trust line** on every incoming request (loan page and banner), calculated from the database:
  "Joined X days ago · N returns on time, M late", or "New neighbor, no returns yet".
- **"Trusted neighbors only"** switch per item (when adding it, and on My items): only users with at least
  one on-time completed return can request it. Small 🔒 badge on the shelf; for everyone else the item page
  explains it instead of showing the time picker.
- **Safe leaving** (Settings): refused while the user has an accepted or active loan ("Please finish your
  current loans first"). Otherwise their items leave the shelf, their pending requests are cancelled, and
  they are in no group. The account stays.

### Must-have 3 — Handover & return loop
- Handover: lender takes a **condition photo** → borrower taps **"I received it"** → loan becomes active.
- Return: borrower takes a **return photo** → lender taps **"I got it back"** → item available again.
- **Automatic polite reminders** (so the lender never has to ask):
  - 24 h before due → reminder to borrower.
  - When overdue → reminder to borrower AND a notice to the lender saying "we reminded them for you".
- The shelf polls `/api/v1/items` every 3 s while it is on the screen (`core/usePolling.ts`), so it changes by itself.
- In-app notifications: the client polls `/api/v1/me/inbox` every 5 s and shows a banner for new messages.

### Cheap extras
- **Elder mode**: large text, large buttons, and a 🔊 read-aloud button on every message
  (browser `speechSynthesis`, lang `ja-JP` / `en-US` / `bn-BD`; hide the button if no voice exists).
- **Easy Japanese** mode (language `ja-easy`).
- **Etiquette tips**: small tip cards at the right moment (before requesting, at handover, at return).
  Tips come from the `tips` section of the language files.
- **QR join poster**: printable page `/poster` with the group name, join code and a QR code linking to
  `/join?code=XXXX`, text in Japanese + English + Bengali, and in small letters at the bottom the app
  name "Otonari (おとなり)" and the web address to type (`<current origin>/join`). Also serves as our
  security layer: only people who can physically see the notice board get the code. `/poster` shows my
  own group; `/poster?code=XXXX-XXXX` shows that group without being a member.
- **PWA**: installable (manifest + service worker via `vite-plugin-pwa`). The service worker keeps only the
  built app files. Pages, `/api` and `/uploads` always come from the network (the kept page is only for when
  there is no connection), so every start shows the newest version; an app left open reloads itself after a
  deploy. There is no service worker during `npm run dev`. (Browsers allow service workers only over HTTPS
  and on localhost.)

### NOT in scope (roadmap only — do not build)
Thank-you stamps, more languages, stronger verification (code rotation / management company),
push notifications, maps, payments, SMS.

---

## 3. Tech stack (fixed)

- **Client**: React 18 + Vite, **TypeScript (strict)**, `react-router-dom`, plain CSS
  (`client/src/styles/`), `vite-plugin-pwa`, `qrcode` (for the poster).
- **Server**: Node.js 22.18+ (runs the `.ts` files directly, no build step), TypeScript, Express, `pg`,
  `nodemailer` (codes by email), `jose` (checks Google's tokens), `multer` (photo upload), `cors`, `dotenv`,
  `nodemon` (dev only: restarts the server when a server `.ts` file is saved).
- **Database**: PostgreSQL 17, at `DATABASE_URL`. Recreated + seeded with `npm run seed`. Every request that changes
  something is one transaction (`write()` in `core/http.ts`), and they run one after the other (a lock in
  `transaction()`), so what a controller has checked stays true.
- **Docker**: `docker compose up` starts everything: `db` (PostgreSQL, not reachable from outside), `server`, `mail` (a
  test mailbox on http://localhost:8089, used unless `server/.env` has a mail server), and
  `client` (nginx: the built app, and `/api` and `/uploads` passed on to the server) on http://localhost:8088.
  Database and photos are volumes; `docker compose down -v` starts from zero.
- **Photos**: in a private AWS S3 bucket if `S3_BUCKET` is set (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`):
  the database keeps `s3:photos/<name>`, and the answers contain a signed URL that works for an hour. Otherwise saved to
  `server/uploads/` (git-ignored, keep `.gitkeep`), served at `/uploads/...`. Seeding never deletes photos in S3.
- **Dev**: `npm run db` starts only the database in Docker (port 5433). The root `package.json` runs both with `concurrently` → `npm run dev`.
  Client on port 5173, server on port 3001, Vite proxies `/api` and `/uploads` to 3001.
  The server runs under `nodemon` (config in `server/package.json`): it watches only server `.ts` files and
  ignores `node_modules`, `uploads/` and the database files, so database writes, seeding and photo uploads
  never restart it. (Not `node --watch`: on Windows it restarts when files are merely read.)
- **For the demo, always use `npm run build` + `npm start` (no file watcher).**
- **Deploy** (Render.com, one free Node web service): build `npm run render-build`, start `npm start`,
  environment `NODE_VERSION=22`, `DEMO_MODE=true` and `DATABASE_URL` of a Render PostgreSQL database (Render sets
  `PORT`). The free plan loses the photos on every restart
  (unless they are in S3). A server that starts without any groups runs the normal seed.
- **Types**: `shared/types.ts` (the API answers, used by both sides with `import type`) and `server/types.ts`
  (database rows). `typescript` and the `@types/*` packages are dev dependencies; `npm run typecheck` checks
  both sides. Vite and Node only remove the types, they don't check them.
- **Secrets** (mail password, super admin password, AWS key) exist only in `server/.env` or in the settings of the host, never in
  Git. `server/.env.example` lists all settings. `server/docker.env` has a public super admin password for trying the app
  out on one's own computer.
  `.env` is in `.gitignore`; commit `.env.example`.

---

## 4. Folder structure

```
otonari/
├── CLAUDE.md
├── README.md
├── package.json            # root: "dev", "db", "seed", "seed:empty", "build", "render-build", "typecheck", "start" scripts
├── .gitignore              # node_modules, .env, server/uploads/*, client/dist
├── docker-compose.yml      # db + server + client;  docker-compose.dev.yml: only the database, for development
├── .dockerignore
├── docs/screenshots/       # the pictures in README.md
├── shared/types.ts         # types of the API answers, used by client and server
├── client/
│   ├── index.html
│   ├── tsconfig.json       # type checking only
│   ├── Dockerfile  nginx.conf
│   ├── vite.config.ts      # react plugin, PWA plugin, proxy /api and /uploads → :3001
│   ├── make-icons.ps1      # draws the icons in public/
│   ├── public/             # icons for PWA (icon-192.png, icon-512.png, icon-maskable-512.png)
│   └── src/
│       ├── main.tsx        # starts the app, loads the styles
│       ├── app/            # App (routes), Header, PublicHeader, AccountHeader, BottomNav, navTabs, serviceWorker (reloads an open app after a deploy)
│       ├── core/           # used by all features
│       │   ├── api.ts          # fetch wrapper; adds "Authorization: Bearer <token>"
│       │   ├── UserContext.ts  # useUser() / useMember(): me, my group, my language and my inbox
│       │   ├── usePolling.ts   # loads again every few seconds (the shelf)
│       │   ├── shrinkPhoto.ts  # smaller JPEG without GPS, before every upload
│       │   └── useInbox.ts     # my unread messages (banner, Loans badge, loan page)
│       ├── components/     # used by several features: ChipGroup  FilterStrip  Icons  SpeakButton  TipCard
│       │                   # TrustLine  Avatar  GroupIcon  ImageEditor
│       ├── features/       # one folder per feature, like the modules of the server
│       │   ├── landing/    # Landing (/ for visitors)  SamplePhrase
│       │   ├── group/      # Join (/join)  NewGroup  Poster (/poster)
│       │   ├── auth/       # AuthPage (/login, /register)  LoginForm  RegisterForm  CodeStep  AuthField
│       │   │               # GoogleButton  authErrors
│       │   ├── admin/      # GroupAdmin (/group-admin)  SuperAdmin (/admin)  ConfirmButton
│       │   ├── user/       # Settings (/settings)  Profile (/profile)  AvatarEditor  ChangePassword
│       │   ├── item/       # Shelf (/)  NeighborShelf  ItemCard  ItemPage (/item/:id)  BorrowForm  borrowTimes
│       │   │               # MyItems (/my-items)  MyItemRow  Catalog  AddItemDialog  TrustedSwitch
│       │   ├── loan/       # Loans (/loans)  LoanPage (/loan/:id)  LoanHeader  LoanStepper  PendingActions  HandoverStep
│       │   │               # ReturnStep  QuickReplies  LoanPhotos  PhotoCapture  loanProps
│       │   ├── message/    # Banner (polling)  NotificationBell  PhraseBubble ("show original" + 🔊)
│       │   └── demo/       # DemoButtons (fast-forward)
│       ├── i18n/
│       │   ├── index.ts    # t(), renderPhrase(), formatDate(), useLang()
│       │   ├── en.json  ja.json  ja-easy.json  bn.json
│       ├── data/
│       │   └── catalog.ts  # ITEMS, CATEGORIES, SPOTS, QUICK_REPLIES, DURATIONS
│       └── styles/         # index.css imports the others; the order matters
└── server/
    ├── tsconfig.json       # type checking only
    ├── types.ts            # types of the database rows, req.user and req.loan
    ├── index.ts            # express app: mounts the API versions, starts the reminder job
    ├── Dockerfile
    ├── seed.ts             # npm run seed;  seedData.ts: resets DB and inserts demo data
    ├── api/v1.ts           # version 1 of the API: which routes belong to it
    ├── core/               # used by all modules
    │   ├── env.ts          # loads .env
    │   ├── database.ts     # PostgreSQL: query(), transaction(), creates tables
    │   ├── http.ts         # read() / write(): steps → answer
    │   ├── allowedKeys.ts  # the keys and values the server accepts (copied from catalog.ts)
    │   ├── receivePhoto.ts photoFiles.ts   # uploads: receive, store, URL, delete
    │   ├── s3.ts           # puts photos into S3, signed URLs
    │   ├── settings.ts     # everything from .env
    │   ├── limiter.ts      # counts login attempts
    │   └── auth.ts         # requireUser / requireMember / requireGroupAdmin / requireSuperAdmin
    ├── modules/            # modular MVC: one folder per feature. In each of them:
    │   │                   #   Routes = URL → steps (checks, controller), Controller = input + rules,
    │   │                   #   Model = the SQL of one table, View = the JSON the client gets
    │   ├── auth/           # authRoutes  authController  sessionModel  emailCodeModel  registrationModel  password  mailer  google
    │   │                   # superAdmin
    │   ├── admin/          # adminRoutes  adminController
    │   ├── group/          # groupRoutes  groupController  groupModel  groupView
    │   ├── user/           # userRoutes  userController  userModel  userView  leaveGroup
    │   ├── item/           # itemRoutes  itemController  itemModel  itemView  removeItem
    │   ├── loan/           # loanRoutes  loanController  loanModel  loanView
    │   │                   # loanRole (check), reminders
    │   ├── message/        # messageRoutes  messageController  messageModel  messageView (the inbox)
    │   └── demo/           # demoRoutes  demoController (fast-forward)
    ├── uploads/.gitkeep
    └── .env.example        # all settings;  docker.env: super admin for docker compose
```

Keep files small and readable. One concern per file. Prefer simple functions over abstractions.

---

## 5. Data model (PostgreSQL)

```sql
CREATE TABLE groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- join code, e.g. 'SAKURA-2611'
  name TEXT NOT NULL,                 -- shown as-is (proper noun)
  type TEXT NOT NULL CHECK (type IN ('building','block')),
  city TEXT NOT NULL,
  image TEXT                          -- the group's icon, like users.avatar; NULL = none
);

CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,         -- lowercase
  email_verified BOOLEAN NOT NULL DEFAULT false, -- proved with a code or Google
  password_hash TEXT,                 -- scrypt; NULL = logs in with a code or Google
  google_sub TEXT UNIQUE,             -- Google's id of the account
  google_only BOOLEAN NOT NULL DEFAULT false, -- registered with Google: no other way to log in
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin','group_admin','user')),
  group_id INTEGER REFERENCES groups(id),  -- NULL = in no group
  joined_at TIMESTAMPTZ,              -- when they joined that group
  nickname TEXT NOT NULL DEFAULT '',  -- max 20 chars, asked when joining a group
  avatar TEXT,                        -- profile photo, like handover_photo; NULL = none
  lang TEXT NOT NULL CHECK (lang IN ('en','ja','ja-easy','bn')),
  elder_mode BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false, -- seeded; its password is public, so it works only in demo mode
  deactivated_at TIMESTAMPTZ,         -- set by a super admin: can't log in
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (role <> 'group_admin' OR group_id IS NOT NULL)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,        -- SHA-256 of the token; the token itself is only on the device
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,            -- scrypt of the 6-digit code
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE registrations (
  ticket_hash TEXT PRIMARY KEY,       -- SHA-256 of the ticket: the email was proved, the password comes next
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  item_key TEXT NOT NULL,             -- key from catalog.ts, e.g. 'futon_dryer'
  max_days INTEGER NOT NULL DEFAULT 3,
  spot TEXT NOT NULL,                 -- key from SPOTS, e.g. 'entrance'
  trusted_only BOOLEAN NOT NULL DEFAULT false,  -- true = only for people with an on-time return
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  removed_at TIMESTAMPTZ              -- set when the owner removes it (soft delete); NULL = on the shelf
);

CREATE TABLE loans (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  borrower_id INTEGER NOT NULL REFERENCES users(id),
  lender_id INTEGER NOT NULL REFERENCES users(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','active','returned')),
  handover_photo TEXT,                -- 's3:photos/xxx.jpg' or '/uploads/xxx.jpg'
  return_photo TEXT,
  returned_at TIMESTAMPTZ,            -- when the borrower sent the return photo
  reminded_soon_at TIMESTAMPTZ,
  reminded_overdue_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  from_user_id INTEGER REFERENCES users(id),   -- NULL = system message (reminders)
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  phrase_key TEXT NOT NULL,           -- e.g. 'request', 'accept', 'sys.dueSoon'
  params JSONB NOT NULL DEFAULT '{}', -- { item, start, end, spot, name }
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

**Golden rule: never store translated text in the database.** Store `phrase_key` + `params` only.
Params contain *keys* and *raw values* (`item: 'futon_dryer'`, `spot: 'entrance'`, ISO dates,
`name: 'Sato'`), and the client renders them in the viewer's language.

### Loan status flow
```
pending ──accept──▶ accepted ──(lender uploads handover photo)──▶ accepted + handover_photo
   │                                   ──(borrower confirms received)──▶ active
   ├─decline──▶ declined                active ──(borrower uploads return photo)──▶ active + return_photo
   └─cancel───▶ cancelled                      ──(lender confirms return)──▶ returned
```
Item status: `available` → `reserved` (on accept) → `lent` (on received) → `available` (on returned,
declined-after-accept is not possible). Accepting a loan auto-declines other pending loans for that item
(send them the `decline` phrase).

**One open request per person and item**: `POST /api/v1/loans` answers `409` `{error, loan_id}` if the borrower already has a `pending` or `accepted` loan for that item (`GET /api/v1/items/:id` returns its id as `my_loan_id`, else `null`).

**Removing an item is a soft delete** (loans point to items, so the row must stay): only an `available`
item can be removed; it gets `removed_at`, its pending loans are declined (send them the `decline`
phrase), and it disappears from the shelf and My items. Old loans and messages still find it.
Removed items can never be requested.

**Trust**: only loans with status `returned` count. A return was on time if `returned_at <= end_at`
(`returned_at` = the moment of the return photo, however slowly the lender confirms it), otherwise late.
A user is *trusted* with at least one on-time return; `trusted_only` items can be requested by them only.

**Leaving** is possible only without `accepted` or `active` loans. The user's available items are removed
(soft delete, see above), their own pending requests become `cancelled` (lenders get the `cancel` phrase),
and `group_id` becomes NULL: they are no longer counted or listed as a member.

---

## 6. API (all JSON, all under `/api/v1`, all require `Authorization: Bearer <token>` except `GET /groups/:code` and logging in)

| Method & path | Who | Does | Message created |
|---|---|---|---|
| `GET /api/v1/auth/config` | anyone | what the login page can offer `{google_client_id,email_code,demo_mode}` | – |
| `POST /api/v1/auth/email-codes` `{email,purpose:'register'\|'login'\|'reset',lang}` | anyone | sends a 6-digit code (`409` email taken / `404` no account, `429` too many attempts) | – |
| `POST /api/v1/auth/email-codes/verify` `{email,code,purpose}` / `POST /api/v1/auth/register` or `/auth/reset-password` `{ticket,password}` | anyone | → `{ticket}` (15 minutes) / new account or new password → `{token,user,group}` | – |
| `POST /api/v1/me/password` `{current_password,password}` | user | new password (`403` wrong or demo account) | – |
| `POST /api/v1/group-admin/image` (multipart `photo`) / `DELETE /api/v1/group-admin/image` | group admin | the group's icon → `group` | – |
| `POST /api/v1/me/avatar` (multipart `photo`) / `DELETE /api/v1/me/avatar` | user | profile photo → `{user,group}` | – |
| `POST /api/v1/auth/login` `{email,password}` / `POST /api/v1/auth/login-with-code` `{email,code}` | anyone | → `{token,user,group}` (`401` wrong, `403` deactivated, `409 {use_google}`) | – |
| `POST /api/v1/auth/google` `{credential,lang}` | anyone | checks Google's ID token, logs in (creates the account if new) | – |
| `DELETE /api/v1/auth/session` | user | log out on this device | – |
| `GET /api/v1/me/group/members` / `DELETE /api/v1/me/group/members/:id` / `POST /api/v1/me/group/change-code` | group admin | members (no emails), remove one (`409` during a loan), new join code | like leaving |
| `GET /api/v1/admin/groups` / `GET /api/v1/admin/users` / `PATCH /api/v1/admin/users/:id` `{role?,active?}` | super admin | all groups, all accounts, change a role, deactivate | – |
| `GET /api/v1/groups/:code` | anyone | group preview `{name,type,city,member_count}` | – |
| `POST /api/v1/groups` `{name,type,city,nickname,lang,create_anyway?}` | user in no group | creates a group with a random, unique join code → `{user,group}`; the creator is its admin. `409 {error,existing_name}` if the same city has a group with the same name (ignoring case and spaces), unless `create_anyway` is `true` | – |
| `POST /api/v1/groups/:code/members` `{nickname,lang}` | user in no group | join → `{user,group}` | – |
| `GET /api/v1/me` / `PATCH /api/v1/me` `{nickname,lang,elder_mode}` | user | read/update me | – |
| `DELETE /api/v1/me/group` | member | leave the group, see section 5 (`409` with an accepted or active loan, `403` for seeded demo users) | `decline` → borrowers waiting for my items; `cancel` → lenders of my pending requests |
| `GET /api/v1/items` | user | items in my group + owner nickname + status + `trusted_only` | – |
| `GET /api/v1/items/:id` | user (same group) | one item + owner nickname + owner lang (the item page previews the request in the owner's language) + `my_loan_id` + `allowed_for_me` (`false`: trusted neighbors only, and I'm not one) | – |
| `GET /api/v1/me/items` / `POST /api/v1/items` `{item_key,max_days,spot,trusted_only?}` / `PATCH /api/v1/items/:id` `{trusted_only}` / `DELETE /api/v1/items/:id` | owner | manage my items (can't delete if reserved/lent; delete = soft delete, see section 5) | `decline` → pending borrowers (on delete) |
| `POST /api/v1/loans` `{item_id,start_at,end_at}` | borrower | create pending loan, starting less than 3 days from now (`403` if the item is for trusted neighbors only and I'm not one) | `request` → lender |
| `GET /api/v1/loans` | user | my loans as borrower and lender, with item + other user | – |
| `GET /api/v1/loans/:id` | participant | loan + messages (+ sender lang for "show original"); for the lender also `borrower_trust` `{joined_days,on_time,late}` | – |
| `POST /api/v1/loans/:id/accept` | lender | → accepted, item reserved (`409` if `end_at` has passed) | `accept` → borrower |
| `POST /api/v1/loans/:id/decline` `{reason:'default'\|'busy'}` | lender | → declined | `decline` / `declineBusy` → borrower |
| `POST /api/v1/loans/:id/cancel` | borrower (pending only) | → cancelled | `cancel` → lender |
| `POST /api/v1/loans/:id/handover-photo` (multipart `photo`) | lender | save handover_photo | `handoverPhoto` → borrower |
| `POST /api/v1/loans/:id/confirm-handover` | borrower | → active, item lent | `received` → lender |
| `POST /api/v1/loans/:id/return-photo` (multipart `photo`) | borrower | save return_photo | `returned` → lender |
| `POST /api/v1/loans/:id/confirm-return` | lender | → returned, item available | `returnConfirmed` → borrower |
| `POST /api/v1/loans/:id/messages` `{phrase_key}` | participant | only keys in QUICK_REPLIES, only when `accepted`, `active` or `returned` (else `409`) | that phrase → other side |
| `GET /api/v1/me/inbox` | user | unread messages to me (with loan + item info; a `request` also has `borrower_trust`) | – |
| `POST /api/v1/me/inbox/mark-read` `{ids}` | user | mark read | – |
| `POST /api/v1/demo/loans/:id/fast-forward` `{to:'dueSoon'\|'overdue'}` | participant, DEMO_MODE only | moves `end_at` to now+12h or now−1h and `start_at` along with it (same loan length), also in that loan's messages, then runs the reminder check immediately | reminders |

**Naming**: plural nouns for collections (`/items`, `/loans`), everything of my own under `/me`, kebab-case paths,
snake_case fields. Steps of a loan that are more than changing a field are verbs: `POST /loans/:id/accept`.

**Versions**: breaking changes go into a new version (`server/api/v2.ts`, mounted at `/api/v2`), next to v1.
The client's version is `API_BASE` in `client/src/core/api.ts`. `GET /api/health` has no version.

### Message params (keep it uniform)
Every message the server creates for a loan uses the same params object, so any phrase can use any
placeholder: `{ item: item.item_key, spot: item.spot, start: loan.start_at, end: loan.end_at,
name: <nickname of the OTHER person from the recipient's point of view> }`.
Write one helper `createMessage(loan, fromUserId, toUserId, phraseKey)` in `server/modules/message/messageModel.ts` that builds this.

### Server rules
- Every route checks the user belongs to the same group as the item/loan, and the right role
  (lender vs borrower). Return `403` otherwise.
- Items with `removed_at` set are hidden from the shelf and My items, and `POST /api/v1/loans` must refuse them.
- Validate `phrase_key` against a whitelist; validate `item_key`/`spot` against the catalog
  (keep a copy of allowed keys in `server/core/allowedKeys.ts` — just arrays of strings).
- Photo upload: images only, max 5 MB, random filename.
- Demo routes are mounted only when `DEMO_MODE=true`; only then can seeded users (`is_demo`) log in.
- Passwords and codes are stored as scrypt hashes, session tokens as SHA-256. Attempts are limited. Whoever proves an
  address (code or Google) locks out somebody who registered it before without proof.
- Reminder job (`modules/loan/reminders.ts`): every 30 s, for `active` loans without a return photo:
  - `end_at > now`, `end_at - now <= 24h` and `reminded_soon_at IS NULL` → `sys.dueSoon` to borrower,
    set timestamp.
  - `end_at < now` and `reminded_overdue_at IS NULL` → `sys.overdue` to borrower **and**
    `sys.overdueLender` to lender, set timestamp.
  - Params: `{ item, end, spot, name }` where `name` = the *other* person's nickname for each recipient.

---

## 7. i18n — how rendering works (`client/src/i18n/index.ts`)

**Already written — use it, don't rewrite it:** `client/src/i18n/index.ts`, the four language JSON
files and `client/src/data/catalog.ts`. Exported functions: `t`, `renderPhrase`, `itemName`,
`spotName`, `categoryName`, `tip`, `formatDate`, `displayName`, `meta`.

Language files have sections: `meta`, `ui`, `items`, `categories`, `spots`, `phrases`, `tips`.

- `t(lang, 'ui.shelf.title', {group})` → UI string with `{placeholders}` replaced.
- `renderPhrase(lang, phrase_key, params)`:
  1. Look up `phrases[phrase_key]` (with fallback chain).
  2. Replace `{item}` → `items[params.item]`, `{spot}` → `spots[params.spot]`,
     `{start}`/`{end}` → `formatDate(lang, iso)`, `{name}` → nickname + honorific
     (`さん` for `ja` and `ja-easy`; nothing for `en`; nothing for `bn`), `{n}` → number.
- `formatDate(lang, iso)` uses `Intl.DateTimeFormat` with locale (`en-US`, `ja-JP`, `ja-JP`, `bn-BD`),
  options `{ month:'short', day:'numeric', weekday:'short', hour:'numeric', minute:'2-digit' }`
  and **`timeZone: 'Asia/Tokyo'`** (the app is for Japan; demo machines may be in Bangladesh).
- **Never hardcode user-visible text in components.** Every new UI string must be added to
  **all** language files (`en`, `ja`, `bn`; `ja-easy` only if it should differ from `ja`).

The phrase files and item catalog are hand-written and will be reviewed by a native Japanese speaker.
**Do not rewrite or "improve" existing phrases** — only add new keys when needed.

---

## 8. UI / design rules

- Mobile-first and responsive (content up to 1024 px): one column on phones; from 768 px cards and more columns, from
  960 px two columns on My items and the loan page.
- Header on every member page: app and group name, my name (wide screens), a bell with the list of unread messages.
- Navigation: Shelf · My items · Loans (badge with unread count) · Settings. At the bottom on phones, in the header
  from 768 px.
- The shelf has a search field, "Available only" and category filters (all on the device, nothing is sent). My own
  items are below the neighbors' items.
- Warm, calm, neighborly look: off-white background, one accent color (Japanese indigo 藍色
  `#1f4b6e`), rounded cards, emoji item icons (from catalog), inline SVG icons for controls (`Icons.tsx`). No web
  fonts from other servers.
- Big tap targets (min 44 px; **elder mode: min 64 px and base font 22 px**).
- Elder mode is a class on `<body>` (`elder`) that CSS uses to scale everything.
- Message bubbles: mine on the right, theirs on the left, system reminders centered with a bell.
- Show the handover / return photos inside the loan page.
- Inline sections instead of dialogs. The only dialog is adding an item (`AddItemDialog`).

---

## 9. Seed / demo data (`npm run seed`)

Setting: **Nagasaki**. Two groups:
- `SAKURA-2611` — "Sakura Heights" (`building`, Nagasaki)  ← main demo group
- `HAMA-3CHOME` — "Hamaguchi-machi 3-chome" (`block`, Nagasaki)

Seeded users in Sakura Heights (Rahim is NOT seeded — he joins live in the demo):
| nickname | lang | elder | items (item_key, max_days, spot) |
|---|---|---|---|
| Sato | ja | 1 | futon_dryer (3, entrance), takoyaki_maker (2, entrance), ladder (1, bike_parking) |
| Tanaka | ja | 0 | projector (2, mailbox, trusted only), power_drill (1, mailbox), dehumidifier (7, entrance) |
| Yamamoto | ja | 0 | hot_plate (2, entrance), donabe (2, entrance) |
| Maria | en | 0 | suitcase (7, entrance), camping_tent (3, bike_parking) |
| Ayesha | bn | 0 | bluetooth_speaker (2, mailbox), rice_cooker_large (2, entrance) |

Hamaguchi-machi block: Inoue (ja, elder) lawn_mower (1, notice_board), hedge_trimmer (1, notice_board);
Kobayashi (ja) high_pressure_washer (1, notice_board).

All seeded users joined 30 days ago and have `is_demo`. They log in as `<nickname>@otonari.example` (lowercase), password
`otonari2611`. Tanaka and Inoue are the group admins.

Also seed one already-returned loan (Maria borrowed Tanaka's projector last week) so history isn't empty.

`npm run seed:empty` resets the database and creates only the two groups (no users, items or loans), for a
demo with real people. Both seeds also delete all photos in `server/uploads/` (`.gitkeep` stays).

---

## 10. The 5-step demo script (build exactly this)

Two browser windows side by side. Left = Rahim (phone-sized), right = Sato (elder mode, Japanese).

1. **Join** — Rahim scans the poster / opens `/join?code=SAKURA-2611`, registers, picks nickname "Rahim",
   language English → sees the Sakura Heights shelf. (Right window: log in as `sato@otonari.example`.)
2. **Request** — Rahim taps 🛏️ Futon dryer → Tomorrow · Morning · 3 days. Preview shows the polite
   Japanese Sato will see → taps "Can I borrow it?".
3. **Answer** — Sato's banner pops up in polite Japanese, 🔊 reads it aloud. Sato taps はい →
   Rahim instantly sees "Yes, please go ahead! I'll hand it over at the building entrance…".
   Rahim switches to Bengali in Settings → the same conversation re-renders in Bengali.
4. **Handover** — Sato takes a condition photo; Rahim taps "I received it" (with an etiquette tip).
5. **Return (the "after")** — demo fast-forward to overdue → Rahim gets a polite reminder, Sato gets
   "we reminded him for you". Rahim returns with a photo, Sato confirms → futon dryer back on the
   shelf, both photos in the history, a thank-you exchanged — **no one typed a single message.**

---

## 11. Working rules for Claude

- Keep code **simple and readable** for a 5-person student team who must explain it to judges:
  short functions, clear names, brief comments explaining *why*. No clever abstractions,
  no state-management libraries, no CSS frameworks. Simple TypeScript: plain interfaces and unions, no
  enums (Node can't run them), no clever types. `npm run typecheck` must pass.
- Build in small vertical slices; after each slice the app must still run (`npm run dev`).
- After finishing a step, tell the user exactly how to test it and suggest a commit message.
- Ask before adding any new dependency not listed in section 3.
- Ask before changing the data model, API, scope or anything in this file.
- Never add free-text messaging, maps, payments, AI calls or other external APIs (only email, Google login and S3).
- Never commit `.env`, the database file or uploaded photos.
