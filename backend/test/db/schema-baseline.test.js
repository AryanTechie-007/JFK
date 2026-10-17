'use strict';

// WS-FND-P2: migration 000_baseline.sql must reproduce the pre-migration application
// schema exactly (acceptance criterion; integration item G2).
//
// BASELINE_SCHEMA is the sqlite_master dump captured from backend/src/db.js immediately
// before its inline DDL block was replaced by the migration runner
// (plan-002-migrations-and-schema-gaps.md §6 step 1).
//
// Deviation recorded for the plan owner: the plan names
// backend/test/fixtures/fnd/schema-before.json for this data, but that path is outside
// plan §4's ownership table, so the identical dump is embedded in this authorised file.
// The fixture's line endings are LF (the form stored in the repository and checked out on
// Linux/CI); the executed copy is LF-canonicalised so the test is checkout-independent.
// Nothing about the comparison changes: same query, same whitespace (no normalisation), same order.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const { runMigrations, sha256 } = require('../../src/db/migrate');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');
const BASELINE_FILE = path.join(MIGRATIONS_DIR, '000_baseline.sql');

const BASELINE_SCHEMA = [{"type":"index","name":"idx_cat_hist_txn_ver","tbl_name":"categorization_history","sql":"CREATE INDEX idx_cat_hist_txn_ver ON categorization_history(txn_id, version)"},{"type":"index","name":"idx_txns_v1_user_cat","tbl_name":"transactions_v1","sql":"CREATE INDEX idx_txns_v1_user_cat ON transactions_v1(user_id, category_id)"},{"type":"index","name":"idx_txns_v1_user_date","tbl_name":"transactions_v1","sql":"CREATE INDEX idx_txns_v1_user_date ON transactions_v1(user_id, txn_date)"},{"type":"table","name":"accounts_v1","tbl_name":"accounts_v1","sql":"CREATE TABLE accounts_v1 (\n  account_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  display_name TEXT NOT NULL,\n  type TEXT NOT NULL DEFAULT 'CHECKING',\n  institution TEXT NOT NULL DEFAULT 'Primary Bank',\n  last4 TEXT NOT NULL DEFAULT '0000',\n  is_own_account INTEGER NOT NULL DEFAULT 1,\n  balance_minor INTEGER,\n  balance_as_of TEXT,\n  credit_limit_minor INTEGER,\n  statement_day INTEGER,\n  due_day INTEGER,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"action_ledger","tbl_name":"action_ledger","sql":"CREATE TABLE action_ledger (\n  action_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  proposal_id TEXT,\n  idempotency_key TEXT NOT NULL UNIQUE,\n  action_type TEXT NOT NULL,\n  status TEXT NOT NULL,\n  proposer TEXT NOT NULL,\n  params_json TEXT NOT NULL,\n  previous_state_json TEXT,\n  new_versions_json TEXT,\n  reversible_until TEXT,\n  undone_by_action_id TEXT,\n  executed_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"alerts_v1","tbl_name":"alerts_v1","sql":"CREATE TABLE alerts_v1 (\n  alert_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  kind TEXT NOT NULL,\n  category_id TEXT,\n  period TEXT NOT NULL,\n  tier TEXT NOT NULL,\n  severity TEXT NOT NULL,\n  dedupe_key TEXT NOT NULL UNIQUE,\n  headline_data_json TEXT NOT NULL DEFAULT '{}',\n  sentinel_result_ids_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'OPEN',\n  narrative_cache_json TEXT,\n  cooldown_until TEXT,\n  raised_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"budget_categories","tbl_name":"budget_categories","sql":"CREATE TABLE budget_categories (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  category TEXT NOT NULL,\n  monthly_cap REAL NOT NULL,\n  UNIQUE(user_id, category)\n)"},{"type":"table","name":"cap_month_overrides","tbl_name":"cap_month_overrides","sql":"CREATE TABLE cap_month_overrides (\n  user_id TEXT NOT NULL,\n  category_id TEXT NOT NULL,\n  period TEXT NOT NULL,\n  amount_minor INTEGER NOT NULL,\n  reason TEXT NOT NULL DEFAULT 'USER_PLAN',\n  set_by_action_id TEXT,\n  PRIMARY KEY (user_id, category_id, period)\n)"},{"type":"table","name":"caps_v1","tbl_name":"caps_v1","sql":"CREATE TABLE caps_v1 (\n  cap_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  category_id TEXT NOT NULL,\n  amount_minor INTEGER NOT NULL,\n  scope TEXT NOT NULL DEFAULT 'STANDING',\n  source TEXT NOT NULL DEFAULT 'USER',\n  watching INTEGER NOT NULL DEFAULT 0,\n  version INTEGER NOT NULL DEFAULT 1,\n  updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n  UNIQUE(user_id, category_id)\n)"},{"type":"table","name":"categorization_history","tbl_name":"categorization_history","sql":"CREATE TABLE categorization_history (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  txn_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  version INTEGER NOT NULL,\n  movement_type TEXT NOT NULL,\n  category_id TEXT,\n  classification_status TEXT NOT NULL,\n  classification_confidence TEXT NOT NULL,\n  classification_confidence_bp INTEGER NOT NULL,\n  classification_source TEXT NOT NULL,\n  rule_id TEXT,\n  reason_code TEXT,\n  paired_txn_id TEXT,\n  linked_expense_txn_id TEXT,\n  is_duplicate_of TEXT,\n  superseded_by TEXT,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"category_rules","tbl_name":"category_rules","sql":"CREATE TABLE category_rules (\n  rule_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  match_type TEXT NOT NULL,\n  pattern TEXT NOT NULL,\n  direction TEXT NOT NULL DEFAULT 'DEBIT',\n  category_id TEXT,\n  movement_type TEXT NOT NULL DEFAULT 'EXPENSE',\n  priority INTEGER NOT NULL DEFAULT 100,\n  active INTEGER NOT NULL DEFAULT 1,\n  version INTEGER NOT NULL DEFAULT 1,\n  created_from_action_id TEXT,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"chat_threads","tbl_name":"chat_threads","sql":"CREATE TABLE chat_threads (\n  thread_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  workspace TEXT NOT NULL DEFAULT 'JOHN',\n  rolling_summary TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"chat_turns","tbl_name":"chat_turns","sql":"CREATE TABLE chat_turns (\n  turn_id TEXT PRIMARY KEY,\n  thread_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  request_id TEXT NOT NULL,\n  role TEXT NOT NULL,\n  message TEXT NOT NULL,\n  response_json TEXT,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"confirmation_tokens","tbl_name":"confirmation_tokens","sql":"CREATE TABLE confirmation_tokens (\n  token_id TEXT PRIMARY KEY,\n  proposal_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  action_type TEXT NOT NULL,\n  params_hash TEXT NOT NULL,\n  snapshot_id TEXT NOT NULL,\n  tier TEXT NOT NULL,\n  issued_at TEXT NOT NULL,\n  expires_at TEXT NOT NULL,\n  used_at TEXT\n)"},{"type":"table","name":"declared_bills_v1","tbl_name":"declared_bills_v1","sql":"CREATE TABLE declared_bills_v1 (\n  bill_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  label TEXT NOT NULL,\n  category_id TEXT NOT NULL,\n  amount_minor INTEGER NOT NULL,\n  cadence TEXT NOT NULL DEFAULT 'MONTHLY',\n  due_day INTEGER NOT NULL DEFAULT 1,\n  next_due_date TEXT NOT NULL,\n  active INTEGER NOT NULL DEFAULT 1,\n  version INTEGER NOT NULL DEFAULT 1,\n  legacy_sub_id INTEGER,\n  legacy_bill_id INTEGER\n)"},{"type":"table","name":"goal_month_overrides","tbl_name":"goal_month_overrides","sql":"CREATE TABLE goal_month_overrides (\n  user_id TEXT NOT NULL,\n  goal_id TEXT NOT NULL,\n  period TEXT NOT NULL,\n  monthly_add_minor INTEGER NOT NULL,\n  set_by_action_id TEXT,\n  PRIMARY KEY (user_id, goal_id, period)\n)"},{"type":"table","name":"goals","tbl_name":"goals","sql":"CREATE TABLE goals (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  target_amount REAL NOT NULL,\n  saved_amount REAL DEFAULT 0,\n  monthly_allocation REAL DEFAULT 0,\n  priority TEXT DEFAULT 'medium',\n  status TEXT DEFAULT 'active',\n  source TEXT DEFAULT 'user',\n  created_at TEXT DEFAULT (datetime('now'))\n)"},{"type":"table","name":"goals_v1","tbl_name":"goals_v1","sql":"CREATE TABLE goals_v1 (\n  goal_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  name TEXT NOT NULL,\n  target_minor INTEGER NOT NULL,\n  saved_minor INTEGER NOT NULL DEFAULT 0,\n  monthly_add_minor INTEGER NOT NULL DEFAULT 0,\n  deadline TEXT,\n  priority_tier TEXT NOT NULL DEFAULT 'MEDIUM',\n  priority_rank INTEGER NOT NULL DEFAULT 2,\n  status TEXT NOT NULL DEFAULT 'ACTIVE',\n  archived_at TEXT,\n  restore_until TEXT,\n  version INTEGER NOT NULL DEFAULT 1,\n  legacy_goal_id INTEGER,\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"memory_facts","tbl_name":"memory_facts","sql":"CREATE TABLE memory_facts (\n  fact_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  text TEXT NOT NULL,\n  source_turn_id TEXT,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"outbox_events","tbl_name":"outbox_events","sql":"CREATE TABLE outbox_events (\n  event_id TEXT PRIMARY KEY,\n  type TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  occurred_at TEXT NOT NULL,\n  trace_id TEXT NOT NULL,\n  versions_json TEXT NOT NULL,\n  payload_json TEXT NOT NULL\n)"},{"type":"table","name":"proposals_v1","tbl_name":"proposals_v1","sql":"CREATE TABLE proposals_v1 (\n  proposal_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  request_id TEXT NOT NULL,\n  snapshot_id TEXT NOT NULL,\n  origin TEXT NOT NULL,\n  proposer TEXT NOT NULL,\n  action_type TEXT NOT NULL,\n  tier TEXT NOT NULL,\n  target_entity_type TEXT NOT NULL,\n  target_entity_id TEXT,\n  params_json TEXT NOT NULL,\n  rationale_json TEXT NOT NULL,\n  validation_tool_result_id TEXT,\n  impact_preview_json TEXT NOT NULL DEFAULT '{}',\n  preconditions_json TEXT NOT NULL DEFAULT '{}',\n  reversible INTEGER NOT NULL DEFAULT 1,\n  undo_window_s INTEGER NOT NULL DEFAULT 300,\n  depends_on_proposal_id TEXT,\n  status TEXT NOT NULL DEFAULT 'PENDING',\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"review_items","tbl_name":"review_items","sql":"CREATE TABLE review_items (\n  review_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  txn_id TEXT NOT NULL UNIQUE,\n  reason TEXT NOT NULL,\n  suggested_category_id TEXT,\n  suggested_movement_type TEXT NOT NULL,\n  confidence_bp INTEGER NOT NULL DEFAULT 0,\n  candidate_pair_txn_id TEXT,\n  priority_score INTEGER NOT NULL DEFAULT 0,\n  status TEXT NOT NULL DEFAULT 'OPEN',\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  resolved_at TEXT,\n  resolved_by_action_id TEXT\n)"},{"type":"table","name":"snapshots_v1","tbl_name":"snapshots_v1","sql":"CREATE TABLE snapshots_v1 (\n  snapshot_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  as_of TEXT NOT NULL,\n  current_date_ist TEXT NOT NULL,\n  current_month_ist TEXT NOT NULL,\n  ledger_version INTEGER NOT NULL,\n  plan_version INTEGER NOT NULL,\n  profile_version INTEGER NOT NULL,\n  rules_version INTEGER NOT NULL,\n  taxonomy_version TEXT NOT NULL DEFAULT '1.0.0',\n  sentinel_model_version TEXT NOT NULL DEFAULT '5.0.0'\n)"},{"type":"table","name":"subscriptions","tbl_name":"subscriptions","sql":"CREATE TABLE subscriptions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  amount REAL NOT NULL,\n  billing_cycle TEXT DEFAULT 'monthly',\n  category TEXT DEFAULT 'Entertainment',\n  next_billing_date TEXT,\n  created_at TEXT DEFAULT (datetime('now'))\n)"},{"type":"table","name":"transactions","tbl_name":"transactions","sql":"CREATE TABLE transactions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  raw_description TEXT NOT NULL,\n  amount REAL NOT NULL,\n  category TEXT NOT NULL DEFAULT 'Uncategorized',\n  txn_date TEXT DEFAULT (datetime('now')),\n  created_at TEXT DEFAULT (datetime('now'))\n)"},{"type":"table","name":"transactions_v1","tbl_name":"transactions_v1","sql":"CREATE TABLE transactions_v1 (\n  txn_id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  source TEXT NOT NULL DEFAULT 'STATEMENT_IMPORT',\n  status TEXT NOT NULL DEFAULT 'POSTED',\n  direction TEXT NOT NULL DEFAULT 'DEBIT',\n  amount_minor INTEGER NOT NULL,\n  currency TEXT NOT NULL DEFAULT 'INR',\n  txn_timestamp TEXT NOT NULL,\n  txn_date TEXT NOT NULL,\n  booking_date TEXT,\n  raw_description TEXT NOT NULL,\n  normalized_description TEXT NOT NULL,\n  counterparty_raw TEXT,\n  merchant_id TEXT,\n  merchant_display_name TEXT,\n  rail TEXT DEFAULT 'OTHER',\n  vpa TEXT,\n  mcc TEXT,\n  external_ref TEXT,\n  movement_type TEXT NOT NULL DEFAULT 'EXPENSE',\n  category_id TEXT,\n  classification_status TEXT NOT NULL DEFAULT 'UNCATEGORIZED',\n  classification_confidence TEXT NOT NULL DEFAULT 'LOW',\n  classification_confidence_bp INTEGER NOT NULL DEFAULT 0,\n  classification_source TEXT NOT NULL DEFAULT 'FALLBACK',\n  rule_id TEXT,\n  categorized_version INTEGER NOT NULL DEFAULT 1,\n  paired_txn_id TEXT,\n  linked_expense_txn_id TEXT,\n  superseded_by TEXT,\n  is_duplicate_of TEXT,\n  legacy_txn_id INTEGER,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"upcoming_bills","tbl_name":"upcoming_bills","sql":"CREATE TABLE upcoming_bills (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  label TEXT NOT NULL,\n  amount REAL NOT NULL,\n  due_date TEXT NOT NULL,\n  is_paid INTEGER DEFAULT 0\n)"},{"type":"table","name":"user_profiles_v1","tbl_name":"user_profiles_v1","sql":"CREATE TABLE user_profiles_v1 (\n  user_id TEXT PRIMARY KEY,\n  numeric_user_id INTEGER,\n  display_name TEXT NOT NULL DEFAULT 'User',\n  currency TEXT NOT NULL DEFAULT 'INR',\n  locale TEXT NOT NULL DEFAULT 'en-IN',\n  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',\n  declared_income_minor INTEGER,\n  fixed_expense_lines_json TEXT NOT NULL DEFAULT '[]',\n  preferences_json TEXT NOT NULL DEFAULT '{}',\n  version INTEGER NOT NULL DEFAULT 1,\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"user_state_versions","tbl_name":"user_state_versions","sql":"CREATE TABLE user_state_versions (\n  user_id TEXT PRIMARY KEY,\n  ledger_version INTEGER NOT NULL DEFAULT 1,\n  plan_version INTEGER NOT NULL DEFAULT 1,\n  profile_version INTEGER NOT NULL DEFAULT 1,\n  rules_version INTEGER NOT NULL DEFAULT 1,\n  import_in_progress INTEGER NOT NULL DEFAULT 0,\n  last_updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n)"},{"type":"table","name":"users","tbl_name":"users","sql":"CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE NOT NULL,\n  password_hash TEXT NOT NULL,\n  occupation TEXT,\n  monthly_income REAL DEFAULT 0,\n  fixed_housing_expense REAL DEFAULT 0,\n  risk_strategy TEXT DEFAULT 'balanced',\n  created_at TEXT DEFAULT (datetime('now'))\n)"}];

// The fixture is executed as LF text so the observed schema is identical on every platform.
// SQLite stores statement text verbatim, so a Windows checkout with core.autocrlf=true would
// otherwise put \r\n into sqlite_master and disagree with BASELINE_SCHEMA purely on line
// endings. Only line endings are canonicalised here: statements, their internal whitespace and
// their order are untouched, and the assertions below stay byte-exact deepEqual comparisons.
function baselineSqlText() {
  return fs.readFileSync(BASELINE_FILE, 'utf8').replace(/\r\n/g, '\n');
}

function baselineOnlyDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnd-baseline-'));
  fs.writeFileSync(path.join(dir, '000_baseline.sql'), baselineSqlText());
  return dir;
}

function applicationSchema(raw) {
  return raw
    .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name <> 'schema_migrations' ORDER BY type, name")
    .all()
    .map((row) => ({ type: row.type, name: row.name, tbl_name: row.tbl_name, sql: row.sql }));
}

test('000_baseline.sql reproduces the pre-migration application schema exactly', () => {
  const dir = baselineOnlyDir();
  try {
    const raw = new DatabaseSync(':memory:');
    const result = runMigrations(raw, dir);
    assert.deepEqual(result.applied, ['000_baseline.sql']);

    const observed = applicationSchema(raw);
    assert.deepEqual(observed, BASELINE_SCHEMA);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the baseline migration is recorded once with its file checksum, and the metadata table is excluded from the comparison', () => {
  const dir = baselineOnlyDir();
  try {
    const raw = new DatabaseSync(':memory:');
    runMigrations(raw, dir);

    const columns = raw.prepare('PRAGMA table_info(schema_migrations)').all().map((row) => row.name);
    assert.deepEqual(columns, ['id', 'checksum', 'applied_at']);

    const rows = raw.prepare('SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, '000_baseline.sql');

    // Must be the same bytes baselineOnlyDir() wrote, because that is what the runner hashed.
    const fileText = baselineSqlText();
    assert.equal(rows[0].checksum, sha256(fileText));
    assert.match(rows[0].checksum, /^[0-9a-f]{64}$/);
    assert.equal(rows[0].checksum, crypto.createHash('sha256').update(fileText, 'utf8').digest('hex'));
    assert.ok(typeof rows[0].applied_at === 'string' && rows[0].applied_at.length >= 19);

    const metadataObjects = raw
      .prepare("SELECT name FROM sqlite_master WHERE tbl_name = 'schema_migrations' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepEqual(metadataObjects, ['schema_migrations', 'sqlite_autoindex_schema_migrations_1']);
    const observedNames = applicationSchema(raw).map((row) => row.name);
    assert.ok(!observedNames.includes('schema_migrations'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
