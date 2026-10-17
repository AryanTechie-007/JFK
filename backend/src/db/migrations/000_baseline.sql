-- 000_baseline.sql — baseline schema of the source application.
-- Reproduced verbatim from the inline CREATE TABLE block that backend/src/db.js executed
-- before WS-FND-P2 (plan-002-migrations-and-schema-gaps.md §6 step 2).
-- IF NOT EXISTS is kept so databases created by the older code migrate cleanly.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  occupation TEXT,
  monthly_income REAL DEFAULT 0,
  fixed_housing_expense REAL DEFAULT 0,
  risk_strategy TEXT DEFAULT 'balanced',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  saved_amount REAL DEFAULT 0,
  monthly_allocation REAL DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'active',
  source TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  monthly_cap REAL NOT NULL,
  UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_description TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  txn_date TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upcoming_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  is_paid INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  billing_cycle TEXT DEFAULT 'monthly',
  category TEXT DEFAULT 'Entertainment',
  next_billing_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- V1 Specification Canonical Tables (SC §5–§17)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_state_versions (
  user_id TEXT PRIMARY KEY,
  ledger_version INTEGER NOT NULL DEFAULT 1,
  plan_version INTEGER NOT NULL DEFAULT 1,
  profile_version INTEGER NOT NULL DEFAULT 1,
  rules_version INTEGER NOT NULL DEFAULT 1,
  import_in_progress INTEGER NOT NULL DEFAULT 0,
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_profiles_v1 (
  user_id TEXT PRIMARY KEY,
  numeric_user_id INTEGER,
  display_name TEXT NOT NULL DEFAULT 'User',
  currency TEXT NOT NULL DEFAULT 'INR',
  locale TEXT NOT NULL DEFAULT 'en-IN',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  declared_income_minor INTEGER,
  fixed_expense_lines_json TEXT NOT NULL DEFAULT '[]',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts_v1 (
  account_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'CHECKING',
  institution TEXT NOT NULL DEFAULT 'Primary Bank',
  last4 TEXT NOT NULL DEFAULT '0000',
  is_own_account INTEGER NOT NULL DEFAULT 1,
  balance_minor INTEGER,
  balance_as_of TEXT,
  credit_limit_minor INTEGER,
  statement_day INTEGER,
  due_day INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions_v1 (
  txn_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'STATEMENT_IMPORT',
  status TEXT NOT NULL DEFAULT 'POSTED',
  direction TEXT NOT NULL DEFAULT 'DEBIT',
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  txn_timestamp TEXT NOT NULL,
  txn_date TEXT NOT NULL,
  booking_date TEXT,
  raw_description TEXT NOT NULL,
  normalized_description TEXT NOT NULL,
  counterparty_raw TEXT,
  merchant_id TEXT,
  merchant_display_name TEXT,
  rail TEXT DEFAULT 'OTHER',
  vpa TEXT,
  mcc TEXT,
  external_ref TEXT,
  movement_type TEXT NOT NULL DEFAULT 'EXPENSE',
  category_id TEXT,
  classification_status TEXT NOT NULL DEFAULT 'UNCATEGORIZED',
  classification_confidence TEXT NOT NULL DEFAULT 'LOW',
  classification_confidence_bp INTEGER NOT NULL DEFAULT 0,
  classification_source TEXT NOT NULL DEFAULT 'FALLBACK',
  rule_id TEXT,
  categorized_version INTEGER NOT NULL DEFAULT 1,
  paired_txn_id TEXT,
  linked_expense_txn_id TEXT,
  superseded_by TEXT,
  is_duplicate_of TEXT,
  legacy_txn_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txns_v1_user_date ON transactions_v1(user_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_txns_v1_user_cat ON transactions_v1(user_id, category_id);

CREATE TABLE IF NOT EXISTS categorization_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  category_id TEXT,
  classification_status TEXT NOT NULL,
  classification_confidence TEXT NOT NULL,
  classification_confidence_bp INTEGER NOT NULL,
  classification_source TEXT NOT NULL,
  rule_id TEXT,
  reason_code TEXT,
  paired_txn_id TEXT,
  linked_expense_txn_id TEXT,
  is_duplicate_of TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cat_hist_txn_ver ON categorization_history(txn_id, version);

CREATE TABLE IF NOT EXISTS review_items (
  review_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  txn_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  suggested_category_id TEXT,
  suggested_movement_type TEXT NOT NULL,
  confidence_bp INTEGER NOT NULL DEFAULT 0,
  candidate_pair_txn_id TEXT,
  priority_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by_action_id TEXT
);

CREATE TABLE IF NOT EXISTS category_rules (
  rule_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'DEBIT',
  category_id TEXT,
  movement_type TEXT NOT NULL DEFAULT 'EXPENSE',
  priority INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_from_action_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals_v1 (
  goal_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_minor INTEGER NOT NULL,
  saved_minor INTEGER NOT NULL DEFAULT 0,
  monthly_add_minor INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  priority_tier TEXT NOT NULL DEFAULT 'MEDIUM',
  priority_rank INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  archived_at TEXT,
  restore_until TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  legacy_goal_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goal_month_overrides (
  user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  period TEXT NOT NULL,
  monthly_add_minor INTEGER NOT NULL,
  set_by_action_id TEXT,
  PRIMARY KEY (user_id, goal_id, period)
);

CREATE TABLE IF NOT EXISTS caps_v1 (
  cap_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'STANDING',
  source TEXT NOT NULL DEFAULT 'USER',
  watching INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, category_id)
);

CREATE TABLE IF NOT EXISTS cap_month_overrides (
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  period TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'USER_PLAN',
  set_by_action_id TEXT,
  PRIMARY KEY (user_id, category_id, period)
);

CREATE TABLE IF NOT EXISTS declared_bills_v1 (
  bill_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'MONTHLY',
  due_day INTEGER NOT NULL DEFAULT 1,
  next_due_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  legacy_sub_id INTEGER,
  legacy_bill_id INTEGER
);

CREATE TABLE IF NOT EXISTS alerts_v1 (
  alert_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  category_id TEXT,
  period TEXT NOT NULL,
  tier TEXT NOT NULL,
  severity TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  headline_data_json TEXT NOT NULL DEFAULT '{}',
  sentinel_result_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'OPEN',
  narrative_cache_json TEXT,
  cooldown_until TEXT,
  raised_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots_v1 (
  snapshot_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  as_of TEXT NOT NULL,
  current_date_ist TEXT NOT NULL,
  current_month_ist TEXT NOT NULL,
  ledger_version INTEGER NOT NULL,
  plan_version INTEGER NOT NULL,
  profile_version INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  taxonomy_version TEXT NOT NULL DEFAULT '1.0.0',
  sentinel_model_version TEXT NOT NULL DEFAULT '5.0.0'
);

CREATE TABLE IF NOT EXISTS proposals_v1 (
  proposal_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  proposer TEXT NOT NULL,
  action_type TEXT NOT NULL,
  tier TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT,
  params_json TEXT NOT NULL,
  rationale_json TEXT NOT NULL,
  validation_tool_result_id TEXT,
  impact_preview_json TEXT NOT NULL DEFAULT '{}',
  preconditions_json TEXT NOT NULL DEFAULT '{}',
  reversible INTEGER NOT NULL DEFAULT 1,
  undo_window_s INTEGER NOT NULL DEFAULT 300,
  depends_on_proposal_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS confirmation_tokens (
  token_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS action_ledger (
  action_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  proposal_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  proposer TEXT NOT NULL,
  params_json TEXT NOT NULL,
  previous_state_json TEXT,
  new_versions_json TEXT,
  reversible_until TEXT,
  undone_by_action_id TEXT,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memory_facts (
  fact_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  source_turn_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_threads (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace TEXT NOT NULL DEFAULT 'JOHN',
  rolling_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_turns (
  turn_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  versions_json TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
