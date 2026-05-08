# lurus-newapi (2b-svc-newapi)

Lurus 对内对外 LLM 中转站。**作为独立 LLM gateway 直接部署上游 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 镜像** —— 本仓库不再构建 Go 代码，只维护 K8s 部署 manifest。Platform 产品组 (P0)。

- Namespace / Port: `lurus-system` / pod:3000, svc:3000
- Domain: newapi.lurus.cn
- DB: PostgreSQL `newapi` (cluster `lurus-pg`，schema 由上游 auto-migrate 管理)
- Image: `calciumion/new-api:v1.0.0-rc.4` (上游官方镜像，sha-pinned)
- Node: cloud-ubuntu-1-16c32g (R1 PROD)

## 当前状态（2026-05-08 切换）

- 切换前：fork 本地代码 `ghcr.io/hanmahong5-arch/lurus-newapi:main-fc49e72`（27 个本地 commit 含 Gemini TTS、NATS 事件、admin api-key、cost-spike 等）
- 切换后：vanilla upstream `calciumion/new-api:v1.0.0-rc.4`，上述定制功能**全部丢弃**
- Schema 兼容性：本地 dump 验证 + R1 实跑 = 仅 1 处非破坏性 migration (`tokens.model_limits → text`)
- 回滚：把 `deploy/k8s.yaml` image tag 改回 `ghcr.io/hanmahong5-arch/lurus-newapi:main-fc49e72`，git push，ArgoCD auto-sync

## 已知 Drift（追踪中）

| 项 | 影响 | 处理 |
|----|------|------|
| Kyverno PolicyViolation (audit only) | `calciumion/*` 不在白名单 | 待选：mirror 到 GHCR / 调整 policy |
| NATS LLM_EVENTS 不再发出 | R6 NATS bridge 静默失业 | 由 newhub 或 R6 侧改为主动拉取，或废弃事件链路 |
| admin per-user API-key 端点丢失 (`/api/admin/users/:id/api-key`) | newhub 多租户配置受影响 | **newhub 待改造**（用户已确认，独立处理） |
| 登录 cookie 名 `lurus-session` → upstream 默认 `session` | 现有 session 失效，用户需重登 | 一次性影响 |
| `internal_api_keys` 表存在但无控制器 | 表是孤儿 | DB 清理留待 newhub 改造完成后 |
| 上游 perf_metrics SLOW SQL / `generation_ms ambiguous` | 偶发，非致命，仅性能采集 | 关注 upstream issue tracker，必要时报 |

## 仓库内容定位

- `deploy/` — **唯一活跃部分**，K8s manifest（被 ArgoCD app `lurus-newapi` 跟踪）
- `*.go`、`web/`、`controller/`、`relay/` 等 fork 代码 — **archived**，不再构建/运行；保留供回滚或将来选择性 port 参考
- `.github/workflows/docker-main.yml` CI — 仍在跑但镜像不再被部署引用，可视情况停用

## Tech Stack（上游 v1.0.0-rc.4）

| Layer | Choice |
|-------|--------|
| Backend | Go (上游 v1.0.0+，runtime: scratch/alpine) |
| Cache | Redis |
| Frontend | React + TS（上游迁移到 Rsbuild + Base UI） |
| i18n | go-i18n + i18next |

## Key Env Vars（生产生效的）

Required: `SQL_DSN`, `REDIS_CONN_STRING`, `SESSION_SECRET`
Optional in deploy: `STREAMING_TIMEOUT=300`, `RELAY_TIMEOUT=300`, `MEMORY_CACHE_ENABLED=true`, `BATCH_UPDATE_ENABLED=true`, `HTTP_PROXY/HTTPS_PROXY`（Gemini 等出网）
**遗留但已无效**: `NATS_URL`（上游不读，留着无副作用）

## Commands

```bash
# Pod / 日志
ssh root@100.98.57.55 "kubectl get pods -n lurus-system -l app=lurus-newapi"
ssh root@100.98.57.55 "kubectl logs -n lurus-system -l app=lurus-newapi --tail=100"

# 升级到新上游版本（流程）
# 1) 改 deploy/k8s.yaml 中 image tag 到 calciumion/new-api:vX.Y.Z
# 2) 在本地 docker-compose 跑 vanilla 上游 + 灌入 R1 dump 副本，验证 auto-migration 干净
# 3) git push origin main → ArgoCD auto-sync
# 4) kubectl rollout status deploy/lurus-newapi -n lurus-system

# 回滚
# 1) git revert <upgrade-commit> 或直接改 image tag 到上一个值
# 2) git push → ArgoCD auto-sync
```

## BMAD

| Resource | Path |
|----------|------|
| PRD | `./_bmad-output/planning-artifacts/prd.md` |
| Epics | `./_bmad-output/planning-artifacts/epics.md` |
| Architecture | `./_bmad-output/planning-artifacts/architecture.md` |
| Sprint Status | `./_bmad-output/implementation-artifacts/sprint-status.yaml` |
