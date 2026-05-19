# lurus-newapi — Epic Breakdown

> Last Updated: 2026-05-18
> Service: 2b-svc-newapi (lurus-newapi)
> Source: 4-role Swarm 竞品分析（竞品 / 治理 / DX / 路由）2026-05-18
> Status: Proposed (awaiting Anita decision)

---

## Strategic Context

### 与 newhub Epic 8 (fork-audit) 的关系

`lurus/doc/decisions/2026-05-05-newapi-newhub-fork-audit.md` 评估了 "retire newapi → 整合到 newhub" 的 Option A，当前状态为 `Proposed (awaiting Anita decision)`，Story 8-2/8-3/8-4 全部 `blocked`。

**本规划的前提假设**：newapi 在未来 6-12 个月作为**独立 LLM gateway 基座**继续存在。两种走向下的处理：

| fork-audit 决策 | 本规划处理 |
|---|---|
| Option A 通过（整合到 newhub） | **本规划自动废止**，Top 6 epic 中"执行层"特性迁移到 newhub 接管的 gateway 代码中；DX 快赢仍可在迁移前的过渡期落地 |
| Option B / C（双仓维持） | 本规划生效，按下方优先级排期 |

### 产品定位（本规划下）

> **newapi = 执行层 LLM gateway**：毫秒级路由 / 限流 / 缓存 / 熔断 / 配额执行
> **newhub = 策略层多租户 Hub**：租户配置、Switch 模式、Platform 计费对账

**边界判断信号**：需要"这个用户属于哪个租户的哪个套餐" → newhub；只需要"这个 key 桶里还有多少 token" → newapi。

### 战略主线

> **从"上游 fork + 小补丁"进化为"现代化执行层 LLM gateway"**
> 沿用：OpenAI 兼容协议、上游 vanilla 同步能力
> 强化：缓存 / 智能路由 / 实时观测 / 治理执行
> 节制：不做内容审核 / 不追 100+ provider 覆盖 / 不重做 newhub 已做的租户层

---

## Epic 路线图概览

| Epic | Theme | Phase | Outcome |
|------|-------|-------|---------|
| **E1** | DX Quick Wins | Sprint 1（1 周） | 用户登录后 30 秒内能发出第一个调用 |
| **E2** | Cost-Saving Cache | Sprint 2-3（3 周） | 重复 prompt 账单降 20-95%；长 system prompt 省 50-90% token |
| **E3** | Reliability Floor | Sprint 4-5（3 周） | provider 抖动从 30s 超时 → 秒级切换；agent 失控不烧穿配额 |
| **E4** | Budget & Audit | Sprint 6-7（3 周） | per-key 预算告警；结构化审计日志合规可查 |
| **E5** | Trace UI & Observability | Sprint 8-10（4 周） | 错误归因从"我不知道哪个 key 挂"到完整 channel/key/retry 链 |
| **E6** | Smart Routing | Sprint 11-13（4 周） | 同模型多 channel 自动选最快/最便宜节点 |

**总工期估算**: 18 周（约 4.5 个月，单人投入）。可与 newhub Epic 7 并行。

---

## E1: DX Quick Wins（一周快赢，P0）

**Goal**: 让外部客户拿到 token 后 30 秒内能跑通第一个调用；让运营人员打开首页就觉得"这是现代 LLM gateway 而非 2022 老 one-api"。

**Success Criteria**:
- 新用户首次调用 TTFT（从 token 创建到第一次 200 响应）≤ 30 秒
- 错误日志可直接看出"哪个 channel / 哪个 key / 第几次重试"

| Story | Title | Priority | Status | 来源 |
|-------|-------|----------|--------|------|
| 1-1 | Token 详情页加调用代码卡片（curl/Python/TS）| P0 | backlog | Portkey/Helicone |
| 1-2 | 错误日志增强：channel + key 脱敏 + retry 链 | P0 | backlog | LiteLLM/Helicone |
| 1-3 | 首页加"最近 1 小时"健康摘要 banner（调用数/错误率/TTFT/top model）| P1 | backlog | Helicone Dashboard |

**实施成本**: 全部 S（纯前端 + 日志字段扩展），单人 1 周可全部交付。

---

## E2: Cost-Saving Cache（P0，最高 ROI）

**Goal**: 通过两层缓存让客户账单立刻可见下降，是最快验证 newapi 商业价值的 epic。

