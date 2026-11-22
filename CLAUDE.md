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

The only free text a user ever types is their **nickname** (max 20 chars).

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
- Add items to share by picking from the **fixed item catalog** (`client/src/data/catalog.js`),
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
  `/join?code=XXXX`, text in Japanese + English + Bengali. Also serves as our security layer:
  only people who can physically see the notice board get the code.
- **PWA**: installable (manifest + service worker via `vite-plugin-pwa`).

### NOT in scope (roadmap only — do not build)
Thank-you stamps, more languages, stronger verification (code rotation / management company),
push notifications, maps, payments, SMS/email, real accounts, admin panel.

---

## 3. Tech stack (fixed)

- **Client**: React 18 + Vite, **plain JavaScript (no TypeScript)**, `react-router-dom`, plain CSS
  (`client/src/styles.css`), `vite-plugin-pwa`, `qrcode` (for the poster).
- **Server**: Node.js 20+ (LTS), Express, `better-sqlite3`, `multer` (photo upload), `cors`, `dotenv`.
- **Database**: SQLite file `server/otonari.db` (git-ignored). Recreated + seeded with `npm run seed`.
- **Photos**: saved to `server/uploads/` (git-ignored, keep `.gitkeep`), served at `/uploads/...`.
- **Dev**: root `package.json` runs both with `concurrently` → `npm run dev`.
  Client on port 5173, server on port 3001, Vite proxies `/api` and `/uploads` to 3001.
- **No API keys or secrets exist in this project.** `.env` holds only `PORT` and `DEMO_MODE`.
  `.env` is in `.gitignore`; commit `.env.example`.

---

## 4. Folder structure

