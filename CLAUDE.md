# Lurus NewAPI

LLM API management and distribution, forked from new-api. Unified gateway for 40+ AI providers.

Go 1.25+ (Gin) / React (embedded) / PostgreSQL (prod) + SQLite (dev) / Redis.

## Commands

```bash
go build -o newapi ./cmd/server
go test ./...
cd web && bun install && bun run build   # Frontend
```

## BMAD

| Resource | Path |
|----------|------|
| Architecture | `./_bmad-output/planning-artifacts/architecture.md` |

---

## Upstream Conventions (from QuantumNous/new-api)

### Architecture

Layered architecture: Router -> Controller -> Service -> Model

```
router/        — HTTP routing (API, relay, dashboard, web)
controller/    — Request handlers
service/       — Business logic
model/         — Data models and DB access (GORM)
relay/         — AI API relay/proxy with provider adapters
  relay/channel/ — Provider-specific adapters (openai/, claude/, gemini/, aws/, etc.)
middleware/    — Auth, rate limiting, CORS, logging, distribution
setting/       — Configuration management (ratio, model, operation, system, performance)
common/        — Shared utilities (JSON, crypto, Redis, env, rate-limit, etc.)
dto/           — Data transfer objects (request/response structs)
constant/      — Constants (API types, channel types, context keys)
types/         — Type definitions (relay formats, file sources, errors)
i18n/          — Backend internationalization (go-i18n, en/zh)
oauth/         — OAuth provider implementations
pkg/           — Internal packages (cachex, ionet)
web/           — React frontend
  web/src/i18n/  — Frontend internationalization (i18next, zh/en/fr/ru/ja/vi)
```

### Rule 1: JSON Package — Use `common/json.go`

All JSON marshal/unmarshal operations MUST use the wrapper functions in `common/json.go`:
`common.Marshal`, `common.Unmarshal`, `common.UnmarshalJsonStr`, `common.DecodeJson`, `common.GetJsonType`.
Do NOT directly call `encoding/json` in business code.

### Rule 2: Database Compatibility — SQLite, MySQL >= 5.7.8, PostgreSQL >= 9.6

All database code MUST be compatible with all three databases. Prefer GORM methods over raw SQL.
Use `commonGroupCol`, `commonKeyCol`, `commonTrueVal`/`commonFalseVal` for DB-specific handling.

### Rule 3: Frontend — Prefer Bun

Use `bun` as the preferred package manager and script runner for `web/`.

### Rule 4: New Channel StreamOptions Support

When implementing a new channel, confirm whether the provider supports `StreamOptions`.
If supported, add the channel to `streamSupportedChannels`.
