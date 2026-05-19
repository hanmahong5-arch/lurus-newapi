-- 075_log_add_safety_columns.sql
-- C11 AIGC content safety — extend `log` table with 8 audit columns.
-- Refs:
--   ADR-0016 §5  (2l-svc-platform/doc/decisions/0016-c11-aigc-content-safety-wrapper.md)
--   PRD AC3      (2l-svc-platform/_bmad-output/john-c11-aigc-prd.md)
--
-- Idempotent: every ADD COLUMN uses IF NOT EXISTS so reruns on a
-- partially-applied DB are safe. The index uses IF NOT EXISTS.
-- Designed for PostgreSQL 14+ (newapi runs PG 16 on R1/R6).
--
-- Apply order on R6 (MIGRATIONS_AUTO_RUN=false, manual apply pattern
-- per platform CLAUDE.md):
--   1) Stage dry-run on R6 stage DB.
--   2) `psql -d newapi -f 075_log_add_safety_columns.sql`.
--   3) Verify: `\d log` shows the 8 new columns.
--
-- The columns are NULL-able so older Log rows written before the
-- middleware shipped continue to read cleanly (no backfill needed).
-- New rows written by the gateway populate them on the response path.

BEGIN;

-- 1. Which upstream service originated the LLM call.
--    Stable token set: search-gw / kova / lucrum / newapi-direct.
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS source_svc varchar(32);

-- 2. Which content-safety vendor classified this request.
--    Stable token set: stub / alibaba_green / tencent_tsec / netease_yidun.
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_vendor varchar(32);

-- 3. Input verdict (prompt classification). Smallint maps to the
--    Verdict enum in relay/safety/interface.go:
--      0 = pass, 1 = review, 2 = reject.
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_verdict_in smallint;

-- 4. Output verdict (LLM response classification). Same encoding
--    as safety_verdict_in.
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_verdict_out smallint;

-- 5. Normalized cross-vendor reason labels e.g. ["porn","politics"].
--    JSONB so DSAR / abuse review can filter by label without
--    splitting into a side table.
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_reasons jsonb;

-- 6. Input confidence score 0.0-1.0 (normalized across vendors).
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_score_in real;

-- 7. Output confidence score 0.0-1.0 (normalized across vendors).
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_score_out real;

-- 8. End-to-end vendor round-trip latency in milliseconds.
--    Sum of input + output check latencies for the request.
ALTER TABLE log
  ADD COLUMN IF NOT EXISTS safety_latency_ms integer;

-- Partial index — only the "interesting" rows (review or reject on
-- either side). Keeps the index tight on a high-volume log table.
-- DSAR queries hit this when filtering by safety_verdict_* > 0.
CREATE INDEX IF NOT EXISTS idx_log_safety_verdict
  ON log (safety_verdict_in, safety_verdict_out)
  WHERE safety_verdict_in > 0 OR safety_verdict_out > 0;

COMMIT;

-- Retention: 60-day floor per 网信办 minimum (PRD R4); reuses the
-- existing log cleanup job — no separate retention plumbing needed.
-- The Q3 review will decide whether to extend to 180 days for
-- DSAR friendliness (PRD Q3, due W4).
