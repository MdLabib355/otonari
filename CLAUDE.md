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

The only free text a user ever types is their **nickname** (max 20 chars), plus the **group name** and
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

### Must-have 1 — Neighborhood shelf
- Join a **neighborhood group** (type `building` or `block`) with a **join code** (from the QR poster).
  No account, no password, no email. User picks nickname + language. Identity is a random token
  stored in `localStorage`.
- **Start a new neighborhood**: the Join page has a link "Set up Otonari for your building or block", for a
  building manager or neighborhood association leader. They enter a group name, type and city, and get a
  random join code (`XXXX-XXXX`) and a button to the group's poster. The creator does not become a member.
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
  their token stops working.

### Must-have 3 — Handover & return loop
- Handover: lender takes a **condition photo** → borrower taps **"I received it"** → loan becomes active.
- Return: borrower takes a **return photo** → lender taps **"I got it back"** → item available again.
- **Automatic polite reminders** (so the lender never has to ask):
  - 24 h before due → reminder to borrower.
  - When overdue → reminder to borrower AND a notice to the lender saying "we reminded them for you".
- In-app notifications: the client polls `/api/inbox` every 5 s and shows a banner for new messages.

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
push notifications, maps, payments, SMS/email, real accounts, admin panel.

---

## 3. Tech stack (fixed)

- **Client**: React 18 + Vite, **TypeScript (strict)**, `react-router-dom`, plain CSS
  (`client/src/styles/`), `vite-plugin-pwa`, `qrcode` (for the poster).
- **Server**: Node.js 22.18+ (runs the `.ts` files directly, no build step), TypeScript, Express, `better-sqlite3`, `multer` (photo upload), `cors`, `dotenv`,
  `nodemon` (dev only: restarts the server when a server `.ts` file is saved).
- **Database**: SQLite file `server/otonari.db` (git-ignored). Recreated + seeded with `npm run seed`.
- **Photos**: saved to `server/uploads/` (git-ignored, keep `.gitkeep`), served at `/uploads/...`.
- **Dev**: root `package.json` runs both with `concurrently` → `npm run dev`.
  Client on port 5173, server on port 3001, Vite proxies `/api` and `/uploads` to 3001.
  The server runs under `nodemon` (config in `server/package.json`): it watches only server `.ts` files and
  ignores `node_modules`, `uploads/` and the database files, so database writes, seeding and photo uploads
  never restart it. (Not `node --watch`: on Windows it restarts when files are merely read.)
- **For the demo, always use `npm run build` + `npm start` (no file watcher).**
- **Deploy** (Render.com, one free Node web service): build `npm run render-build`, start `npm start`,
  environment `NODE_VERSION=22` and `DEMO_MODE=true` (Render sets `PORT`). The free plan loses the database
  and the photos on every restart, so a server that starts without any groups runs the normal seed.
- **Types**: `shared/types.ts` (the API answers, used by both sides with `import type`) and `server/types.ts`
  (database rows). `typescript` and the `@types/*` packages are dev dependencies; `npm run typecheck` checks
  both sides. Vite and Node only remove the types, they don't check them.
- **No API keys or secrets exist in this project.** `.env` holds only `PORT` and `DEMO_MODE`.
  `.env` is in `.gitignore`; commit `.env.example`.

---

## 4. Folder structure

