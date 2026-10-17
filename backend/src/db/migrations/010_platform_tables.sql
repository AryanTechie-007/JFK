-- 010_platform_tables.sql — platform tables required by Doc 2 §3.5 and the gap G-13 list
-- (WS-FND-P2, plan-002-migrations-and-schema-gaps.md §6 step 7).
-- Column names follow docs/prototype-design/02-shared-data-model-and-contracts.md §3.5.
-- Deviations are recorded in backend/src/db/TABLES.md.

CREATE TABLE IF NOT EXISTS tool_results (
  tool_result_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  task_id TEXT,
  caller TEXT NOT NULL,
  function TEXT NOT NULL,
  params TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  envelope TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT 'demo'
);
CREATE INDEX IF NOT EXISTS idx_tool_results_user_request ON tool_results (user_id, request_id);
CREATE INDEX IF NOT EXISTS idx_tool_results_reuse ON tool_results (function, params_hash, snapshot_id);

CREATE TABLE IF NOT EXISTS intent_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'demo'
);
CREATE INDEX IF NOT EXISTS idx_intent_tokens_user ON intent_tokens (user_id);

CREATE TABLE IF NOT EXISTS event_deliveries (
  event_id TEXT NOT NULL,
  handler TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'FAILED', 'DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'demo',
  PRIMARY KEY (event_id, handler)
);
CREATE INDEX IF NOT EXISTS idx_event_deliveries_pending ON event_deliveries (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT,
  run_at TEXT NOT NULL,
  locked_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT 'demo'
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs (status, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs (user_id, run_at);

CREATE TABLE IF NOT EXISTS jobs_dead_letter (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL,
  failed_at TEXT NOT NULL DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT 'demo'
);
CREATE INDEX IF NOT EXISTS idx_jobs_dead_letter_kind ON jobs_dead_letter (kind, failed_at);

CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  user_id TEXT,
  component TEXT NOT NULL,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms INTEGER,
  attrs_json TEXT NOT NULL DEFAULT '{}',
  tenant_id TEXT NOT NULL DEFAULT 'demo',
  PRIMARY KEY (trace_id, span_id)
);
CREATE INDEX IF NOT EXISTS idx_traces_user_started ON traces (user_id, started_at);

CREATE TABLE IF NOT EXISTS rolling_summaries (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(summary) <= 800),
  through_turn_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT 'demo'
);
CREATE INDEX IF NOT EXISTS idx_rolling_summaries_user ON rolling_summaries (user_id);
