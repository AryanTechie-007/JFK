-- 011_ingestion_tables.sql — ingestion batch and per-row error tables (gap G-13,
-- WS-FND-P2). Columns follow docs/prototype-design/02-shared-data-model-and-contracts.md §3.3;
-- UNIQUE (user_id, idempotency_key) is required by the categorizer ingestion flow
-- (WS-CAT-P2) and tenant_id is the constant 'demo' in this deployment.

CREATE TABLE IF NOT EXISTS ingestion_batches (
  batch_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_format TEXT NOT NULL,
  mapping_profile_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')),
  counts TEXT NOT NULL DEFAULT '{}',
  progress TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT 'demo',
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_batches_user ON ingestion_batches (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_batches_status ON ingestion_batches (status, created_at);

CREATE TABLE IF NOT EXISTS ingestion_errors (
  batch_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  code TEXT NOT NULL,
  field TEXT,
  detail TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'demo',
  PRIMARY KEY (batch_id, row_index, code)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_errors_batch ON ingestion_errors (batch_id, row_index);
