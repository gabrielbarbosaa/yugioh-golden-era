# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Go 1.24 backend (module `github.com/golden-era/api`) for "Golden Era", a Yu-Gi-Oh! deck builder / deck marketplace limited to the Duel Monsters era (OCG cards released through Dec 2003). Code comments, docs and error messages are in Brazilian Portuguese — follow that convention.

## Commands

```bash
go run ./cmd/api                      # API server (PORT, LOG_LEVEL env; default :8080)
go test ./cmd/... ./internal/...      # all tests (plain ./... also walks node_modules/ and lists a stray Go package there)
go test ./internal/httpapi -run TestName   # single test
go build -o api ./cmd/api             # Dockerfile injects version via -ldflags "-X main.version=..."

go generate ./api/                    # regenerate internal/api/gen from api/openapi.yaml (oapi-codegen as go tool)
docker compose up -d --wait           # local Postgres (see .env.example for DATABASE_URL)
docker compose --profile app up -d --build   # Postgres + API (API_PORT, default 8080; migrations run on boot) + Next.js site (WEB_PORT, default 3000) in containers
MIGRATE_ON_START=true go run ./cmd/api       # same auto-migration when running on the host (default is off)
go run ./cmd/sqlgen -apply            # generate import.sql AND execute it against DATABASE_URL (no psql needed)
# apply migrations (PowerShell): $env:GOOSE_DRIVER='postgres'; $env:GOOSE_DBSTRING='<DATABASE_URL>'; go tool goose -dir migrations up

# import catalog into Postgres (idempotent): generate SQL, then apply it
go run ./cmd/sqlgen                   # .data/cards.json + sets.json -> .data/import.sql
docker compose cp .data/import.sql db:/tmp/import.sql; docker compose exec db psql -U golden -d golden_era -v ON_ERROR_STOP=1 -q -f /tmp/import.sql

go run ./cmd/ingest                   # download cards + images into .data/
go run ./cmd/ingest -image-limit 20   # quick test
go run ./cmd/ingest -skip-fetch       # reuse .data/cards.json, only resume pending images
go run ./cmd/ingest -images=false     # data only
```

Ingest flags can also be set via env `ERA_REGION` (ocg|tcg), `ERA_START_DATE`, `ERA_END_DATE`. `-rps` is capped at 10 because the YGOPRODeck API blocks IPs above 20 req/s.

## JavaScript workspace (mobile app + Next.js site)

npm workspaces at the repo root (`package.json`): `packages/api-client`, `apps/mobile` (Expo SDK 58 + Expo Router) and `apps/web` (Next.js 16). The Go API stays at the root; nothing was moved.

```bash
npm install                              # once, at the repo root
npm run mobile                           # Expo dev server (w = browser, a = Android, QR = Expo Go)
npm run web                              # Next.js dev server on :3000 (API_URL, default http://localhost:8080/v1)
cd apps/web && npx next build           # production build; validates the Cache Components rules (needs no running API)
npm run api-client:generate              # regenerate packages/api-client/src/schema.d.ts from api/openapi.yaml
npm run typecheck                        # api-client + mobile
npm test -w @golden-era/api-client       # node:test with a fake fetch (token refresh logic)
cd apps/mobile && npx eslint src         # React Compiler lint rules are on: no setState in effects / ref writes in render
```