**Success Criteria**:
- Anthropic / OpenAI 含长 system prompt 的调用：cached token 占比 ≥ 40%
- 网关层 Exact-Match Cache 命中场景（FAQ、批量测试）：P99 延迟 5s → 5ms

| Story | Title | Priority | Status | 实施成本 |
|-------|-------|----------|--------|---------|
| 2-1 | Anthropic / OpenAI Prompt-Prefix Cache 自动注入 `cache_control` | P0 | backlog | S |
| 2-2 | 网关层 Exact-Match Response Cache (Redis, hash(model+messages))| P0 | backlog | M |
| 2-3 | Cache hit token 统计上报给用户（账单里可见 cached 占比）| P0 | backlog | S |
| 2-4 | Per-endpoint cache opt-out 开关（创意写作场景默认关）| P1 | backlog | S |

**风险防范（必须前置）**:
- ⚠️ **不引入 semantic cache**：RAG 场景"2024 营收" vs "2025 营收" 嵌入距离极近但答案完全不同，命中率低 + 误命中代价高
- ⚠️ Prefix cache 必须确保 system prompt **byte-identical**：与 newhub conversation history 压缩逻辑冲突需协调，否则反而多收 1.25× cache write 费

---

## E3: Reliability Floor（P0）

**Goal**: 把单次失控调用 / provider 抖动的爆炸半径压到最小，是开外部付费客户前的下限。

**Success Criteria**:
- 任一 provider 失败率 > 50% 持续 60s → 自动 half-open 探活，不影响其他流量
- 单次请求成本 ≥ 5× 历史均值 → 自动拒绝并告警
- 单 key 突发调用不挤占其他租户流量

| Story | Title | Priority | Status | 实施成本 | 来源 |
|-------|-------|----------|--------|---------|------|
| 3-1 | Cost-velocity 断路器（port 自 fork 旧实现）| P0 | backlog | S | 原 fork commit |
| 3-2 | Per-channel Circuit Breaker（open / half-open / closed） | P0 | backlog | M | Portkey |
| 3-3 | Per-key TPM + RPM 令牌桶（Redis + Lua 滑动窗口）| P0 | backlog | M | LiteLLM/agentgateway |
| 3-4 | 429 单独走 backoff 队列（不计入熔断计数）| P1 | backlog | S | Anthropic best practice |

**风险防范**:
- ⚠️ Circuit breaker 阈值不能太敏感（如 3 次/60s），否则正常 429 会让 channel 误熔断 → 流量被踢到更贵的 fallback，账单反而上升

---

## E4: Budget & Audit（P1）

**Goal**: 给付费客户预算可见性 + 给企业客户合规可审计性。

**Success Criteria**:
- per-key daily/monthly 预算可独立配置；达 80% / 95% / 100% 自动告警
- 任意请求可按 `who / what / when / cost / result` 维度审计

| Story | Title | Priority | Status | 实施成本 |
|-------|-------|----------|--------|---------|
| 4-1 | Per-key 多窗口预算（daily / monthly 独立重置）| P0 | backlog | M |
| 4-2 | 预算告警 webhook（80% / 95% / 100% 三档）| P0 | backlog | S |
| 4-3 | 结构化 JSON 审计日志（请求级，key 脱敏）| P1 | backlog | S |
| 4-4 | Scope-bound key（embedding-only / chat-only / image-only）| P1 | backlog | S |

**与 newhub 的边界**: newhub 在 Platform 计费层做"财务级扣费"，newapi 做"用量速率保护"。两者互补——前者算钱，后者控速。

---

## E5: Trace UI & Observability（P1）

**Goal**: 让"为什么这个请求失败/慢"在 UI 里 30 秒内可定位。

**Success Criteria**:
- 任意请求可看到完整 trace：channel 选择 → key 选择 → 重试链 → upstream 响应时间
- 实时 dashboard：per-model TPS / TTFT / cost 5 秒刷新

| Story | Title | Priority | Status | 实施成本 |
|-------|-------|----------|--------|---------|
| 5-1 | Trace 请求详情页（瀑布图 + retry 链 + upstream request-id）| P0 | backlog | M |
| 5-2 | OpenTelemetry / gen_ai semantic conventions export | P1 | backlog | L |
| 5-3 | 错误自动聚类（rate_limit / context_exceeded / model_not_found）| P1 | backlog | M |
| 5-4 | 实时 dashboard（per-model TPS / TTFT / cost）| P1 | backlog | L |

