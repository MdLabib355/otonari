# Otonari — Build prompts for Claude in VS Code

Copy each prompt into the Claude panel in VS Code, **one at a time, in order**.
Claude reads `CLAUDE.md` automatically, so prompts can stay short.
After every step: **test it → commit → push**. Never start a new step while the app is broken.

---

## Before you start (5 minutes, everyone)

1. Install **Node.js 20 or 22 LTS** and **Git**. Check: `node -v`, `git -v`.
2. Put this kit into the project folder so it looks like:
   ```
   otonari/
     CLAUDE.md
     BUILD_PROMPTS.md
     client/src/i18n/   (index.js, en.json, ja.json, ja-easy.json, bn.json)
     client/src/data/catalog.js
   ```
3. One person creates a **public** GitHub repo named `otonari`, pushes the kit, and adds the other 4
   members as collaborators. Everyone clones it and opens the folder in VS Code.
4. Git routine for everyone: `git pull` before you start a step, small commits, `git push` after
   each step. If two people edit the same file (e.g. `App.jsx`, `styles.css`, language files),
   pull first and keep the change small.

## Who does what (feature slices — each person owns a feature end to end)

| Person | Owns | Steps |
|---|---|---|
| P1 — Lead / backend | Project setup, database, seed, auth, reminders, demo routes | 0, 1, 7 |
| P2 — Frontend A | Join, shelf, my items | 2, 3 |
| P3 — Frontend B | Borrow flow, loans, messages, notifications | 4, 5 |
| P4 — Data & language | Handover/return photos, elder mode, read-aloud, tips, Japanese review | 6, 8, 9 |
| P5 — Proposal & video | QR poster, PWA, README, demo video, proposal PDF | 10, 11, 12 |

**Order:** P1 does steps 0–1 first (about 1.5 h) and pushes. Everyone else waits for that push,
then works in parallel. While waiting: P4 sends the phrase files to the Japanese reviewer, P5 starts
the proposal outline and interviews the target user, P2/P3 read `CLAUDE.md` sections 5–8.

---

## Step 0 — Project setup (P1)

```
Read CLAUDE.md. Set up the project skeleton exactly as described in sections 3 and 4:
- root package.json with scripts: "dev" (runs client and server together with concurrently),
  "seed" (runs server/seed.js), "build" (builds client), "start" (runs server in production and
  serves client/dist).
- client: React + Vite in plain JavaScript, react-router-dom, a vite.config.js that proxies /api and
  /uploads to http://localhost:3001. Keep the existing files in client/src/i18n and client/src/data.
- server: Express app in server/index.js with cors, express.json, dotenv, a GET /api/health route,
  and static serving of server/uploads at /uploads.
- .gitignore and server/.env.example as described in CLAUDE.md.
- App.jsx with placeholder pages for all routes in section 4 and the bottom navigation using t().
Do not build features yet. Tell me the exact commands to install and run it.
```
**Test:** `npm install` (root, client, server as Claude says) → `npm run dev` → open
http://localhost:5173 → bottom nav shows; http://localhost:3001/api/health returns ok.
**Commit:** `chore: project skeleton (React + Vite client, Express server)`

## Step 1 — Database, seed and auth (P1)

```
Implement server/db.js with the exact schema from CLAUDE.md section 5 (better-sqlite3), the
createMessage(loan, fromUserId, toUserId, phraseKey) helper described in section 6, and
server/allowedKeys.js (item keys, spot keys, quick reply keys copied from client/src/data/catalog.js).
Implement server/auth.js middleware (Bearer token → req.user, 401 if missing).
Implement server/seed.js with the Nagasaki demo data from section 9 (reset tables first).
Implement the routes GET /api/groups/by-code/:code, POST /api/join, GET /api/me, PATCH /api/me,
and the demo routes GET /api/demo/users and POST /api/demo/login (only when DEMO_MODE=true).
Keep code simple with short comments.
```
**Test:** `npm run seed` → visit http://localhost:3001/api/groups/by-code/SAKURA-2611 → shows
Sakura Heights. Ask Claude for a curl command to test `/api/join`.
**Commit:** `feat: SQLite schema, Nagasaki seed data, join + token auth`

---

## Step 2 — Join screen (P2)