```
otonari/
├── CLAUDE.md
├── README.md
├── package.json            # root: "dev", "seed", "seed:empty", "build", "render-build", "typecheck", "start" scripts
├── .gitignore              # node_modules, .env, server/otonari.db, server/uploads/*, client/dist
├── docs/screenshots/       # the pictures in README.md
├── shared/types.ts         # types of the API answers, used by client and server
├── client/
│   ├── index.html
│   ├── tsconfig.json       # type checking only
│   ├── vite.config.ts      # react plugin, PWA plugin, proxy /api and /uploads → :3001
│   ├── make-icons.ps1      # draws the icons in public/
│   ├── public/             # icons for PWA (icon-192.png, icon-512.png, icon-maskable-512.png)
│   └── src/
│       ├── main.tsx        # starts the app, loads the styles
│       ├── app/            # App (routes), BottomNav, serviceWorker (reloads an open app after a deploy)
│       ├── core/           # used by all features
│       │   ├── api.ts          # fetch wrapper; adds "Authorization: Bearer <token>"
│       │   ├── UserContext.ts  # useUser() / useMember(): me, my group, my language and my inbox
│       │   └── useInbox.ts     # my unread messages (banner, Loans badge, loan page)
│       ├── components/     # used by several features: ChipGroup  SpeakButton  TipCard  TrustLine
│       ├── features/       # one folder per feature, like the modules of the server
│       │   ├── group/      # Join (/join)  NewGroup  Poster (/poster)
│       │   ├── user/       # Settings (/settings)
│       │   ├── item/       # Shelf (/)  ItemPage (/item/:id)  BorrowForm  borrowTimes
│       │   │               # MyItems (/my-items)  MyItemRow  TrustedSwitch
│       │   ├── loan/       # Loans (/loans)  LoanPage (/loan/:id)  LoanHeader  PendingActions  HandoverStep
│       │   │               # ReturnStep  QuickReplies  LoanPhotos  PhotoCapture  loanProps
│       │   ├── message/    # Banner (polling)  PhraseBubble ("show original" + 🔊)
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
    ├── index.ts            # express app: mounts the modules' routes, starts the reminder job
    ├── seed.ts             # resets DB and inserts demo data
    ├── core/               # used by all modules
    │   ├── database.ts     # opens SQLite, creates tables
    │   ├── allowedKeys.ts  # the keys and values the server accepts (copied from catalog.ts)
    │   └── auth.ts         # middleware: token → req.user
    ├── modules/            # modular MVC: one folder per feature. In each of them:
    │   │                   #   Routes = URL → middleware → controller, Controller = input + rules,
    │   │                   #   Model = the SQL of one table, View = the JSON the client gets
    │   ├── group/          # groupRoutes  groupController  groupModel  groupView
    │   ├── user/           # userRoutes  userController  userModel  userView  leaveGroup
    │   ├── item/           # itemRoutes  itemController  itemModel  itemView  removeItem
    │   ├── loan/           # loanRoutes  loanController  loanModel  loanView
    │   │                   # loanRole (middleware), receivePhoto (middleware), photoFiles, reminders
    │   ├── message/        # messageRoutes  messageController  messageModel  messageView (the inbox)
    │   └── demo/           # demoRoutes  demoController (no table and no view of its own)
    ├── uploads/.gitkeep
    ├── .npmrc              # ignore-scripts: better-sqlite3 has ready-made binaries, npm must not compile it
    └── .env.example        # PORT=3001  DEMO_MODE=true
```

Keep files small and readable. One concern per file. Prefer simple functions over abstractions.

---

## 5. Data model (SQLite)

