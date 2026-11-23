# Otonari (お隣)

**Borrow from next door, in your own language.**

Otonari (お隣, "next door") is an installable web app (PWA) that lets neighbors in the same building or block in Japan lend and borrow things they rarely use, like a futon dryer, a stepladder, or a takoyaki maker. Nobody types a message: every message is a fixed phrase that each neighbor reads in their own language (English, Japanese, Easy Japanese, or Bengali).

**The connection we update (TSUNAGU: Update the Way We Connect).** Neighbors live a few meters apart but never ask each other for help, because of language, shyness, and 遠慮 (*enryo*): the Japanese reluctance to impose on others, or to chase an overdue item. Otonari repairs this broken link between foreign residents, who need things but can't ask, and elderly residents, who own useful things but rarely talk to their neighbors. Asking takes a few taps, both sides read polite words in their own language, and Otonari handles polite reminders and return nudges so nobody has to have an awkward confrontation.

## Features

- **Neighborhood shelf.** Join with the code on the poster in your building or block: a nickname and a language are enough. Share items by picking from a fixed 28-item catalog, with an optional real photo of your item.
- **Borrowing in two languages with exact dates.** Pick `Today / Tomorrow / Day after` or any exact start date up to 14 days ahead, choose time and length, and preview the exact sentence your neighbor will read before sending. They tap Yes or No. Quick replies cover the rest, and "Show original" proves both sides saw the same meaning.
- **Handover, safe cancellation, and return.** Either participant can cancel an accepted loan before handover (preventing stuck reservations). Condition photos before and after sit side by side.
- **Automatic reminders, polite lender ping, and sticky return bar.** 24 hours before due and when overdue, Otonari reminds the borrower (and notifies the lender when overdue). A persistent sticky return-due / overdue bar stays visible at the top of the borrower's screen until the return photo is uploaded, and the lender can send a rate-limited polite nudge (`pingNeedBack` / `pingOverdue`) when they need the item back.
- **For elderly neighbors.** Large text and buttons (Elder Mode), 🔊 read-aloud on every message and banner, and full Easy Japanese (やさしい日本語) coverage.
- **Trust.** Every request shows how reliable the borrower has been (`on_time` / `late`), and valuable items can be restricted to neighbors with at least one on-time return.
- **Trilingual QR poster.** Printable A4 poster in Japanese, English, and Bengali for the building notice board.
- **Start a new neighborhood.** A building manager or neighborhood association leader creates a group and prints its poster.
- **Installable PWA.** Add to the home screen like an app; automatically checks for updates. API responses and uploaded photos always come from the network.

## Screenshots

<!-- Replace the placeholders in docs/screenshots/ with real screenshots before final submission. -->

| 1. Join | 2. Ask | 3. Answer |
|---|---|---|
| <img src="docs/screenshots/1-join.png" width="240" alt="Join page with the code from the poster filled in"> | <img src="docs/screenshots/2-request.png" width="240" alt="Borrow request with a preview in Japanese"> | <img src="docs/screenshots/3-answer.png" width="240" alt="The lender's banner in polite Japanese and large text"> |
| Scan the poster, pick a nickname and a language. | The preview shows what your neighbor will read. | The lender reads polite Japanese in large text. |

| 4. Handover | 5. Return | 6. Poster |
|---|---|---|
| <img src="docs/screenshots/4-handover.png" width="240" alt="Condition photo and the button I received it"> | <img src="docs/screenshots/5-return.png" width="240" alt="Reminder, thank-you messages and both photos"> | <img src="docs/screenshots/6-poster.png" width="240" alt="Printable poster with a QR code in three languages"> |
| A condition photo, then "I received it". | Both photos side by side, and a thank-you. | The way into the neighborhood. |

## How to run

### Option 1: Docker Compose (Recommended — Zero Setup, Persistent Volumes)

