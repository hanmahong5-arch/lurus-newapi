# lurus-newapi (2b-svc-newapi)

Lurus 对内对外 LLM 中转站 — fork [QuantumNous/new-api](https://github.com/QuantumNous/new-api)，保留本地定制（Gemini TTS/image2image、timing-safe auth、pprof 守护）。2b-svc-api (Lurus Hub) 于 2026-04-23 移除后，newapi 承担全部 LLM gateway 职责。Platform 产品组 (P0)。

- Namespace / Port: `lurus-system` / pod:3000, svc:3000
- Domain: newapi.lurus.cn
- DB: PostgreSQL `newapi` (prod) / SQLite (dev fallback), Redis DB 0
- Image: `ghcr.io/hanmahong5-arch/lurus-newapi:main-<sha7>` (自建 CI + GHCR)
- Node: cloud-ubuntu-1-16c32g (R1 PROD)

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Go 1.25, Gin, GORM |
| Cache | Redis (go-redis v8) |
| Frontend | React + TS, Bun, Vite (embedded `go:embed web/dist`) |
| i18n | go-i18n + i18next (zh/en/fr/ru/ja/vi) |

## Directory (one level)

- `main.go` — entry (Gin + embedded frontend)
- `common/` — env init, Redis, crypto, rate-limit, **JSON wrapper**
- `controller/` / `service/` / `model/` / `middleware/` / `router/`
- `relay/channel/` — provider adapters
- `setting/`, `dto/`, `types/`, `oauth/`, `pkg/`
- `web/` — React frontend (Bun workspace)
- `deploy/` — K8s manifests

## Upstream Conventions (必守)

1. **JSON**：业务代码必须用 `common.Marshal/Unmarshal`，不要直接 `encoding/json`
2. **DB 兼容**：所有 DB 代码要兼容 SQLite / MySQL ≥5.7.8 / PostgreSQL ≥9.6；用 `commonGroupCol/commonKeyCol/commonTrueVal/commonFalseVal`
3. **新 channel StreamOptions**：支持的 provider 必须加到 `streamSupportedChannels`

## Commands

```bash
# Local dev (SQLite, no Redis)
go run main.go

# Build
go build -ldflags "-s -w" -o new-api .
cd web && bun install && DISABLE_ESLINT_PLUGIN=true bun run build

# Test
go test ./...

# Full stack
docker-compose up -d          # PostgreSQL + Redis + new-api :3000
```

## Key Env Vars

Required: `SQL_DSN`, `REDIS_CONN_STRING`, `SESSION_SECRET` (禁止留 `"random_string"`)
Optional: `LOG_SQL_DSN`（日志独立 DB）, `NODE_TYPE=master|slave`, `MEMORY_CACHE_ENABLED`, `HTTP_PROXY`（Gemini 等），`GEMINI_SAFETY_SETTING=BLOCK_NONE`

## Gotchas

- 自建 CI (`.github/workflows/docker-main.yml`) on push to main builds `ghcr.io/hanmahong5-arch/lurus-newapi:main-<sha7>`；升级 = 改 `deploy/k8s.yaml` 镜像 tag 后 ArgoCD auto-sync
- SSE 流式超时 `STREAMING_TIMEOUT=300`（秒）无数据即断
- 上游同步：`git fetch upstream && git log HEAD..upstream/main` 查 diff。v0.13.0 (2026-04-24) 本地落后 5650 commits，合并是独立工程（48K 行 diff，需冲突解决 + 回归测试）

## BMAD

| Resource | Path |
|----------|------|
| PRD | `./_bmad-output/planning-artifacts/prd.md` |
| Epics | `./_bmad-output/planning-artifacts/epics.md` |
| Architecture | `./_bmad-output/planning-artifacts/architecture.md` |
| Sprint Status | `./_bmad-output/implementation-artifacts/sprint-status.yaml` |
