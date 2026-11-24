# Otonari — AI build log

This file records **how we used AI to build Otonari**, step by step, with the actual prompts we used.
It replaces our original build plan, which changed during development (some steps were adjusted,
two prompts were added, and one team member ended up writing all the code).

## How we worked

- **Spec first.** Before writing any code, we planned the product (problem, target user, features,
  scope, rubric check) and wrote [`CLAUDE.md`](CLAUDE.md): features, data model, API, design rules,
  demo script and working rules. Claude in VS Code reads it automatically, so every prompt could stay short.
- **Human-written language.** The phrase files (`client/src/i18n/*.json`) and item catalog were
  written by the team, not generated at build time. Japanese is reviewed by a native speaker.
  The app itself uses **no AI at runtime** and no translation API.
- **One step at a time.** Each prompt built one small vertical slice. After every step we tested it
  ourselves in two browser windows (borrower + lender), then committed and pushed.
- **Claude asks before changing scope.** `CLAUDE.md` requires Claude to ask before adding a
  dependency or changing the data model, API or scope. Every such question was decided by us
  (examples below: nodemon, duplicate requests, reminder rules, photo resizing).
- **Spec kept in sync.** Whenever the code changed the design, `CLAUDE.md` was updated in the same
  step, so the spec always matches the code.

**Tools:** Claude (claude.ai) for planning, the spec, phrase files and reviewing decisions;
Claude in VS Code for writing and testing the code.

## Team

| Name | Role |
|---|---|
| _(name)_ | Developer — built the whole app with Claude in VS Code |
| _(name)_ | Language & localization — Japanese review with a native speaker, Bengali check |
| _(name)_ | User research — target-user interview and problem story |
| _(name)_ | Proposal & presentation |
| _(name)_ | QA & demo video |

---

## Step 0 — Project skeleton

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
_Issue found:_ port 3001 was already used by another program on the PC; we stopped that program.

## Step 1 — Database, seed and auth

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

## Step 2 — Join screen

```
Build client/src/api.js (fetch wrapper that adds the token from localStorage and returns JSON) and
a small user context in App.jsx that loads /api/me on start and redirects to /join if there is no token.
Build pages/Join.jsx: reads ?code= from the URL, shows the group preview when the code is valid,
nickname input (max 20 chars), language chips (English, 日本語, やさしい にほんご, বাংলা) and a big Join
button. In DEMO_MODE also show "Demo: continue as a neighbor" buttons from /api/demo/users.
Set <body class="elder"> when the user has elder_mode. Use t() for every visible string.
```

## Step 3 — Shelf and My items

```
Implement server routes GET /api/shelf, GET /api/my-items, POST /api/items, DELETE /api/items/:id
(rules in CLAUDE.md section 6). Build pages/Shelf.jsx: title with group name, category filter chips,
a grid of item cards (emoji, item name in my language, "from {name}", status badge). Tapping a card
opens /item/:id. Build pages/MyItems.jsx: list my items with Remove, and an "Add an item" section:
pick an item from the catalog grid (grouped by category), choose max days (DURATIONS chips) and a
handover spot (SPOTS chips), then "Put it on the shelf". Use components/ChipGroup.jsx for all chips.
Follow the design rules in section 8.
```
_Decision — stable dev server:_ Claude found that `node --watch` restarted the server on this Windows
PC whenever files were merely read. It asked before adding a new dependency; we approved:
```
Yes, add nodemon as a dev dependency of the server and use it for the server's "dev" script.
Configure it to watch only server .js files, and to ignore: node_modules, uploads/, *.db, *.db-journal, *.db-wal, *.db-shm (so database writes, seeding and photo uploads never restart the server).
Also add nodemon to the server list in CLAUDE.md section 3, and add a note there: "For the demo, always use npm run build + npm start (no file watcher)."
Then tell me how to verify it.
```

## Step 4 — Borrow request with live preview

```
Implement POST /api/loans (creates pending loan + 'request' message to the lender) and
GET /api/loans/:id (loan, item, both users with nickname + lang, and messages).
Build pages/ItemPage.jsx: item header, owner, max days, handover spot, a TipCard with
tip('beforeRequest'), the tap-only time picker (START_DAYS chips, TIME_SLOTS chips, DURATIONS chips
capped by max_days; compute start_at/end_at in Japan time), and a preview box
"Your neighbor will see:" that shows renderPhrase(LENDER's lang, 'request', params) live as the
chips change. Big button "Can I borrow it?" → POST → go to /loan/:id.
```

