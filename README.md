# Otonari (お隣)

**Borrow from next door, in your own language.**

Otonari (お隣, "next door") is an installable neighborhood sharing web app (PWA) that lets neighbors in the same building or block in Japan lend and borrow rarely used household items — like a futon dryer, stepladder, or takoyaki maker — with **zero free-text messaging**. Every message is a structured phrase key rendered in each neighbor's own language (English, Japanese polite *keigo*, Easy Japanese やさしい日本語, or Bengali).

**Theme (TSUNAGU — Update the Way We Connect):** Neighbors live meters apart yet rarely ask for help because of language barriers, shyness, and *enryo* (遠慮 — reluctance to impose or chase an overdue item). Otonari bridges foreign residents and elderly Japanese neighbors with tap-only polite requests, automatic reminders, structured thank-you stamps, and a Building Manager portal that keeps communities safe.

## Features

- **Neighborhood shelf with search & live stats.** Join via the trilingual QR poster with just a nickname and language (no room numbers). Browse 28 catalog items with optional real photos, instant search, "Available only" filter, and neighborhood connection stats (including cross-language exchanges).
- **Bilingual tap-only borrow flow.** Choose quick day chips or any exact start date up to 14 days ahead, preview the exact sentence your neighbor will read in their language, and track active vs. past loans. Owners can pause lending or edit max days & handover spot anytime.
- **Handover, return, issues & thank-you stamps.** Pinned handover spot card, cancel-before-handover protection, side-by-side EXIF-stripped condition photos, structured non-confrontational issue/damage reports (with optional photo), and warm Japanese thank-you stamps (`🙇`, `✨`, `🍪`, `🤝`) on completed loans.
- **3-Layer Notification Pipeline.**
  1. **Persistent Notification Center (🔔):** All piled-up unread alerts stay queued in PostgreSQL until opened or cleared with "Mark all read".
  2. **Instant Live SSE (`/api/events`):** Authenticated header-based Server-Sent Events push updates in `<100ms` (with 10s fallback poll) + persistent sticky return-due / overdue bar.
  3. **Background Web Push (`web-push` + custom `sw.js`):** Zero-config auto-persisted VAPID keys deliver localized OS notifications even when the app is closed.