```sql
CREATE TABLE groups (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- join code, e.g. 'SAKURA-2611'
  name TEXT NOT NULL,                 -- shown as-is (proper noun)
  type TEXT NOT NULL CHECK (type IN ('building','block')),
  city TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  nickname TEXT NOT NULL,             -- max 20 chars
  lang TEXT NOT NULL CHECK (lang IN ('en','ja','ja-easy','bn')),
  elder_mode INTEGER NOT NULL DEFAULT 0,
  token TEXT UNIQUE NOT NULL,         -- crypto.randomUUID()
  is_demo INTEGER NOT NULL DEFAULT 0, -- 1 = seeded demo neighbor: anyone may "continue as" them in demo mode
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT                        -- set when they leave (their token stops working); NULL = member
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  item_key TEXT NOT NULL,             -- key from catalog.ts, e.g. 'futon_dryer'
  max_days INTEGER NOT NULL DEFAULT 3,
  spot TEXT NOT NULL,                 -- key from SPOTS, e.g. 'entrance'
  trusted_only INTEGER NOT NULL DEFAULT 0,  -- 1 = only for people with an on-time return
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT                     -- set when the owner removes it (soft delete); NULL = on the shelf
);

CREATE TABLE loans (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  borrower_id INTEGER NOT NULL REFERENCES users(id),
  lender_id INTEGER NOT NULL REFERENCES users(id),
  start_at TEXT NOT NULL,             -- ISO 8601
  end_at TEXT NOT NULL,               -- ISO 8601
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','active','returned')),
  handover_photo TEXT,                -- '/uploads/xxx.jpg'
  return_photo TEXT,
  returned_at TEXT,                   -- ISO 8601, when the borrower sent the return photo
  reminded_soon_at TEXT,
  reminded_overdue_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  from_user_id INTEGER REFERENCES users(id),   -- NULL = system message (reminders)
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  phrase_key TEXT NOT NULL,           -- e.g. 'request', 'accept', 'sys.dueSoon'
  params TEXT NOT NULL DEFAULT '{}',  -- JSON: { item, start, end, spot, name }
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

**One open request per person and item**: `POST /api/loans` answers `409` `{error, loan_id}` if the borrower already has a `pending` or `accepted` loan for that item (`GET /api/items/:id` returns its id as `my_loan_id`, else `null`).

**Removing an item is a soft delete** (loans point to items, so the row must stay): only an `available`
item can be removed; it gets `removed_at`, its pending loans are declined (send them the `decline`
phrase), and it disappears from the shelf and My items. Old loans and messages still find it.
Removed items can never be requested.

**Trust**: only loans with status `returned` count. A return was on time if `returned_at <= end_at`
(`returned_at` = the moment of the return photo, however slowly the lender confirms it), otherwise late.
A user is *trusted* with at least one on-time return; `trusted_only` items can be requested by them only.

**Leaving** is possible only without `accepted` or `active` loans. The user's available items are removed
(soft delete, see above), their own pending requests become `cancelled` (lenders get the `cancel` phrase),
and `left_at` is set: the token no longer works, and they are no longer counted or listed as a member.

---

## 6. API (all JSON, all under `/api`, all require `Authorization: Bearer <token>` except groups + join + demo users/login)

| Method & path | Who | Does | Message created |
|---|---|---|---|
| `GET /api/groups/by-code/:code` | anyone | group preview `{name,type,city,memberCount}` | – |
| `POST /api/groups` `{name,type,city,create_anyway?}` | anyone | creates a group with a random, unique join code → `{code,name,type,city}`; creates no user. `409 {error,existing_name}` if the same city has a group with the same name (ignoring case and spaces), unless `create_anyway` is `true` | – |
| `POST /api/join` `{code,nickname,lang}` | anyone | creates user → `{token,user,group}` | – |
| `GET /api/me` / `PATCH /api/me` `{lang,elder_mode}` | user | read/update me | – |
| `POST /api/leave` | user | leave the group, see section 5 (`409` with an accepted or active loan, `403` for seeded demo users) | `decline` → borrowers waiting for my items; `cancel` → lenders of my pending requests |
| `GET /api/shelf` | user | items in my group + owner nickname + status + `trusted_only` | – |
| `GET /api/items/:id` | user (same group) | one item + owner nickname + owner lang (the item page previews the request in the owner's language) + `my_loan_id` + `allowed_for_me` (`false`: trusted neighbors only, and I'm not one) | – |
| `GET /api/my-items` / `POST /api/items` `{item_key,max_days,spot,trusted_only?}` / `PATCH /api/items/:id` `{trusted_only}` / `DELETE /api/items/:id` | owner | manage my items (can't delete if reserved/lent; delete = soft delete, see section 5) | `decline` → pending borrowers (on delete) |
| `POST /api/loans` `{item_id,start_at,end_at}` | borrower | create pending loan, starting less than 3 days from now (`403` if the item is for trusted neighbors only and I'm not one) | `request` → lender |
| `GET /api/loans` | user | my loans as borrower and lender, with item + other user | – |
| `GET /api/loans/:id` | participant | loan + messages (+ sender lang for "show original"); for the lender also `borrower_trust` `{joined_days,on_time,late}` | – |
| `POST /api/loans/:id/accept` | lender | → accepted, item reserved (`409` if `end_at` has passed) | `accept` → borrower |
| `POST /api/loans/:id/decline` `{reason:'default'\|'busy'}` | lender | → declined | `decline` / `declineBusy` → borrower |
| `POST /api/loans/:id/cancel` | borrower (pending only) | → cancelled | `cancel` → lender |
| `POST /api/loans/:id/handover` (multipart `photo`) | lender | save handover_photo | `handoverPhoto` → borrower |
| `POST /api/loans/:id/received` | borrower | → active, item lent | `received` → lender |
| `POST /api/loans/:id/return` (multipart `photo`) | borrower | save return_photo | `returned` → lender |
| `POST /api/loans/:id/return-confirmed` | lender | → returned, item available | `returnConfirmed` → borrower |
| `POST /api/loans/:id/quick-reply` `{phrase_key}` | participant | only keys in QUICK_REPLIES, only when `accepted`, `active` or `returned` (else `409`) | that phrase → other side |
| `GET /api/inbox` | user | unread messages to me (with loan + item info; a `request` also has `borrower_trust`) | – |
| `POST /api/inbox/read` `{ids}` | user | mark read | – |
| `GET /api/demo/users` | DEMO_MODE only | seeded users (`is_demo`, for "continue as") | – |
| `POST /api/demo/login` `{user_id}` | DEMO_MODE only | returns that user's token; `403` unless the user is seeded (`is_demo`) | – |
| `POST /api/demo/fast-forward/:loanId` `{to:'dueSoon'\|'overdue'}` | participant, DEMO_MODE only | moves `end_at` to now+12h or now−1h and `start_at` along with it (same loan length), also in that loan's messages, then runs the reminder check immediately | reminders |

### Message params (keep it uniform)
Every message the server creates for a loan uses the same params object, so any phrase can use any
placeholder: `{ item: item.item_key, spot: item.spot, start: loan.start_at, end: loan.end_at,
name: <nickname of the OTHER person from the recipient's point of view> }`.
Write one helper `createMessage(loan, fromUserId, toUserId, phraseKey)` in `server/modules/message/messageModel.ts` that builds this.

### Server rules
- Every route checks the user belongs to the same group as the item/loan, and the right role
  (lender vs borrower). Return `403` otherwise.
- Items with `removed_at` set are hidden from the shelf and My items, and `POST /api/loans` must refuse them.
- Validate `phrase_key` against a whitelist; validate `item_key`/`spot` against the catalog
  (keep a copy of allowed keys in `server/core/allowedKeys.ts` — just arrays of strings).
- Photo upload: images only, max 5 MB, random filename.
- Demo routes are mounted only when `process.env.DEMO_MODE === 'true'`. "Continue as" works only for the seeded
  users (`is_demo`), never for people who joined with a code.
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

- Mobile-first, single column, max width 480 px centered on desktop.
- Bottom navigation: Shelf · My items · Loans (badge with unread count) · Settings.
- Warm, calm, neighborly look: off-white background, one accent color (indigo `#3f51b5` or similar
  Japanese indigo 藍色 `#264d73`), rounded cards, emoji item icons (from catalog, no image assets).
- Big tap targets (min 44 px; **elder mode: min 64 px and base font 22 px**).
- Elder mode is a class on `<body>` (`elder`) that CSS uses to scale everything.
- Message bubbles: mine on the right, theirs on the left, system reminders centered with 🔔.
- Show the handover / return photos inside the loan page.
- No modals that block (keep it simple: inline sections).

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

All seeded users joined 30 days ago (`created_at`) and have `is_demo = 1`.

Also seed one already-returned loan (Maria borrowed Tanaka's projector last week) so history isn't empty.

`npm run seed:empty` resets the database and creates only the two groups (no users, items or loans), for a
demo with real people. Both seeds also delete all photos in `server/uploads/` (`.gitkeep` stays).

---

## 10. The 5-step demo script (build exactly this)

Two browser windows side by side. Left = Rahim (phone-sized), right = Sato (elder mode, Japanese).

1. **Join** — Rahim scans the poster / opens `/join?code=SAKURA-2611`, picks nickname "Rahim",
   language English → sees the Sakura Heights shelf. (Right window: "continue as Sato" via demo mode.)
2. **Request** — Rahim taps 🛏️ Futon dryer → Tomorrow · Morning · 3 days. Preview shows the polite
   Japanese Sato will see → taps "Can I borrow it?".
3. **Answer** — Sato's banner pops up in polite Japanese, 🔊 reads it aloud. Sato taps はい →
   Rahim instantly sees "Yes, please go ahead! I'll hand it over at the building entrance…".
   Rahim switches to Bengali in Settings → the same conversation re-renders in Bengali.
4. **Handover** — Sato takes a condition photo; Rahim taps "I received it" (with an etiquette tip).
5. **Return (the "after")** — demo fast-forward to overdue → Rahim gets a polite reminder, Sato gets
   "we reminded him for you". Rahim returns with a photo, Sato confirms → futon dryer back on the
   shelf, both photos in the history, a thank-you exchanged — **no one typed a single word.**

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
- Never add free-text messaging, maps, logins, payments, AI calls or external APIs.
- Never commit `.env`, the database file or uploaded photos.
