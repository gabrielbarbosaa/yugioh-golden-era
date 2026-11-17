# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Go 1.24 backend (module `github.com/golden-era/api`) for "Golden Era", a Yu-Gi-Oh! deck builder / deck marketplace limited to the Duel Monsters era (OCG cards released through Dec 2003). Code comments, docs and error messages are in Brazilian Portuguese — follow that convention.

## Commands

```bash
go run ./cmd/api                      # API server (PORT, LOG_LEVEL env; default :8080)
go test ./...                         # all tests
go test ./internal/httpapi -run TestName   # single test
go build -o api ./cmd/api             # Dockerfile injects version via -ldflags "-X main.version=..."

go generate ./api/                    # regenerate internal/api/gen from api/openapi.yaml (oapi-codegen as go tool)
docker compose up -d --wait           # local Postgres (see .env.example for DATABASE_URL)
docker compose --profile app up -d --build   # Postgres + API in a container (API_PORT, default 8080; migrations run on boot)
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

## JavaScript workspace (mobile app now, Next.js site later)

npm workspaces at the repo root (`package.json`): `packages/api-client`, `apps/mobile` (Expo SDK 58 + Expo Router) and a future `apps/web` (Next.js). The Go API stays at the root; nothing was moved.

```bash
npm install                              # once, at the repo root
npm run mobile                           # Expo dev server (w = browser, a = Android, QR = Expo Go)
npm run api-client:generate              # regenerate packages/api-client/src/schema.d.ts from api/openapi.yaml
npm run typecheck                        # api-client + mobile
npm test -w @golden-era/api-client       # node:test with a fake fetch (token refresh logic)
cd apps/mobile && npx eslint src         # React Compiler lint rules are on: no setState in effects / ref writes in render
```

- `@golden-era/api-client` exports `createApiClient({ baseUrl, tokens, onSessionExpired })` (openapi-fetch). It attaches the Bearer token and, on a 401, trades the single-use refresh token for a new pair **once for all concurrent requests**, then retries. `schema.d.ts` is generated and committed — rerun the generator after editing `api/openapi.yaml`. The package is consumed as TypeScript source (no build step); Next.js will need `transpilePackages`.
- The app reads `EXPO_PUBLIC_API_URL` (default `localhost`, `10.0.2.2` on the Android emulator). On a physical phone use the machine's LAN IP **and** start the API with `IMAGE_BASE_URL=http://<ip>:8080/images`, since card image URLs come from the API.
- The API has CORS (`CORS_ORIGINS`, default Expo web + Next dev ports) because browsers call it directly; native apps don't need it.
- Expo changes every SDK: follow `apps/mobile/AGENTS.md` (use `npx expo install`, check the versioned docs before touching Expo APIs).
- Known contract gap: `DeckSummary` only has `coverCardId`, not an image URL, so deck lists can't show cover art yet.

## Architecture

