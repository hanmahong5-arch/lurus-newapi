# lurus-newapi

LLM API 聚合网关，基于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) fork。
统一接入 40+ AI provider（OpenAI、Claude、Gemini、AWS Bedrock 等），提供计费、限流、渠道管理和 Web 管理面板。

- **Namespace / URL**: `lurus-system` / `newapi.lurus.cn`
- **Pod port**: `3000`；健康检查：`GET /api/status`
- **Node affinity**: `lurus.cn/vpn=true`（Gemini 等需代理访问的 provider）
- **Image (prod)**: `calciumion/new-api:v0.10.9`（upstream 镜像，非本地构建）

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Go 1.25, Gin, GORM |
| DB | PostgreSQL (prod) / SQLite (dev fallback) |
| Log DB | same as main DB, or separate via `LOG_SQL_DSN` |
| Cache | Redis (go-redis v8) |
| Frontend | React + TypeScript, Bun, Vite (embedded via `go:embed web/dist`) |
| i18n | go-i18n (backend), i18next (frontend: zh/en/fr/ru/ja/vi) |

## Directory Structure

```
main.go             # Entry: Gin server, embedded frontend, init sequence
common/             # Shared: env init, Redis, crypto, rate-limit, JSON wrapper
  init.go           # InitEnv() — all env var parsing happens here
constant/           # API types, channel types, context keys, runtime flags
controller/         # HTTP handlers (thin layer, calls service/)
service/            # Business logic (token, channel, subscription, task)
model/              # GORM models + DB init (InitDB / InitLogDB)
relay/              # AI relay/proxy engine
  relay/channel/    # Provider adapters (openai/, claude/, gemini/, aws/, …)
router/             # Route registration (API, relay, dashboard, web)
middleware/         # Auth, rate-limit, CORS, i18n, logging
setting/            # Config management (ratio, model, operation, performance)
dto/                # Request/response structs
types/              # Relay format types, file sources, error types
oauth/              # OAuth provider implementations
pkg/                # Internal libs (cachex, ionet)
web/                # React frontend (bun workspace)
deploy/             # K8s manifests (k8s.yaml, hpa.yaml, pdb.yaml)
```

## Upstream Conventions (must follow)

**Rule 1 — JSON**: Always use `common.Marshal` / `common.Unmarshal` etc. (`common/json.go`). Never call `encoding/json` directly in business code.

**Rule 2 — DB compatibility**: All DB code must work with SQLite / MySQL ≥ 5.7.8 / PostgreSQL ≥ 9.6. Use GORM methods; use `commonGroupCol`, `commonKeyCol`, `commonTrueVal`/`commonFalseVal` for DB-specific handling.

**Rule 3 — New channel StreamOptions**: When adding a new channel, check if the provider supports `StreamOptions`; if yes, add to `streamSupportedChannels`.

## Commands

```bash
# Local dev (SQLite, no Redis required)
go run main.go

# Build backend
go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api .

# Frontend
cd web && bun install
DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION=$(cat ../VERSION) bun run build

# Full local stack (docker-compose)
docker-compose up -d   # PostgreSQL + Redis + new-api on :3000

# Test
go test ./...

# makefile shortcuts
make build-frontend   # bun install + bun run build
make                  # build-frontend + go run main.go
```

## Environment Variables

### Required (prod)

| Variable | Description |
|----------|-------------|
| `SQL_DSN` | PostgreSQL DSN, e.g. `postgresql://user:pass@host:5432/newapi?sslmode=disable` |
| `REDIS_CONN_STRING` | Redis URL, e.g. `redis://redis.lurus-system.svc:6379/0` |
| `SESSION_SECRET` | Cookie session secret (must NOT be `"random_string"`) |

### Optional / Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_SQL_DSN` | same as `SQL_DSN` | Separate DB for request logs |
| `PORT` | `3000` | HTTP listen port |
| `NODE_TYPE` | `"master"` | Set to `"slave"` to disable master-only tasks |
| `DEBUG` | `false` | Enable debug logging |
| `GIN_MODE` | `release` | Set to `debug` for Gin debug mode |
| `MEMORY_CACHE_ENABLED` | `false` | In-memory channel/user cache |
| `SYNC_FREQUENCY` | `60` | Cache sync interval (seconds) |
| `BATCH_UPDATE_ENABLED` | `false` | Enable batch DB writes |
| `BATCH_UPDATE_INTERVAL` | `5` | Batch flush interval (seconds) |
| `RELAY_TIMEOUT` | `0` | Upstream relay timeout (seconds; 0=no timeout) |
| `STREAMING_TIMEOUT` | `300` | SSE stream no-data timeout (seconds) |
| `CHANNEL_UPDATE_FREQUENCY` | — | Auto-test channels interval (seconds) |
| `ERROR_LOG_ENABLED` | `false` | Log error responses to DB |
| `GEMINI_SAFETY_SETTING` | `BLOCK_NONE` | Gemini safety level |
| `COHERE_SAFETY_SETTING` | `NONE` | Cohere safety mode |
| `SQLITE_PATH` | `one-api.db` | SQLite file path (dev only) |
| `ENABLE_PPROF` | `false` | Expose pprof on `:8005` |
| `PYROSCOPE_URL` | — | Grafana Pyroscope endpoint |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | Outbound proxy (needed for Gemini in prod) |
| `NO_PROXY` | — | Proxy bypass list |
| `UMAMI_WEBSITE_ID` | — | Umami analytics site ID |
| `GOOGLE_ANALYTICS_ID` | — | GA4 measurement ID |
| `TLS_INSECURE_SKIP_VERIFY` | `false` | Skip TLS verification for upstream |
| `TRUSTED_REDIRECT_DOMAINS` | — | Comma-separated OAuth redirect domains |

## K8s Operations

```bash
# View pods
ssh root@100.98.57.55 "kubectl get pods -n lurus-system"

# Restart
ssh root@100.98.57.55 "kubectl rollout restart deployment/lurus-newapi -n lurus-system"

# Logs
ssh root@100.98.57.55 "kubectl logs -n lurus-system deployment/lurus-newapi --tail=100"

# Update image tag (edit deploy/k8s.yaml, then apply)
ssh root@100.98.57.55 "kubectl apply -f -" < deploy/k8s.yaml
```

## BMAD

| Resource | Path |
|----------|------|
| Architecture | `./_bmad-output/planning-artifacts/architecture.md` |
| Product Brief | `./_bmad-output/product-brief.md` |
| Project Context | `./_bmad-output/project-context.md` |