```
Build client/src/api.js (fetch wrapper that adds the token from localStorage and returns JSON) and
a small user context in App.jsx that loads /api/me on start and redirects to /join if there is no token.
Build pages/Join.jsx: reads ?code= from the URL, shows the group preview when the code is valid,
nickname input (max 20 chars), language chips (English, 日本語, やさしい にほんご, বাংলা) and a big Join
button. In DEMO_MODE also show "Demo: continue as a neighbor" buttons from /api/demo/users.
Set <body class="elder"> when the user has elder_mode. Use t() for every visible string.
```
**Test:** open http://localhost:5173/join?code=SAKURA-2611 → join as "Rahim" in English → lands on
the shelf page. Open a private window → "continue as Sato" works.
**Commit:** `feat: join with building code, no-login identity, demo user switch`

## Step 3 — Shelf and My items (P2)

```
Implement server routes GET /api/shelf, GET /api/my-items, POST /api/items, DELETE /api/items/:id
(rules in CLAUDE.md section 6). Build pages/Shelf.jsx: title with group name, category filter chips,
a grid of item cards (emoji, item name in my language, "from {name}", status badge). Tapping a card
opens /item/:id. Build pages/MyItems.jsx: list my items with Remove, and an "Add an item" section:
pick an item from the catalog grid (grouped by category), choose max days (DURATIONS chips) and a
handover spot (SPOTS chips), then "Put it on the shelf". Use components/ChipGroup.jsx for all chips.
Follow the design rules in section 8.
```
**Test:** as Rahim, the shelf shows Sato's futon dryer etc. in English; switch the user's lang to `ja`
in the DB or via PATCH → names appear in Japanese. Add an item → it appears on the shelf.
**Commit:** `feat: neighborhood shelf and item listing from catalog`

---

## Step 4 — Borrow request with live preview (P3)

```
Implement POST /api/loans (creates pending loan + 'request' message to the lender) and
GET /api/loans/:id (loan, item, both users with nickname + lang, and messages).
Build pages/ItemPage.jsx: item header, owner, max days, handover spot, a TipCard with
tip('beforeRequest'), the tap-only time picker (START_DAYS chips, TIME_SLOTS chips, DURATIONS chips
capped by max_days; compute start_at/end_at in Japan time), and a preview box
"Your neighbor will see:" that shows renderPhrase(LENDER's lang, 'request', params) live as the
chips change. Big button "Can I borrow it?" → POST → go to /loan/:id.
```
**Test:** as Rahim (English) open the futon dryer → choose Tomorrow / Morning / 3 days → preview shows
the polite Japanese sentence → send → loan page opens.
**Commit:** `feat: tap-only borrow request with preview in the lender's language`

## Step 5 — Loans, messages, answers and notifications (P3)

```
Implement GET /api/loans, POST /api/loans/:id/accept, /decline (reason default|busy), /cancel,
/quick-reply, GET /api/inbox and POST /api/inbox/read, following the status flow in section 5
(accepting reserves the item and auto-declines other pending loans for it).
Build pages/Loans.jsx (two lists: I'm borrowing / I'm lending, with status badges) and
pages/LoanPage.jsx: header with item + other person + period, the message list using
components/PhraseBubble.jsx (renders renderPhrase(myLang, ...); mine right, theirs left, system
centered with 🔔; a "Show original" toggle that renders the same phrase in the sender's language),
action buttons that depend on my role and the status (lender: Yes / No / No – I need it those days;
borrower: Cancel), and quick reply chips.
Build components/Banner.jsx: polls /api/inbox every 5 seconds, shows "New message from {name}" with
the rendered phrase and an Open button, marks as read when opened; unread count badge on Loans tab.
```
**Test:** two windows — Rahim (English) and Sato (Japanese). Rahim sends a request → within 5 s Sato's
banner shows it in Japanese → Sato taps はい → Rahim sees the English answer. "Show original" works.
**Commit:** `feat: accept/decline, quick replies, phrase bubbles, polling notifications`

---

## Step 6 — Handover and return with photos (P4)

```
Implement POST /api/loans/:id/handover and /return (multer, image only, 5 MB, random filename,
saved in server/uploads), /received and /return-confirmed, following the status flow in section 5.
Build components/PhotoCapture.jsx (<input type="file" accept="image/*" capture="environment"> with
a preview and Send button) and add the handover/return sections to LoanPage.jsx:
lender sees "Take a photo before handing it over" when accepted; borrower sees "I received it" after
the photo (with TipCard tip('atHandover')); borrower sees the return photo step when active (with
tip('atReturn')); lender sees "I got it back". Show both photos side by side in the loan page.
```
**Test:** full loop in two windows; on a phone the camera opens. Item goes reserved → lent → available.
**Commit:** `feat: condition photos at handover and return`

