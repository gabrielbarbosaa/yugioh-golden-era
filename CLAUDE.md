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

## Architecture

- **Spec-first**: `api/openapi.yaml` is the single source of truth for the HTTP contract. `api/spec.go` embeds it (served at `/openapi.yaml`, Swagger UI at `/docs`). `oapi-codegen.yaml` is configured to generate models + a strict `net/http` ServeMux server into `internal/api/gen/api.gen.go`, (generated, committed; the output path is passed via `-o` in the `go:generate` line in `api/spec.go`, not in the config). The strict server is wired into `httpapi` (mounted under `/v1`); `implemented` in `internal/httpapi/server.go` lists the operations that have handlers — **when adding a handler, add its Go-style operation name (e.g. `ListCards`) there**, otherwise a strict middleware answers 501. `apiServer` embeds a nil `StrictServerInterface` for the rest.
- `internal/httpapi`: builds the router (stdlib `ServeMux`, Go 1.22+ method patterns) and middleware chain (`requestID`, `recoverer`, `accessLog`); errors are RFC 7807 problem+json (`problem.go`; handlers return `badRequest(...)` for 400). Implemented: health, cards (`listCards` with `(name,id)` keyset cursor, `getCard`, `listArchetypes`, `listSets`), plus `/images/` (static, from `IMAGES_DIR`), `/openapi.yaml`, `/docs`. Handlers depend on the `CardStore` interface, so tests use a fake (`cards_test.go`) and need no database.
- `internal/store`: pgx queries (`Cards`). `/v1/sets` only returns sets released up to `ERA_END_DATE`.
- `internal/config`: env-based config (`PORT`, `LOG_LEVEL`, `DATABASE_URL`, `IMAGES_DIR`, `IMAGE_BASE_URL`, `ERA_END_DATE`; dev defaults match docker-compose). `cmd/api` pings Postgres at startup and fails if it is down.
- `cmd/ingest` + `internal/ingest` (stdlib only): fetches the era's cards and sets from YGOPRODeck, writes `cards.json`, `sets.json`, `report.txt` and images (`cards/`, `cards_small/`) under `.data/`. Image download is rate-limited and resumable. This produces local files only; `cmd/sqlgen` (`ingest.WriteImportSQL`) turns them into an idempotent `.data/import.sql` that is applied to PostgreSQL with psql.
- `migrations/`: goose-format SQL (`-- +goose Up`) for PostgreSQL (needs `pg_trgm`, `citext`). `cards.image_path` is relative; base URL is intended to come from `IMAGE_BASE_URL`. No DB access code exists yet.
- `.data/` holds downloaded ingest output (untracked; large).