## Step 5 — Loans, messages, answers and notifications

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
_Interrupted_ (usage limit). Resumed in a new conversation with:
```
I was in the middle of Step 5 from BUILD_PROMPTS.md when the session stopped. Some of it is already done (see git status / git diff). Check what is finished and what is missing compared to Step 5 and CLAUDE.md, then finish only the missing parts. Don't redo work that is already correct. Don't run requests or seeds against my running dev server.
```
_Edge-case check:_
```
Check the "auto-decline" edge case from CLAUDE.md section 5:
"Accepting a loan auto-declines other pending loans for that item (send them the 'decline' phrase)."

Scenario: Rahim and Maria both send a pending request for Sato's futon dryer. Sato accepts Rahim's request.
Expected:
1. Rahim's loan becomes 'accepted' and the item becomes 'reserved'.
2. Maria's loan becomes 'declined' automatically.
3. Maria receives a 'decline' message (from Sato, in Maria's language) so she sees it in her inbox/banner.
4. Nobody can send a new request for a reserved or lent item (POST /api/loans should refuse it).
5. Sato cannot accept a second request for the same item after one is accepted.

First review the code in server/routes/loans.js and tell me whether each point is handled.
Then test it with an automated script on a SEPARATE port (e.g. PORT=3101) and a SEPARATE database file, NOT my running dev server.
Fix anything that fails, keep the fix small, and tell me what you changed.
```
_Decision — duplicate requests:_ Claude found that one person could request the same item twice,
which would make the lender appear to say both "Yes" and "Sorry". We approved a fix:
```
Yes, add it. Please:
1. POST /api/loans: return 409 if this user already has a 'pending' or 'accepted' loan for the same item (include the existing loan id in the response).
2. Item page: if the user already has a pending/accepted loan for this item, don't show the time picker; show a short note "You've already asked — waiting for {name}" with a button to open that loan. Also handle the 409 the same way.
3. Disable the "Can I borrow it?" button while the request is being sent, so a double-tap can't send two requests.
4. Add the new UI text to en.json, ja.json and bn.json (ja-easy can fall back to ja). Don't change existing phrases.
5. Add one line to CLAUDE.md section 5 describing this rule.
Keep it small. Test on a separate port and database, not my running dev server.
```

## Step 6 — Handover and return with photos

```
Implement POST /api/loans/:id/handover and /return (multer, image only, 5 MB, random filename,
saved in server/uploads), /received and /return-confirmed, following the status flow in section 5.
Build components/PhotoCapture.jsx (<input type="file" accept="image/*" capture="environment"> with
a preview and Send button) and add the handover/return sections to LoanPage.jsx:
lender sees "Take a photo before handing it over" when accepted; borrower sees "I received it" after
the photo (with TipCard tip('atHandover')); borrower sees the return photo step when active (with
tip('atReturn')); lender sees "I got it back". Show both photos side by side in the loan page.
```

## Step 7 — Automatic polite reminders + demo fast-forward

```
Implement server/reminders.js exactly as described in CLAUDE.md section 6 (every 30 s; dueSoon to
borrower; overdue to borrower AND overdueLender notice to lender; never send twice).
Start it from server/index.js. Implement POST /api/demo/fast-forward/:loanId {to:'dueSoon'|'overdue'}
(DEMO_MODE only) that moves end_at and runs the check immediately. In LoanPage.jsx, when DEMO_MODE
is on and the loan is active, show two small grey buttons "Demo: due soon" / "Demo: overdue".
```
_Decision — reminder rules and photo size:_ Claude pointed out three awkward effects of the literal
rules and asked whether to shrink photos before upload. We approved:
```
Yes, make all three changes:
1. Send the due-soon reminder only while the loan is not yet overdue (end_at > now). Update CLAUDE.md section 6.
2. Skip reminders for loans that already have a return photo. Update CLAUDE.md section 6.
3. In the demo fast-forward route only, move start_at back as well so start is always before end.

Also yes to shrinking photos before upload: in PhotoCapture.jsx, resize in the browser with a canvas to max 1280 px on the longest side, JPEG quality about 0.8, no new library. Keep the server's 5 MB limit as a safety net. Make sure phone photos (including portrait photos) keep the right orientation.

Keep each change small. Test on a separate port and database, not my running dev server.
```
Result: photos are resized in the browser and their GPS location data is removed before upload.