**前置依赖**: E1 Story 1-2 的日志字段扩展是 5-1 的基础。

---

## E6: Smart Routing（P2，差异化）

**Goal**: 同一模型多 channel 场景下，自动选最快/最便宜节点；中国/海外用户自动走不同 provider。

**Success Criteria**:
- 同模型 3 个 channel 场景：P50 延迟自动收敛到最优节点
- CN 用户访问 doubao 类模型：延迟 100ms 以内

| Story | Title | Priority | Status | 实施成本 |
|-------|-------|----------|--------|---------|
| 6-1 | 延迟感知路由（滚动 P50 窗口 + 权重叠加现有 priority）| P1 | backlog | M |
| 6-2 | 成本感知路由（同能力等级模型按价格排序）| P2 | backlog | M |
| 6-3 | 地理路由（channel 加 `region` 字段，按用户 IP/group 过滤）| P2 | backlog | L |

**与 newhub 的边界**: newhub 决定"该用什么模型"（业务策略），newapi 决定"该走哪个 channel"（执行策略）。

---

## 明确不引入清单

| 不做 | 理由 |
|------|------|
| Semantic cache（向量近似匹配）| RAG / 个性化场景误命中代价高，命中率低；运维向量库成本不划算 |
| PII / 越狱 Guardrails | 自研规则库维护重，建议留 newhub 层叠加；newapi 只做日志写前的脱敏 |
| 覆盖 100+ provider（LiteLLM 风格）| 走深度（模型常量完整 + 路由准确），不追广度；维护负担不划算 |
| 内容审核（OpenAI Moderation 兼容）| 与 newapi 定位不符；客户有需求时建议接 Azure Content Safety SaaS |
| Prompt 管理 + 模型对比 Playground | 工作量大、与 newhub admin UI 重叠风险高；优先级让位于 E1-E4 |

---

## Phase 划分

| Phase | Window | Epics | Outcome | 决策门 |
|-------|--------|-------|---------|--------|
| **Phase 1** | 2026-Q2 (3 周) | E1 + E2 | 现代化外观 + 账单可见下降 | E2 上线后看 30 天 cache hit 率，决定是否继续 |
| **Phase 2** | 2026-Q3 (6 周) | E3 + E4 | 可开外部付费客户 | E4 上线后等 fork-audit 决策，决定 E5/E6 是否还做在 newapi |
| **Phase 3** | 2026-Q4 (8 周) | E5 + E6 | 差异化卖点 | 若 fork-audit Option A 通过，Phase 3 全部迁到 newhub |

---

## 决策需要回答的问题

| # | 问题 | 默认答案 |
|---|------|---------|
| Q1 | 接受本规划进入 backlog？ | 是（推荐） |
| Q2 | 与 fork-audit Epic 8 的并行原则？ | 本规划 E1/E2/E3 立即可启动（与 fork 路径无关）；E5/E6 等 fork 决策 |
| Q3 | E1 三个 Story 是否单独走一周快赢冲刺？ | 是 |
| Q4 | 是否同步更新 lurus.yaml 的 newapi capabilities 段？ | 是，每个 Epic 落地后增量更新 |

---

## Appendix: Swarm 原始证据链

4 个 Sonnet Agent 的完整调研报告（含竞品功能矩阵 + 引用 URL）见对话记录 2026-05-18。共识 Top 6：

1. Response Exact-Match Cache（竞品+路由）→ E2 Story 2-2
2. Prompt-Prefix Cache 自动注入（路由）→ E2 Story 2-1
3. Per-key 多窗口预算告警（竞品+治理）→ E4 Story 4-1/4-2
4. Cost-velocity 断路器（竞品+治理+路由）→ E3 Story 3-1
5. Per-channel Circuit Breaker（竞品+路由）→ E3 Story 3-2
6. Trace 请求详情页 + per-key 限流（治理+DX）→ E3 Story 3-3 + E5 Story 5-1

**关键引用**：
- LiteLLM Virtual Keys / Cost Tracking
- Portkey Conditional Routing / Circuit Breaker
- Helicone Effective LLM Caching
- OpenRouter Provider Routing / `:nitro` / `:floor`
- Anthropic Prompt Caching Docs
