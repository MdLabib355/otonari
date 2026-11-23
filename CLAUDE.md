# CLAUDE.md — Otonari (お隣) Working Rules

Operational reference for coding agents working on Otonari. For the full product, PostgreSQL schema, Manager Auth, 3-layer notification pipeline, and API specification, read [docs/SPEC.md](docs/SPEC.md) and [docs/refactor-plan.md](docs/refactor-plan.md).

## Core Invariants (Never Break)

1. **Zero free-text messaging between neighbors.** Every message is a `phrase_key` + JSONB `params`, rendered client-side (and server-side for localized Web Push) from `client/src/i18n/{en,ja,ja-easy,bn}.json`. Never store translated text in PostgreSQL.
2. **Privacy by design.** Residents join with nickname (`1–20` chars) + language — no email, password, or room number. Optional `manager_note` (`<=40` chars, when `require_approval=true`) is visible **only** to the building manager, never to other residents. Handovers use shared public spots only.
3. **No runtime AI or external APIs.** Translations are human-written JSON; VAPID keys for Web Push are auto-generated and persisted in PostgreSQL `app_settings` on first startup.
4. **Keep it simple and readable.** Plain JavaScript (no TypeScript), plain CSS (`client/src/styles.css`), Express 5, `pg` parameterized SQL (`$1..$N`), React 18 + Vite.
5. **Security rules.** Never commit `.env` or secrets. Always validate allowlists (`server/config/constants.js`), strip EXIF/GPS on uploaded photos, enforce canonicalized `UPLOADS_DIR`, separate resident vs. manager auth domains, and rate-limit abuse-prone routes.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run Express API (`:3001`) + Vite client (`:5173`) |
| `npm test` | Run all `node:test` suites sequentially against `DATABASE_URL` |
| `npm run build` | Build production React PWA + custom `sw.js` into `client/dist/` |
| `npm run seed` | Reset DB, clear uploads, seed Nagasaki demo data + demo manager |
| `npm run seed:empty` | Reset DB with groups only (no demo residents/items/loans) |
| `docker compose up --build` | Run PostgreSQL 16 + production app container on `:3001` |

## Modular Layout

- `server/config/constants.js` — Single source of truth for allowed catalog/phrase/issue/stamp keys (mirrored in `client/src/data/catalog.js`, enforced by `i18n.test.js`).
- `server/db/{pool,schema,seed}.js` — `pg` pool, `withTransaction` + `afterCommit` post-commit hooks, idempotent DDL/indexes, Nagasaki demo seeder.
- `server/middleware/{auth,rateLimit,security}.js` — `requireResidentAnyStatus`, `requireUser`, `requireManager`, fixed-window rate limiters, security headers & error handler.
- `server/services/{loans,photos,reminders,passwords,transfer,events,push,notifications}.js` — Domain logic, EXIF-stripped photo volume storage, 30s auto-expiry & reminder worker, `scrypt` password hashing, single-use transfer codes, SSE hub, VAPID Web Push, 3-layer dispatcher.
- `server/routes/{groups,manager,items,loans,inbox,demo}.js` — Thin HTTP routers.
- `server/docs/openapi.json` — OpenAPI 3.0.3 spec served at `/api/openapi.json` & `/api/docs` (100% route coverage enforced by `server/test/openapi.test.js`).
- `client/src/` — React 18 PWA (`pages/`, `components/`, `i18n/`, `data/catalog.js`, custom `sw.js`).

## Workflow Discipline

- Work in small vertical slices; after every slice run `npm test` and `npm run build` before committing.
- Update `server/docs/openapi.json` whenever adding/changing a route (`openapi.test.js` fails on drift).
- Add every new UI/phrase key to **all four** locale files (`en`, `ja`, `ja-easy`, `bn`) with identical `{placeholders}` (`i18n.test.js` enforces 100% parity).
- Review each slice using the workspace skills in `.agents/skills/` (mirrored in `.claude/skills/`): `senior-code-reviewer`, `application-security-auditor`, `senior-software-architect`, `senior-qa-test-engineer`.