## Step 8 — Settings, language switch, elder mode

```
Build pages/Settings.jsx: language chips (PATCH /api/me, re-render the whole app instantly),
elder mode toggle (PATCH /api/me, toggles body.elder), group name + type, link to /poster,
"Leave this neighborhood" (tap twice to confirm; clears localStorage). Add elder mode CSS in
styles.css: base font 22px, buttons and chips min-height 64px, more spacing.
```
_Interrupted_ and resumed with the same "continue" prompt as Step 5 (with "Step 8").

## Added — Start a new neighborhood

Added after we asked how real buildings would get a join code. The code is generated by the server;
the setup is meant for a building manager or neighborhood association leader.
```
Add "Start a new neighborhood" (part of must-have 1, joining a neighborhood):
- On the Join page, a link "Set up Otonari for your building or block" opens a small form: group name, type (building/block chips), city. It is meant for a building manager or neighborhood association leader.
- New route POST /api/groups: validates input, generates a random join code on the server with crypto (8 chars from "ABCDEFGHJKMNPQRSTUVWXYZ23456789", shown as XXXX-XXXX), checks the code is unique, and creates the group. The creator does NOT become a member.
- Duplicate warning: before creating, check for existing groups in the same city with a similar name (case-insensitive, ignoring spaces). If found, show "A group called {name} already exists in {city}. Look for its poster on your notice board before creating a new one." with a "Create anyway" button. Show only the name, never another group's code.
- After creating, show the new join code in big letters and a button to open the poster for that group (the /poster page must work for this group without being a member, e.g. /poster?code=XXXX-XXXX).
- Add the UI text to en.json, ja.json and bn.json. Update CLAUDE.md sections 2 and 6.
Keep it small. Test on a separate port and database, not my running dev server.
```

## Added — Lender protection and safe leaving

Added after a teammate asked: "What if someone borrows an expensive item and moves out without
returning it?" We chose protections that depend on recorded behavior, not on anyone's honesty.
```
Add lender protection (part of must-have 2, the borrow flow) and safe leaving:
1. Trust info: on every incoming request (loan page and banner), show the borrower's trust line, calculated from the database: "Joined X days ago" plus "N returns on time, M late". For someone with no history, show "New neighbor, no returns yet".
2. "Trusted neighbors only" switch per item: a checkbox when adding an item (and on My items). If on, only users with at least one on-time completed return can request it. The shelf shows a small 🔒 badge; for users who don't qualify, the item page explains "Only for neighbors who have returned something on time" instead of the time picker. POST /api/loans must enforce this too (403).
3. Safe leaving: add POST /api/leave. Refuse (409) if the user has any accepted or active loan as borrower or lender, and show "Please finish your current loans first" in Settings. Otherwise: remove their items from the shelf (only those not reserved or lent), cancel their pending requests (sending the 'cancel' phrase), then clear the token.
Add the new columns needed to the schema and seed (mark Tanaka's projector as trusted-only in the seed). Add the UI text to en.json, ja.json and bn.json. Update CLAUDE.md sections 2, 5 and 6.
Keep it small. Test on a separate port and database, not my running dev server.
```

## Step 9 — Read-aloud and etiquette tips (adjusted)

Some tips already existed from Steps 4 and 6, so the prompt only asked for what was missing.
```
Step 9 from BUILD_PROMPTS.md. The TipCard already exists and some tips are already shown (from Steps 4 and 6), so first check which parts of Step 9 are already done and only add what's missing:
- components/SpeakButton.jsx with window.speechSynthesis, voice language from meta(lang).speech; hide the button if no matching voice exists.
- Show it on every PhraseBubble (always visible in elder mode, small icon otherwise) and on the Banner.
- Show tip('forLender') on the lender's first incoming request.
Also, a small addition: make sure the "Trusted neighbors only" switch is off by default, and add a short hint next to it: "Use this only for valuable items. New neighbors — often people new to Japan — need a first chance to build their record." Add it to en.json, ja.json and bn.json.
Keep it small. Test on a separate port and database, not my running dev server.
```