- **Building Manager Portal (`/manager`).** Email + `scrypt` password authentication, multi-device sessions, group creation, join code rotation, optional new-member approval toggle (with manager-only private verification note), safe member moderation, reported issues feed, and **Lost-Phone Restore** (rotates & revokes the lost phone's token).
- **Multi-device transfer (Settings).** Residents can generate a 10-minute single-use code + QR to open the same account on another phone or installed PWA.
- **Accessibility & Elder Mode.** Large text (`22px`) & `64px` buttons, 🔊 read-aloud (`speechSynthesis`) on every message and banner, and full Easy Japanese coverage.
- **Interactive OpenAPI 3.0.3 Docs.** Always available at `/api/docs` (Swagger UI) and `/api/openapi.json`, enforced by an automated 100% route-coverage test.

## Screenshots

| 1. Join | 2. Ask | 3. Answer |
|---|---|---|
| <img src="docs/screenshots/1-join.png" width="240" alt="Join page with the code from the poster filled in"> | <img src="docs/screenshots/2-request.png" width="240" alt="Borrow request with a preview in Japanese"> | <img src="docs/screenshots/3-answer.png" width="240" alt="The lender's banner in polite Japanese and large text"> |
| Scan the poster, pick a nickname and language. | Live preview in your neighbor's language. | Polite Japanese in Elder Mode large text. |

| 4. Handover | 5. Return | 6. Poster |
|---|---|---|
| <img src="docs/screenshots/4-handover.png" width="240" alt="Condition photo and the button I received it"> | <img src="docs/screenshots/5-return.png" width="240" alt="Reminder, thank-you messages and both photos"> | <img src="docs/screenshots/6-poster.png" width="240" alt="Printable poster with a QR code in three languages"> |
| Condition photo, then "I received it". | Side-by-side photos and thank-you stamps. | Printable trilingual A4 QR poster. |

## How to Run

### Option 1: Docker Compose (Recommended — Zero Setup, Persistent Volumes)

Requires [Docker](https://www.docker.com/). Starts PostgreSQL 16 (`otonari_pgdata` volume) and the production Otonari container (`otonari_uploads` volume mounted at `/data/uploads`):

```bash
git clone https://github.com/MdLabib355/otonari.git
cd otonari
docker compose up --build
```

Open <http://localhost:3001> (and interactive API docs at <http://localhost:3001/api/docs>). If port `5432` is already in use on your host, run `POSTGRES_PORT=5433 docker compose up --build`.

### Option 2: Local Development (Node.js 22+ & PostgreSQL 16)

```bash
docker compose up -d db
npm install
cp server/.env.example server/.env
npm run seed
npm run dev
```

Open <http://localhost:5173> (Vite proxies `/api` and `/uploads` to Express on `:3001`).

### Commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Runs PostgreSQL 16 + built Otonari container with persistent volumes on `:3001`. |
| `npm run dev` | Runs Express API (`:3001`) with `nodemon` and Vite client (`:5173`) concurrently. |
| `npm run seed` | Resets PostgreSQL tables, clears uploads, and seeds Nagasaki demo data + demo manager. |
| `npm run seed:empty` | Resets PostgreSQL tables with only the two groups (`SAKURA-2611`, `HAMA-3CHOME`). |
| `npm test` | Runs all 8 `node:test` suites (PostgreSQL, photos/EXIF, API, manager auth, SSE/Push, OpenAPI coverage, i18n parity). |
| `npm run build` | Builds the React PWA + custom Push Service Worker into `client/dist/`. |
| `npm start` | Starts the Express server serving both API and `client/dist/` on `PORT` (default `3001`). |

Environment variables (`server/.env`):
- `PORT`: server port (default `3001`)
- `DATABASE_URL`: PostgreSQL connection string (required)
- `DATABASE_SSL`: set `true` if your PostgreSQL host requires TLS without a custom CA
- `UPLOADS_DIR`: directory for uploaded photos (defaults to `server/uploads`; `/data/uploads` in Docker/Railway)
- `DEMO_MODE`: `true` enables demo neighbor/manager quick-login and participant-gated reminder fast-forward; `false` hides all demo routes
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`: optional — if omitted, VAPID keys are auto-generated once and persisted in PostgreSQL `app_settings`

## Deploy on Railway (Persistent PostgreSQL + Volume)

Otonari includes `Dockerfile` and `railway.json` for one-step deployment on [Railway](https://railway.com):

1. Create a Railway project from this repository (`Dockerfile` + `railway.json` are detected automatically).
2. Add a **PostgreSQL** service and link `DATABASE_URL`.
3. Attach a **Volume** mounted at `/data/uploads`.
4. Set environment variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `UPLOADS_DIR=/data/uploads`, `DEMO_MODE=true` (or `false`), and `RAILWAY_RUN_UID=0`.

## Project Structure

```text
otonari/
├── .github/workflows/ci.yml  GitHub Actions CI (PostgreSQL 16 + tests + PWA build)
├── Dockerfile                Multi-stage production build (client PWA + Express 5 server)
├── docker-compose.yml        PostgreSQL 16 + Otonari app with persistent volumes
├── railway.json              Railway deployment & healthcheck config
├── docs/
│   ├── SPEC.md               Complete v3 technical & product specification
│   ├── refactor-plan.md      v2 PostgreSQL/Docker/security refactor record & test matrix
│   └── screenshots/          App screenshots
├── client/                   React 18 + Vite PWA
│   └── src/
│       ├── sw.js             Custom injectManifest Service Worker (precaching + Web Push)
│       ├── pages/            Join, Manager, Shelf, ItemPage, MyItems, Loans, LoanPage, Settings, Poster
│       ├── components/       Banner (Notification Center + SSE + sticky due bar), Icons (@heroicons/react), PhraseBubble, SpeakButton, PhotoCapture, TrustLine, TipCard, ChipGroup
│       ├── i18n/             en.json, ja.json, ja-easy.json, bn.json, index.js
│       └── data/catalog.js   Fixed catalog, spots, quick replies, issues, stamps, durations
└── server/                   Modular Express 5 + PostgreSQL API
    ├── index.js              App factory, Swagger UI (/api/docs), lifecycle
    ├── config/constants.js   Allowlists mirrored with client catalog
    ├── db/                   pool.js (withTransaction + afterCommit), schema.js, seed.js
    ├── middleware/           auth.js, rateLimit.js, security.js
    ├── services/             loans.js, photos.js, reminders.js, passwords.js, transfer.js, events.js, push.js, notifications.js
    ├── routes/               groups.js, manager.js, items.js, loans.js, inbox.js, demo.js
    ├── docs/openapi.json     OpenAPI 3.0.3 specification (100% route-covered)
    └── test/                 8 automated node:test suites
```

## Privacy & Security

- **Nicknames & shared spots only.** Residents never share room numbers, emails, or passwords; optional `manager_note` during approval is visible strictly to the building manager.
- **Strict auth domain separation.** Manager accounts use `crypto.scrypt` + `timingSafeEqual` and `manager_sessions` tokens, isolated from resident tokens. Lost-phone restore immediately rotates and revokes the old device token.
- **Double EXIF/GPS stripping & upload defense.** Browser `<canvas>` redraw + server-side JPEG APP1 EXIF removal, magic-byte validation, 5 MB cap, UUID filenames, canonicalized `UPLOADS_DIR` boundary check, and `X-Content-Type-Options: nosniff`.
- **Abuse controls.** Parameterized SQL exclusively, rate limiting on auth/join/group/item/loan/quick-reply routes, max 50 active items per resident, max 5 SSE streams per resident, and security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`).

## AI Usage Disclosure

We used AI coding assistants during development: Claude for v1 initial scaffolding from the project specification, and Antigravity for v2/v3 architecture refactoring (PostgreSQL, Docker/volumes, Building Manager auth, 3-layer SSE/Web Push notifications, OpenAPI docs, security hardening, and automated test suites) as documented in [docs/SPEC.md](docs/SPEC.md) and [docs/refactor-plan.md](docs/refactor-plan.md). All localization phrases across Japanese, Easy Japanese, English, and Bengali were reviewed and refined by the team. **Otonari uses zero AI at runtime.**

## Team

| Name | Role |
|---|---|
| _Name 1_ | _Role (e.g. lead, backend)_ |
| _Name 2_ | _Role (e.g. localization, QA, architecture)_ |
| _Name 3_ | _Role (e.g. frontend)_ |
| _Name 4_ | _Role (e.g. user research, proposal)_ |
| _Name 5_ | _Role (e.g. demo video, presentation)_ |