Requires [Docker](https://www.docker.com/). Starts PostgreSQL 16 (`otonari_pgdata` volume) and the production Otonari container (`otonari_uploads` volume mounted at `/data/uploads`):

```bash
git clone <URL of this repository>
cd otonari
docker compose up --build
```

Open <http://localhost:3001>. Both database rows and uploaded photos persist across `docker compose restart app`.

### Option 2: Local Development (Node.js 22.12+ & PostgreSQL 16)

1. Start PostgreSQL locally via Docker (or point `DATABASE_URL` to your own PostgreSQL instance):

```bash
docker compose up -d db
```

2. Install dependencies and configure `server/.env`:

```bash
npm install
cp server/.env.example server/.env
```

3. Seed demo data (optional — the server also auto-seeds automatically when starting on an empty database):

```bash
npm run seed
```

4. Run dev servers (API on `:3001`, Vite on `:5173`):

```bash
npm run dev
```

Open <http://localhost:5173>.

5. Run automated tests (requires a running PostgreSQL test database):

```bash
DATABASE_URL=postgres://otonari:otonari@localhost:5432/otonari npm test
```

### Commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Runs PostgreSQL 16 + built Otonari container with persistent volumes on port `3001`. |
| `npm run dev` | Runs Express API (`:3001`) with `nodemon` and Vite client (`:5173`) concurrently. |
| `npm run seed` | Resets PostgreSQL tables, deletes uploaded photos, and loads the Nagasaki demo data. |
| `npm run seed:empty` | Resets PostgreSQL tables with only the two groups (`SAKURA-2611`, `HAMA-3CHOME`) and no demo users. |
| `npm test` | Runs the full `node:test` automated test suite (PostgreSQL, photos/EXIF, API, security, i18n parity). |
| `npm run build` | Builds the React + PWA client into `client/dist/`. |
| `npm start` | Starts the Express server serving both API and `client/dist/` on `PORT` (default `3001`). |

Environment variables (`server/.env`):
- `PORT`: server port (default `3001`)
- `DATABASE_URL`: PostgreSQL connection string (required)
- `DATABASE_SSL`: set `true` if your PostgreSQL host requires TLS without a custom CA
- `UPLOADS_DIR`: directory for uploaded photos (defaults to `server/uploads`; set `/data/uploads` on Docker/Railway)
- `DEMO_MODE`: `true` enables seeded demo neighbor quick-login and participant-gated reminder fast-forward; `false` hides all demo routes and buttons.

## Deploy on Railway (Persistent PostgreSQL + Volume)

Otonari includes `Dockerfile` and `railway.json` for one-step persistent deployment on [Railway](https://railway.com):

1. Create a new Railway project from this GitHub repository (Railway automatically detects `Dockerfile` + `railway.json`).
2. Add a **PostgreSQL** database service (`+ New → Database → PostgreSQL`) and link `DATABASE_URL` to the Otonari web service.
3. Attach a **Volume** to the Otonari service mounted at `/data/uploads`.
4. Set environment variables on the web service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `UPLOADS_DIR` | `/data/uploads` |
| `DEMO_MODE` | `true` (or `false` for production buildings) |
| `RAILWAY_RUN_UID` | `0` (required on Railway so the mounted Volume at `/data/uploads` is writable) |

Both PostgreSQL data and uploaded photos persist across restarts and redeploys. Auto-seeding runs only once when the database is empty.

## Tech stack

- **Client:** React 18, Vite, react-router-dom, plain JavaScript & CSS, `qrcode`, `vite-plugin-pwa`
- **Server:** Node.js 22+, Express 5, `pg` (PostgreSQL), `multer`, `cors`, `dotenv`
- **Database & Storage:** PostgreSQL 16 (`TIMESTAMPTZ`, `JSONB`, `BOOLEAN`, partial indexes) + persistent `UPLOADS_DIR` volume
- **Containers & Testing:** Multi-stage Docker (`node:22-slim`), Docker Compose, Node built-in `node:test`

## Project structure

```
otonari/
├── Dockerfile                multi-stage production build (client + server)
├── docker-compose.yml        PostgreSQL 16 + Otonari app with persistent volumes
├── railway.json              Railway deployment & healthcheck configuration
├── docs/
│   ├── refactor-plan.md      v2 architecture, schema, API contracts & test matrix
│   └── screenshots/          app screenshots
├── client/                   React + Vite PWA
│   ├── public/               PWA icons
│   └── src/
│       ├── pages/            Join, Shelf, ItemPage, MyItems, Loans, LoanPage, Settings, Poster
│       ├── components/       Banner (inbox + sticky due bar), PhraseBubble, SpeakButton, PhotoCapture, TrustLine, TipCard, ChipGroup, NewGroup
│       ├── i18n/             en.json, ja.json, ja-easy.json, bn.json, index.js
│       ├── data/catalog.js   fixed catalog, handover spots, quick replies, durations
│       └── App.jsx, api.js, useInbox.js, UserContext.js, serviceWorker.js, styles.css
└── server/                   Express 5 + PostgreSQL API
    ├── index.js              Express app factory + startup/shutdown lifecycle
    ├── db.js                 pg Pool, schema DDL, indexes, transactions, helpers
    ├── auth.js               Bearer token middleware
    ├── photos.js             UPLOADS_DIR volume storage, magic-byte validation, server-side EXIF stripping, path-traversal guard
    ├── rateLimit.js          fixed-window rate limiter middleware
    ├── reminders.js          30s automatic reminder job (FOR UPDATE SKIP LOCKED)
    ├── seed.js               Nagasaki demo seeder (--empty supported)
    ├── allowedKeys.js        server-side allowlists
    ├── routes/               groups.js, items.js, loans.js, inbox.js, demo.js
    └── test/                 db-reminders.test.js, photos.test.js, api.test.js, i18n.test.js
```

## How translation works

**No AI, no translation service, no API keys.** PostgreSQL never stores translated text. Each message is stored as a `phrase_key` and `JSONB` `params`:

```json
{
  "phrase_key": "request",
  "params": {
    "item": "futon_dryer",
    "spot": "entrance",
    "start": "2026-11-24T00:00:00.000Z",
    "end": "2026-11-27T00:00:00.000Z",
    "name": "Rahim"
  }
}
```

Each neighbor's browser renders it from `client/src/i18n/` in Japan time (`Asia/Tokyo`), with locale digits and polite honorifics (`さん` in Japanese). Switching languages instantly re-renders the entire history.

## Privacy and safety

- **Nicknames only.** No account, password, or email; random UUID Bearer token identity.
- **No room numbers.** Handovers use shared public spots only.
- **No free text between neighbors.** Server-side allowlists reject any unknown phrase, item, or spot key.
- **Double EXIF/GPS stripping.** Photos are redrawn via browser `<canvas>` before upload **and** JPEG APP1 EXIF/GPS segments are stripped server-side in `server/photos.js`.
- **Upload security.** Magic-byte verification, 5 MB cap, UUID filenames, canonicalized `UPLOADS_DIR` path-traversal guard, and `X-Content-Type-Options: nosniff`.
- **Abuse & access controls.** Group/role authorization on all endpoints, rate limiting on group creation/lookup/join/quick-replies, per-loan cooldown on lender pings, participant auth on demo fast-forward, and security headers (`nosniff`, `X-Frame-Options: DENY`).
- **Safe leaving.** Blocked while an `accepted` or `active` loan exists; otherwise items leave the shelf, pending requests are resolved, and the token is revoked.

## AI usage

We used AI coding assistants (Claude in VS Code for v1 initial scaffolding from [CLAUDE.md](CLAUDE.md) as logged in [BUILD_PROMPTS.md](BUILD_PROMPTS.md), and Antigravity for v2 refactoring to PostgreSQL, Docker/volumes, security hardening, and automated testing as specified in [docs/refactor-plan.md](docs/refactor-plan.md)). Localization phrases were reviewed and refined by the team across Japanese, Easy Japanese, English, and Bengali. Otonari itself uses **no AI at runtime**.

## Team

| Name | Role |
|---|---|
| _Name 1_ | _Role (e.g. lead, backend)_ |
| _Name 2_ | _Role (e.g. localization, QA, v2 architecture)_ |
| _Name 3_ | _Role (e.g. frontend)_ |
| _Name 4_ | _Role (e.g. user research, proposal)_ |
| _Name 5_ | _Role (e.g. demo video, presentation)_ |