- **Spec-first**: `api/openapi.yaml` is the single source of truth for the HTTP contract. `api/spec.go` embeds it (served at `/openapi.yaml`, Swagger UI at `/docs`). `oapi-codegen.yaml` is configured to generate models + a strict `net/http` ServeMux server into `internal/api/gen/api.gen.go`, (generated, committed; the output path is passed via `-o` in the `go:generate` line in `api/spec.go`, not in the config). The strict server is wired into `httpapi` (mounted under `/v1`); `implemented` in `internal/httpapi/server.go` lists the operations that have handlers — **when adding a handler, add its Go-style operation name (e.g. `ListCards`) there**, otherwise a strict middleware answers 501. `apiServer` embeds a nil `StrictServerInterface` for the rest.
- `internal/httpapi`: builds the router (stdlib `ServeMux`, Go 1.22+ method patterns) and middleware chain (`requestID`, `recoverer`, `accessLog`); errors are RFC 7807 problem+json (`problem.go`; handlers return `badRequest(...)` for 400). Implemented: health, cards (`listCards` with `(name,id)` keyset cursor, `getCard`, `listArchetypes`, `listSets`), plus `/images/` (static, from `IMAGES_DIR`), `/openapi.yaml`, `/docs`. Handlers depend on the `CardStore` interface, so tests use a fake (`cards_test.go`) and need no database.
- **Auth** (`internal/auth`, `httpapi/auth.go`): bcrypt passwords, HS256 JWT access tokens (`JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`), opaque single-use refresh tokens stored as SHA-256 hashes (rotation on `/auth/refresh`). The generated code carries no security metadata, so a strict middleware **denies by default**: every operation requires a Bearer token unless listed in `publicOps` (`httpapi/auth.go`). Handlers read the caller with `userID(ctx)`. Operations with optional auth (e.g. `getDeck`) will need their own handling.
- **Decks** (`internal/deck`, `store/decks.go`, `httpapi/decks.go`): `internal/deck` is pure domain code (build rules, stats, YDK parse/format). Rules: ≤3 copies per card across zones, Extra Deck cards only in `extra` (and never in `main`), main ≤60 / extra ≤15 / side ≤15, and **main ≥40 only when `visibility=public`** (private drafts may be incomplete). Imported YDK decks are created private. Private decks of others answer 404 (never 403) so their existence doesn't leak; 403 is only for public decks of others. Operations in `optionalAuthOps` (`httpapi/auth.go`) accept anonymous callers but reject an invalid token. Deck lists use keyset cursors that depend on the sort (`popular`: likes+id, `recent`/`updated`: timestamp+id).
- **Social** (`store/social.go`, `httpapi/social.go`): likes and comments only work on **public** decks (anything else is 404). `like_count`/`comment_count` are denormalized columns kept consistent inside single SQL statements (CTEs), so concurrent likes don't race; like/unlike/follow/unfollow are idempotent. Public profile (`GET /users/{username}`) counts only public decks, while `/me` counts all. Following yourself is 400.
- **Collection** (`store/collection.go`, `httpapi/collection.go`): `PUT /me/collection` replaces the whole collection in one transaction; entries with quantity 0 are dropped, duplicates/unknown cards/quantity outside 0–999 are 422 and leave the existing collection untouched.
- With the collection done, **every operation in `api/openapi.yaml` has a handler**; `notImplemented` stays as a guard for operations added to the contract later (and `TestAllContractOperationsAreImplemented` lists the current ones — extend it when the contract grows).
- `internal/store`: pgx queries (`Cards`, `Users`, `Decks`, `Social`, `Collection`). `/v1/sets` only returns sets released up to `ERA_END_DATE`.
- `internal/config`: env-based config (`PORT`, `LOG_LEVEL`, `DATABASE_URL`, `IMAGES_DIR`, `IMAGE_BASE_URL`, `ERA_END_DATE`; dev defaults match docker-compose). `cmd/api` pings Postgres at startup and fails if it is down.
- `cmd/ingest` + `internal/ingest` (stdlib only): fetches the era's cards and sets from YGOPRODeck, writes `cards.json`, `sets.json`, `report.txt` and images (`cards/`, `cards_small/`) under `.data/`. Image download is rate-limited and resumable. This produces local files only; `cmd/sqlgen` (`ingest.WriteImportSQL`) turns them into an idempotent `.data/import.sql` that is applied to PostgreSQL with psql.
- **No GitHub Actions**: the owner does not want any workflow under `.github/`; keep checks local.
- `migrations/` is also a Go package that embeds the `*.sql` files; `internal/migrate` applies them with goose's library (`MIGRATE_ON_START`). Goose-format SQL (`-- +goose Up`) for PostgreSQL (needs `pg_trgm`, `citext`). `cards.image_path` is relative; base URL is intended to come from `IMAGE_BASE_URL`. No DB access code exists yet.
- `.data/` holds downloaded ingest output (untracked; large).