## Step 7 — Automatic polite reminders + demo fast-forward (P1)

```
Implement server/reminders.js exactly as described in CLAUDE.md section 6 (every 30 s; dueSoon to
borrower; overdue to borrower AND overdueLender notice to lender; never send twice).
Start it from server/index.js. Implement POST /api/demo/fast-forward/:loanId {to:'dueSoon'|'overdue'}
(DEMO_MODE only) that moves end_at and runs the check immediately. In LoanPage.jsx, when DEMO_MODE
is on and the loan is active, show two small grey buttons "Demo: due soon" / "Demo: overdue".
```
**Test:** active loan → "Demo: overdue" → borrower gets the reminder in their language, lender gets
"We've sent Rahim a polite reminder…" in Japanese.
**Commit:** `feat: automatic polite reminders so lenders never have to ask`

---

## Step 8 — Settings, language switch, elder mode (P4)

```
Build pages/Settings.jsx: language chips (PATCH /api/me, re-render the whole app instantly),
elder mode toggle (PATCH /api/me, toggles body.elder), group name + type, link to /poster,
"Leave this neighborhood" (tap twice to confirm; clears localStorage). Add elder mode CSS in
styles.css: base font 22px, buttons and chips min-height 64px, more spacing.
```
**Test:** switch Rahim to বাংলা → the loan conversation re-renders in Bengali. Elder mode makes
everything bigger.
**Commit:** `feat: instant language switch and elder mode`

## Step 9 — Read-aloud and etiquette tips (P4)

```
Build components/SpeakButton.jsx using window.speechSynthesis with the voice language from
meta(lang).speech; hide the button if no matching voice is available. Show it on every PhraseBubble
(always in elder mode, small icon otherwise) and on the Banner. Make sure TipCard (tips from the
language file) appears: before request, at handover, at return, and tip('forLender') on the lender's
first incoming request.
```
**Test:** Sato's window: 🔊 reads the Japanese request aloud (Chrome/Edge have Japanese voices).
**Commit:** `feat: read-aloud for elders and in-context etiquette tips`

---

## Step 10 — QR join poster (P5)

```
Build pages/Poster.jsx at /poster: printable A4 page (print CSS hides the nav) with the group name,
a large QR code (qrcode library) pointing to <current origin>/join?code=<code>, the join code in big
letters, and poster.title / poster.body in Japanese, English and Bengali (all three at once).
Add a Print button (window.print()).
```
**Test:** open /poster → print preview looks clean; scanning the QR with a phone on the same Wi-Fi
(use your laptop's IP instead of localhost) opens the join page with the code filled in.
**Commit:** `feat: trilingual QR join poster (digital kairanban)`

## Step 11 — PWA (P5)

```
Add vite-plugin-pwa: manifest (name "Otonari", short_name "Otonari", theme color from styles.css,
icons 192 and 512 in client/public), autoUpdate service worker, and do not cache /api requests.
Generate simple icons (indigo square with "お" in white) or tell me how to make them.
```
**Test:** `npm run build && npm start` → Chrome shows "Install app".
**Commit:** `feat: installable PWA`

## Step 12 — Polish, README and final check (P5 + everyone)

```
Review the whole app against CLAUDE.md section 10 (the 5-step demo script). List anything that does
not work or looks rough, then fix only those things. Then write README.md: what Otonari is (2
sentences + the Tsunagu connection), features, screenshots section (placeholders with file names in
docs/screenshots/), how to run (install, seed, dev), tech stack, project structure, how translation
works (phrase keys, no AI, no API keys), AI usage statement, team and roles.
```
**Test:** fresh clone → follow the README exactly → app runs. Run the 5-step demo end to end twice.
**Commit:** `docs: README with setup, screenshots and AI usage`

---

## Optional — Deploy a live link (ask first)

A public URL lets judges try it. Simplest: Render.com free web service (`npm run build`, `npm start`,
env `DEMO_MODE=true`, run seed on start). Note: free hosting can reset the SQLite file — that's fine for
a demo because the seed runs on start. Do this only after Step 12 works locally.

---

## If something goes wrong
- Paste the exact error into Claude: "This error happens when I do X: <error>. Fix it without
  changing the design in CLAUDE.md."
- `better-sqlite3` install fails on Windows → make sure you use Node 20/22 LTS (prebuilt binaries).
- Notifications not showing → check both windows are logged in as different users (use a private
  window for the second user).