- `@golden-era/api-client` exports `createApiClient({ baseUrl, tokens, onSessionExpired })` (openapi-fetch). It attaches the Bearer token and, on a 401, trades the single-use refresh token for a new pair **once for all concurrent requests**, then retries. `schema.d.ts` is generated and committed — rerun the generator after editing `api/openapi.yaml`. The package is consumed as TypeScript source (no build step); `apps/web/next.config.ts` lists it in `transpilePackages`.
- Site image: `apps/web/Dockerfile` (build context = repo root, own `apps/web/Dockerfile.dockerignore`; the root `.dockerignore` belongs to the Go API image). `next.config.ts` uses `output: "standalone"` + `outputFileTracingRoot` (repo root) so the standalone server finds `@golden-era/api-client`. In compose the site calls the API at `http://api:8080/v1` while the browser loads card images from the API's `IMAGE_BASE_URL` (`localhost:${API_PORT}`), and `COOKIE_SECURE` defaults to false because dev runs on HTTP — set it to true behind HTTPS.
- `apps/web` auth: login/register/logout are Server Actions (`app/actions.ts`) that store the API's access + refresh tokens in **httpOnly cookies** (`lib/session-cookies.ts`; `COOKIE_SECURE` overrides the `Secure` flag, default on in production). The refresh token is single-use, so renewal happens only in `src/proxy.ts` (server components can't set cookies): when the access cookie is gone but the refresh cookie exists it calls `/auth/refresh` and sets both cookies on the request and response; a failed refresh never deletes cookies (concurrent prefetches would otherwise log the user out). Server code reads the session with `lib/session.ts` (`authHeaders()`, `getCurrentUser()`), only inside `<Suspense>`; the deck page falls back to anonymous when the API answers 401 for a stale token. Likes/comments are Server Actions; deck editing, collection and copy stay in the app. When testing in the embedded browser, `requestAnimationFrame` may be paused (React's Suspense reveal and hydration wait on it): wake the page with a real click/type before trusting DOM checks.
- Catalog filters: `GET /cards/facets` (public) lists the distinct types, attributes, races and levels present in the catalog (`store.Cards.Facets`), next to `GET /archetypes`; `GET /cards` already accepts `type`, `attribute`, `race`, `level`, `archetype`. The site's home page builds its selects from them and keeps the filters in the URL (the cursor pager preserves them via `withQuery`); the mobile app's Cartas tab has a **Filtros** button that opens a full-screen sheet (components/filter-sheet.tsx, values from hooks/use-facets.ts, cached per session) and shows the active filters as removable chips.
- `apps/web` is otherwise a read-only public site (cards, deck marketplace, public decks, profiles) rendered on the server with the api-client, so the browser never calls the API (no CORS needed; images still load straight from the API's `IMAGE_BASE_URL`). Next 16 has `cacheComponents` on: anything reading `params`/`searchParams` or fetching uncached data must sit inside `<Suspense>` (pages are Partial Prerender shells + streamed data), titles come from `generateMetadata`. Follow `apps/web/AGENTS.md` and read `node_modules/next/dist/docs/` before using Next APIs. Because data streams, "not found" pages answer HTTP 200 (the 404 UI is rendered in-stream).
- The app reads `EXPO_PUBLIC_API_URL` (default `localhost`, `10.0.2.2` on the Android emulator). On a physical phone use the machine's LAN IP **and** start the API with `IMAGE_BASE_URL=http://<ip>:8080/images`, since card image URLs come from the API.
- The API has CORS (`CORS_ORIGINS`, default Expo web + Next dev ports) because browsers call it directly; native apps don't need it.
- Expo changes every SDK: follow `apps/mobile/AGENTS.md` (use `npx expo install`, check the versioned docs before touching Expo APIs).
- `Deck.cards` only has `{cardId, quantity}`, so the app loads card details in batches with `GET /cards?ids=1,2,3` (max 100, comma-separated — the api-client serializes arrays that way; cached in `hooks/use-cards.ts`). `DeckSummary.coverImageUrl` comes from a `LEFT JOIN cards` in the deck summary query (`store/decks.go`).
- Mobile session: `lib/token-store.ts` (SecureStore on native, localStorage on web) feeds the api-client; `lib/session.tsx` exposes `useSession()`. The Perfil tab shows the login/register form or the profile + "Meus decks". The deck editor lives at `app/deck/[id].tsx` (`new` creates); client-side rules in `lib/deck-rules.ts` mirror `internal/deck` (the server stays the authority and its 422 messages are shown).

## Architecture

- **Spec-first**: `api/openapi.yaml` is the single source of truth for the HTTP contract. `api/spec.go` embeds it (served at `/openapi.yaml`, Swagger UI at `/docs`). `oapi-codegen.yaml` is configured to generate models + a strict `net/http` ServeMux server into `internal/api/gen/api.gen.go`, (generated, committed; the output path is passed via `-o` in the `go:generate` line in `api/spec.go`, not in the config). The strict server is wired into `httpapi` (mounted under `/v1`); `implemented` in `internal/httpapi/server.go` lists the operations that have handlers — **when adding a handler, add its Go-style operation name (e.g. `ListCards`) there**, otherwise a strict middleware answers 501. `apiServer` embeds a nil `StrictServerInterface` for the rest.
- `internal/httpapi`: builds the router (stdlib `ServeMux`, Go 1.22+ method patterns) and middleware chain (`requestID`, `recoverer`, `accessLog`); errors are RFC 7807 problem+json (`problem.go`; handlers return `badRequest(...)` for 400). Implemented: health, cards (`listCards` with `(name,id)` keyset cursor, `getCard`, `listArchetypes`, `listSets`), plus `/images/` (static, from `IMAGES_DIR`), `/openapi.yaml`, `/docs`. Handlers depend on the `CardStore` interface, so tests use a fake (`cards_test.go`) and need no database.
- **Auth** (`internal/auth`, `httpapi/auth.go`): bcrypt passwords, HS256 JWT access tokens (`JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`), opaque single-use refresh tokens stored as SHA-256 hashes (rotation on `/auth/refresh`). Login is throttled **per account** (`httpapi/ratelimit.go`): 5 wrong passwords for the same e-mail in 15 min -> 429 + `Retry-After` until the window ends (successes reset it; not per IP, because the site and proxies share one IP; trade-off: someone can lock another person's login for 15 min). `APP_ENV=production` refuses to start with the dev `JWT_SECRET`. The generated code carries no security metadata, so a strict middleware **denies by default**: every operation requires a Bearer token unless listed in `publicOps` (`httpapi/auth.go`). Handlers read the caller with `userID(ctx)`. Operations with optional auth (e.g. `getDeck`) will need their own handling.
- **Decks** (`internal/deck`, `store/decks.go`, `httpapi/decks.go`): `internal/deck` is pure domain code (build rules, stats, YDK parse/format). Rules: ≤3 copies per card across zones (fewer for cards on the era's forbidden/limited list, see below), Extra Deck cards only in `extra` (and never in `main`), main ≤60 / extra ≤15 / side ≤15, and **main ≥40 only when `visibility=public`** (private drafts may be incomplete). Imported YDK decks are created private. Private decks of others answer 404 (never 403) so their existence doesn't leak; 403 is only for public decks of others. Operations in `optionalAuthOps` (`httpapi/auth.go`) accept anonymous callers but reject an invalid token. Deck lists use keyset cursors that depend on the sort (`popular`: likes+id, `recent`/`updated`: timestamp+id).
- **Banlist** (`internal/banlist`, `cmd/banlist`, `data/banlist/`): the era's OCG forbidden/limited list (Oct 2003 list, in force from 2003-10-15; source = Yugipedia, pasted by the owner) lives in `data/banlist/ocg-2003-10.txt` (`forbidden|limited|semi<TAB>card name`). `go run ./cmd/banlist` resolves the names against Postgres and writes the embedded `internal/banlist/ocg.json` (it fails without writing if a name has no unique match); a test keeps the JSON and the txt in sync. `deck.CardInfo.Limit` carries the limit (0 forbidden / 1 limited / 2 semi-limited; nil = 3) into `deck.Validate`, which counts copies across all zones; `prepareDeck` fills it from the list, so create/update/import/copy all enforce it (422 naming the card). `Card.maxCopies` (0..3) is on every card and `GET /banlist` (public) returns the whole list; the app (`lib/deck-rules.ts`) and the site (`/banlist`, card page) use it. The Forbidden section was absent from the pasted page, so the list currently has 0 forbidden cards. To change lists later, edit the txt and rerun the generator.
- **Social** (`store/social.go`, `httpapi/social.go`): likes and comments only work on **public** decks (anything else is 404). `like_count`/`comment_count` are denormalized columns kept consistent inside single SQL statements (CTEs), so concurrent likes don't race; like/unlike/follow/unfollow are idempotent. Public profile (`GET /users/{username}`) counts only public decks, while `/me` counts all. Following yourself is 400.
- **Collection** (`store/collection.go`, `httpapi/collection.go`): `PUT /me/collection` replaces the whole collection in one transaction; entries with quantity 0 are dropped, duplicates/unknown cards/quantity outside 0–999 are 422 and leave the existing collection untouched.
- With the collection done, **every operation in `api/openapi.yaml` has a handler**; `notImplemented` stays as a guard for operations added to the contract later (and `TestAllContractOperationsAreImplemented` lists the current ones — extend it when the contract grows).
- `internal/store`: pgx queries (`Cards`, `Users`, `Decks`, `Social`, `Collection`). `/v1/sets` only returns sets released up to `ERA_END_DATE`.
- `internal/config`: env-based config (`PORT`, `LOG_LEVEL`, `DATABASE_URL`, `IMAGES_DIR`, `IMAGE_BASE_URL`, `ERA_END_DATE`; dev defaults match docker-compose). `cmd/api` pings Postgres at startup and fails if it is down.
- `cmd/ingest` + `internal/ingest` (stdlib only): fetches the era's cards and sets from YGOPRODeck, writes `cards.json`, `sets.json`, `report.txt` and images (`cards/`, `cards_small/`) under `.data/`. Image download is rate-limited and resumable. This produces local files only; `cmd/sqlgen` (`ingest.WriteImportSQL`) turns them into an idempotent `.data/import.sql` that is applied to PostgreSQL with psql.
- **No GitHub Actions**: the owner does not want any workflow under `.github/`; keep checks local.
- `migrations/` is also a Go package that embeds the `*.sql` files; `internal/migrate` applies them with goose's library (`MIGRATE_ON_START`). Goose-format SQL (`-- +goose Up`) for PostgreSQL (needs `pg_trgm`, `citext`). `cards.image_path` is relative; base URL is intended to come from `IMAGE_BASE_URL`. No DB access code exists yet.
- `.data/` holds downloaded ingest output (untracked; large).