```
otonari/
├── CLAUDE.md
├── README.md
├── package.json            # root: "dev", "seed", "build", "start" scripts (concurrently)
├── .gitignore              # node_modules, .env, server/otonari.db, server/uploads/*, client/dist
├── client/
│   ├── index.html
│   ├── vite.config.js      # react plugin, PWA plugin, proxy /api and /uploads → :3001
│   ├── public/             # icons for PWA (icon-192.png, icon-512.png)
│   └── src/
│       ├── main.jsx
│       ├── App.jsx         # routes + bottom nav + notification banner
│       ├── api.js          # fetch wrapper; adds "Authorization: Bearer <token>"
│       ├── styles.css
│       ├── i18n/
│       │   ├── index.js    # t(), renderPhrase(), formatDate(), useLang()
│       │   ├── en.json  ja.json  ja-easy.json  bn.json
│       ├── data/
│       │   └── catalog.js  # ITEMS, CATEGORIES, SPOTS, QUICK_REPLIES, DURATIONS
│       ├── components/
│       │   ├── Banner.jsx         # new-message banner (polling)
│       │   ├── PhraseBubble.jsx   # renders one message + "show original" + 🔊
│       │   ├── SpeakButton.jsx
│       │   ├── TipCard.jsx
│       │   ├── ChipGroup.jsx      # big tappable chips
│       │   └── PhotoCapture.jsx   # <input type="file" accept="image/*" capture="environment">
│       └── pages/
│           ├── Join.jsx        # /join (reads ?code=)
│           ├── Shelf.jsx       # /  (group shelf)
│           ├── ItemPage.jsx    # /item/:id (borrow request + preview)
│           ├── MyItems.jsx     # /my-items (add/remove my items)
│           ├── Loans.jsx       # /loans (incoming + outgoing)
│           ├── LoanPage.jsx    # /loan/:id (messages, actions, photos, quick replies)
│           ├── Settings.jsx    # /settings (language, elder mode, poster link, leave)
│           └── Poster.jsx      # /poster (printable QR poster)
└── server/
    ├── index.js            # express app, middleware, mounts routes, starts reminder job
    ├── db.js               # opens SQLite, creates tables, small helper functions
    ├── auth.js             # middleware: token → req.user
    ├── seed.js             # resets DB and inserts demo data
    ├── reminders.js        # setInterval(checkReminders, 30_000)
    ├── routes/
    │   ├── groups.js  items.js  loans.js  inbox.js  demo.js
    ├── uploads/.gitkeep
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  item_key TEXT NOT NULL,             -- key from catalog.js, e.g. 'futon_dryer'
  max_days INTEGER NOT NULL DEFAULT 3,
  spot TEXT NOT NULL,                 -- key from SPOTS, e.g. 'entrance'
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','lent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

---

## 6. API (all JSON, all under `/api`, all require `Authorization: Bearer <token>` except join + demo)

| Method & path | Who | Does | Message created |
|---|---|---|---|
| `GET /api/groups/by-code/:code` | anyone | group preview `{name,type,city,memberCount}` | – |
| `POST /api/join` `{code,nickname,lang}` | anyone | creates user → `{token,user,group}` | – |
| `GET /api/me` / `PATCH /api/me` `{lang,elder_mode}` | user | read/update me | – |
| `GET /api/shelf` | user | items in my group + owner nickname + status | – |
| `GET /api/my-items` / `POST /api/items` `{item_key,max_days,spot}` / `DELETE /api/items/:id` | owner | manage my items (can't delete if reserved/lent) | – |
| `POST /api/loans` `{item_id,start_at,end_at}` | borrower | create pending loan | `request` → lender |
| `GET /api/loans` | user | my loans as borrower and lender, with item + other user | – |
| `GET /api/loans/:id` | participant | loan + messages (+ sender lang for "show original") | – |
| `POST /api/loans/:id/accept` | lender | → accepted, item reserved | `accept` → borrower |
| `POST /api/loans/:id/decline` `{reason:'default'\|'busy'}` | lender | → declined | `decline` / `declineBusy` → borrower |
| `POST /api/loans/:id/cancel` | borrower (pending only) | → cancelled | `cancel` → lender |
| `POST /api/loans/:id/handover` (multipart `photo`) | lender | save handover_photo | `handoverPhoto` → borrower |
| `POST /api/loans/:id/received` | borrower | → active, item lent | `received` → lender |
| `POST /api/loans/:id/return` (multipart `photo`) | borrower | save return_photo | `returned` → lender |
| `POST /api/loans/:id/return-confirmed` | lender | → returned, item available | `returnConfirmed` → borrower |
| `POST /api/loans/:id/quick-reply` `{phrase_key}` | participant | only keys in QUICK_REPLIES | that phrase → other side |
| `GET /api/inbox` | user | unread messages to me (with loan + item info) | – |
| `POST /api/inbox/read` `{ids}` | user | mark read | – |
| `GET /api/demo/users` | DEMO_MODE only | seeded users (for "continue as") | – |
| `POST /api/demo/login` `{user_id}` | DEMO_MODE only | returns that user's token | – |
| `POST /api/demo/fast-forward/:loanId` `{to:'dueSoon'\|'overdue'}` | DEMO_MODE only | moves `end_at` to now+12h or now−1h, then runs the reminder check immediately | reminders |

### Message params (keep it uniform)
Every message the server creates for a loan uses the same params object, so any phrase can use any
placeholder: `{ item: item.item_key, spot: item.spot, start: loan.start_at, end: loan.end_at,
name: <nickname of the OTHER person from the recipient's point of view> }`.
Write one helper `createMessage(loan, fromUserId, toUserId, phraseKey)` in `server/db.js` that builds this.

### Server rules
- Every route checks the user belongs to the same group as the item/loan, and the right role
  (lender vs borrower). Return `403` otherwise.
- Validate `phrase_key` against a whitelist; validate `item_key`/`spot` against the catalog
  (keep a copy of allowed keys in `server/allowedKeys.js` — just arrays of strings).
- Photo upload: images only, max 5 MB, random filename.
- Demo routes are mounted only when `process.env.DEMO_MODE === 'true'`.
- Reminder job (`reminders.js`): every 30 s, for `active` loans:
  - `end_at - now <= 24h` and `reminded_soon_at IS NULL` → `sys.dueSoon` to borrower, set timestamp.
  - `end_at < now` and `reminded_overdue_at IS NULL` → `sys.overdue` to borrower **and**
    `sys.overdueLender` to lender, set timestamp.
  - Params: `{ item, end, spot, name }` where `name` = the *other* person's nickname for each recipient.

---

## 7. i18n — how rendering works (`client/src/i18n/index.js`)

**Already written — use it, don't rewrite it:** `client/src/i18n/index.js`, the four language JSON
files and `client/src/data/catalog.js`. Exported functions: `t`, `renderPhrase`, `itemName`,
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
| Tanaka | ja | 0 | projector (2, mailbox), power_drill (1, mailbox), dehumidifier (7, entrance) |
| Yamamoto | ja | 0 | hot_plate (2, entrance), donabe (2, entrance) |
| Maria | en | 0 | suitcase (7, entrance), camping_tent (3, bike_parking) |
| Ayesha | bn | 0 | bluetooth_speaker (2, mailbox), rice_cooker_large (2, entrance) |

Hamaguchi-machi block: Inoue (ja, elder) lawn_mower (1, notice_board), hedge_trimmer (1, notice_board);
Kobayashi (ja) high_pressure_washer (1, notice_board).

Also seed one already-returned loan (Maria borrowed Tanaka's projector last week) so history isn't empty.

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
  no state-management libraries, no TypeScript, no CSS frameworks.
- Build in small vertical slices; after each slice the app must still run (`npm run dev`).
- After finishing a step, tell the user exactly how to test it and suggest a commit message.
- Ask before adding any new dependency not listed in section 3.
- Ask before changing the data model, API, scope or anything in this file.
- Never add free-text messaging, maps, logins, payments, AI calls or external APIs.
- Never commit `.env`, the database file or uploaded photos.