## Step 10 — QR join poster (adjusted)

The poster page already existed from "Start a new neighborhood", so it was extended.
```
Step 10 from BUILD_PROMPTS.md. The /poster page already exists from "Start a new neighborhood" (it works with /poster?code=XXXX-XXXX and plain /poster for my own group), so extend it rather than rebuild it:
- A large QR code (qrcode library) pointing to <current origin>/join?code=<code>.
- The join code in big letters.
- poster.title and poster.body in Japanese, English and Bengali, all three on the poster at once.
- A Print button (window.print()); print CSS hides the nav and fits one A4 page.
Keep it small. Test on a separate port and database, not my running dev server.
```
_Follow-up_ (Claude's suggestion, so people who can't scan can still join):
```
Yes, add both in small letters at the bottom of the poster: the app name "Otonari (おとなり)" and the web address to type, taken from the current origin (e.g. "Open https://<origin>/join and enter the code"), in Japanese, English and Bengali. Keep it on one A4 page.
```

## Step 12 — Polish, demo preparation and README

```
Step 12 from BUILD_PROMPTS.md, plus these specific items. First do items 1-5, then the README.

1. Lender tip: show tip('forLender') only when borrower and lender use different languages, and change its wording in all language files to the meaning: "Your neighbor may speak a different language. Don't worry — Otonari shows everything in their language."
2. Small screens: fix the 320 px overflow (badges sticking out of cards, the Bengali Loans page scrolling sideways).
3. Read-aloud: when choosing a voice, prefer voices whose name contains "Natural" or "Online", then any voice for that language.
4. Real-user demo preparation: add "npm run seed:empty" that resets the database and creates only the two groups (Sakura Heights SAKURA-2611 and Hamaguchi-machi 3-chome HAMA-3CHOME) with no users, items or loans. Also delete old photos in server/uploads (keep .gitkeep) when either seed runs.
5. Review the whole app against the 5-step demo script in CLAUDE.md section 10; list anything that does not work or looks rough, then fix only those things.

Then write README.md: what Otonari is (2 sentences + the Tsunagu connection), features, screenshots section (placeholders in docs/screenshots/), how to run (install, seed, seed:empty, dev, build + start for the demo), tech stack, project structure, how translation works (phrase keys, no AI, no API keys), privacy and safety (nicknames only, no room numbers, GPS removed from photos, join code from the physical poster, trust info, trusted-neighbors-only items), AI usage statement (Claude in VS Code used to write code from our spec; phrases written by the team and reviewed by a native Japanese speaker), and a "Team" section with placeholders for names and roles.

Keep changes small. Test on a separate port and database, not my running dev server.
```

## Step 11 — Installable PWA

Done after Step 12, so the app was stable before adding offline caching.
```
Step 11 from BUILD_PROMPTS.md: make the app an installable PWA with vite-plugin-pwa.
- Manifest: name "Otonari", short_name "Otonari", start_url "/", display "standalone", theme and background colors from styles.css.
- Icons 192x192 and 512x512 in client/public (also a maskable version): indigo square with a white "お". Generate them with a small script or tell me how.
- Service worker: registerType "autoUpdate", so phones always get the newest version after a deploy. Never cache /api or /uploads (network only). Only cache the built app files.
- No service worker during npm run dev, so development is not affected.
- Update CLAUDE.md and README if needed.
Keep it small. Test on a separate port and database, not my running dev server.
```
_Change found during testing:_ `autoUpdate` alone sometimes kept showing the old version after a deploy,
so pages are now always loaded from the server, and the cached copy is used only when offline.
_Follow-up:_ we also approved using the お icon for the browser tab and the iPhone home screen.

## Deployment

_(To be added after deploying.)_

---

## What we tested ourselves

After every step: the borrower and lender flow in two browser windows (English + Japanese),
plus Bengali and Easy Japanese for language switching. Also tested on a real phone over Wi-Fi:
joining by scanning the QR poster, borrowing, and a portrait photo from the phone camera.
Claude in VS Code additionally ran automated tests on a separate port and database for each step.
