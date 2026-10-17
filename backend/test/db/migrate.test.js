'use strict';

// WS-FND-P2: migration runner and gap G-13 table contracts
// (plan-002-migrations-and-schema-gaps.md §6 steps 3, 6, 7).
//
// These tests work on their own throwaway databases: they never open the application
// database, so the frozen test helpers are not required here.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const { runMigrations, sha256, MIGRATIONS_DIR } = require('../../src/db/migrate');

const BASELINE_FILE = path.join(MIGRATIONS_DIR, '000_baseline.sql');
const NEW_TABLES = [
  'event_deliveries',
  'ingestion_batches',
  'ingestion_errors',
  'intent_tokens',
  'jobs',
  'jobs_dead_letter',
  'rolling_summaries',
  'tool_results',
  'traces',
];
const NEW_INDEXES = [
  'idx_event_deliveries_pending',
  'idx_ingestion_batches_status',
  'idx_ingestion_batches_user',
  'idx_ingestion_errors_batch',
  'idx_intent_tokens_user',
  'idx_jobs_dead_letter_kind',
  'idx_jobs_due',
  'idx_jobs_user',
  'idx_rolling_summaries_user',
  'idx_tool_results_reuse',
  'idx_tool_results_user_request',
  'idx_traces_user_started',
];

function freshDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  return raw;
}

function tempMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnd-migrate-'));
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), sql, 'utf8');
  }
  return dir;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function tableNames(raw) {
  return raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function indexNames(raw) {
  return raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name")
    .all()
    .map((row) => row.name);
}

function insertToolResult(raw, overrides = {}) {
  const row = {
    tool_result_id: 'tre_01',
    user_id: 'usr_01',
    request_id: 'req_01',
    task_id: null,
    caller: 'john',
    function: 'snapshot.create',
    params: '{}',
    params_hash: 'a'.repeat(64),
    snapshot_id: 'snp_01',
    envelope: '{}',
    ...overrides,
  };
  raw
    .prepare(
      'INSERT INTO tool_results (tool_result_id, user_id, request_id, task_id, caller, function, params, params_hash, snapshot_id, envelope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      row.tool_result_id,
      row.user_id,
      row.request_id,
      row.task_id,
      row.caller,
      row.function,
      row.params,
      row.params_hash,
      row.snapshot_id,
      row.envelope
    );
}

test('applies every migration once, in lexical order, and records each one', () => {
  const raw = freshDb();
  const result = runMigrations(raw, MIGRATIONS_DIR);

  assert.deepEqual(result.applied, [
    '000_baseline.sql',
    '010_platform_tables.sql',
    '011_ingestion_tables.sql',
  ]);

  const recorded = raw
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all()
    .map((row) => row.id);
  assert.deepEqual(recorded, result.applied);
});

test('records the sha-256 checksum of every applied migration file', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const rows = raw.prepare('SELECT id, checksum FROM schema_migrations ORDER BY id').all();
  assert.equal(rows.length, 3);
  for (const row of rows) {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, row.id), 'utf8');
    assert.match(row.checksum, /^[0-9a-f]{64}$/);
    assert.equal(row.checksum, sha256(text));
  }
});

test('is idempotent: a second run applies nothing and rethrows nothing', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const second = runMigrations(raw, MIGRATIONS_DIR);
  assert.deepEqual(second.applied, []);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 3);
});

test('refuses to run when a recorded migration file changed (MIGRATION_CHECKSUM_MISMATCH)', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);
  raw
    .prepare('UPDATE schema_migrations SET checksum = ? WHERE id = ?')
    .run('0'.repeat(64), '010_platform_tables.sql');

  assert.throws(() => runMigrations(raw, MIGRATIONS_DIR), /MIGRATION_CHECKSUM_MISMATCH: 010_platform_tables\.sql/);
});

test('rolls back a failing migration file, leaving no partial schema and no recording', () => {
  const dir = tempMigrations({
    '000_ok.sql': 'CREATE TABLE a (id TEXT PRIMARY KEY);',
    '010_bad.sql': 'CREATE TABLE b (id TEXT PRIMARY KEY);\nTHIS IS NOT SQL;',
  });
  try {
    const raw = freshDb();
    assert.throws(() => runMigrations(raw, dir));

    assert.deepEqual(tableNames(raw), ['a', 'schema_migrations']);
    const recorded = raw.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map((row) => row.id);
    assert.deepEqual(recorded, ['000_ok.sql']);
  } finally {
    removeDir(dir);
  }
});

test('refuses to run when a recorded migration file is missing (MIGRATION_FILE_MISSING)', () => {
  const dir = tempMigrations({
    '000_ok.sql': 'CREATE TABLE a (id TEXT PRIMARY KEY);',
    '010_ok.sql': 'CREATE TABLE b (id TEXT PRIMARY KEY);',
  });
  try {
    const raw = freshDb();
    runMigrations(raw, dir);
    fs.rmSync(path.join(dir, '010_ok.sql'));

    assert.throws(() => runMigrations(raw, dir), /MIGRATION_FILE_MISSING: 010_ok\.sql/);
  } finally {
    removeDir(dir);
  }
});

test('creates every gap G-13 table and its indexes', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const tables = tableNames(raw);
  for (const table of NEW_TABLES) assert.ok(tables.includes(table), 'missing table ' + table);

  const indexes = indexNames(raw);
  for (const index of NEW_INDEXES) assert.ok(indexes.includes(index), 'missing index ' + index);
});

test('tool_results requires its documented columns and a unique tool_result_id', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  insertToolResult(raw);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM tool_results').get().n, 1);

  assert.throws(() => insertToolResult(raw), /UNIQUE constraint failed: tool_results\.tool_result_id/);
  assert.throws(() => insertToolResult(raw, { tool_result_id: 'tre_02', params_hash: null }), /NOT NULL/);
  assert.throws(() => insertToolResult(raw, { tool_result_id: 'tre_03', snapshot_id: null }), /NOT NULL/);

  const columns = raw.prepare('PRAGMA table_info(tool_results)').all().map((row) => row.name);
  for (const column of ['params', 'params_hash', 'snapshot_id', 'envelope']) {
    assert.ok(columns.includes(column), 'missing column ' + column);
  }
});

test('intent_tokens stores hashes as primary key and never two rows for one token', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const insert = raw.prepare(
    'INSERT INTO intent_tokens (token_hash, user_id, action, params_hash, origin, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insert.run('h1', 'usr_01', 'transactions.set_category', 'p1', 'chat', '2030-01-01T00:00:00Z', null);
  assert.throws(
    () => insert.run('h1', 'usr_01', 'transactions.set_category', 'p1', 'chat', '2030-01-01T00:00:00Z', null),
    /UNIQUE constraint failed: intent_tokens\.token_hash/
  );

  const columns = raw.prepare('PRAGMA table_info(intent_tokens)').all().map((row) => row.name);
  assert.ok(columns.includes('token_hash'));
  assert.ok(!columns.includes('token'), 'plaintext token column must not exist');
});

test('event_deliveries, jobs and ingestion statuses are constrained by CHECK', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const delivery = raw.prepare(
    'INSERT INTO event_deliveries (event_id, handler, status, attempts) VALUES (?, ?, ?, ?)'
  );
  delivery.run('evt_01', 'audit', 'PENDING', 0);
  assert.throws(() => delivery.run('evt_02', 'audit', 'BOGUS', 0), /CHECK constraint failed/);
  assert.throws(() => delivery.run('evt_01', 'audit', 'DONE', 0), /UNIQUE constraint failed/);

  const job = raw.prepare(
    'INSERT INTO jobs (job_id, kind, user_id, run_at, status) VALUES (?, ?, ?, ?, ?)'
  );
  job.run('job_01', 'period_rollover', null, '2030-01-01T00:05:00Z', 'PENDING');
  assert.throws(() => job.run('job_02', 'period_rollover', null, '2030-01-01T00:05:00Z', 'BOGUS'), /CHECK constraint failed/);

  const batch = raw.prepare(
    'INSERT INTO ingestion_batches (batch_id, user_id, idempotency_key, source_format, status) VALUES (?, ?, ?, ?, ?)'
  );
  batch.run('bat_01', 'usr_01', 'key-1', 'csv', 'PROCESSING');
  assert.throws(() => batch.run('bat_02', 'usr_01', 'key-1', 'csv', 'PROCESSING'), /UNIQUE constraint failed/);
  assert.throws(() => batch.run('bat_03', 'usr_01', 'key-2', 'csv', 'BOGUS'), /CHECK constraint failed/);
});

test('traces and ingestion_errors use composite primary keys', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const span = raw.prepare(
    'INSERT INTO traces (trace_id, span_id, parent_span_id, user_id, component, name, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  span.run('trc_01', 'spn_01', null, 'usr_01', 'gateway', 'callTool', '2030-01-01T00:00:00Z');
  span.run('trc_02', 'spn_01', null, 'usr_01', 'gateway', 'callTool', '2030-01-01T00:00:00Z');
  assert.throws(
    () => span.run('trc_01', 'spn_01', null, 'usr_01', 'gateway', 'callTool', '2030-01-01T00:00:00Z'),
    /UNIQUE constraint failed: traces\.trace_id, traces\.span_id/
  );

  const error = raw.prepare(
    'INSERT INTO ingestion_errors (batch_id, row_index, code, field, detail) VALUES (?, ?, ?, ?, ?)'
  );
  error.run('bat_01', 3, 'AMOUNT_NOT_INTEGER', 'amount', 'row 3');
  error.run('bat_01', 3, 'DATE_UNPARSEABLE', 'date', 'row 3');
  assert.throws(() => error.run('bat_01', 3, 'AMOUNT_NOT_INTEGER', 'amount', 'dup'), /UNIQUE constraint failed/);
});

test('rolling_summaries enforces the 800-character summary bound', () => {
  const raw = freshDb();
  runMigrations(raw, MIGRATIONS_DIR);

  const insert = raw.prepare(
    'INSERT INTO rolling_summaries (thread_id, user_id, summary, through_turn_id) VALUES (?, ?, ?, ?)'
  );
  insert.run('thr_01', 'usr_01', 'a'.repeat(800), 'trn_01');
  assert.throws(() => insert.run('thr_02', 'usr_01', 'a'.repeat(801), 'trn_02'), /CHECK constraint failed/);
});

test('migrates a database created by the pre-migration inline schema without altering it', () => {
  const raw = freshDb();
  raw.exec(fs.readFileSync(BASELINE_FILE, 'utf8'));

  const before = raw
    .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all();
  assert.ok(before.length >= 30);

  const result = runMigrations(raw, MIGRATIONS_DIR);
  assert.deepEqual(result.applied, [
    '000_baseline.sql',
    '010_platform_tables.sql',
    '011_ingestion_tables.sql',
  ]);

  const after = raw
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name <> 'schema_migrations' ORDER BY type, name"
    )
    .all()
    .filter((row) => !NEW_TABLES.includes(row.name) && !NEW_INDEXES.includes(row.name));
  assert.deepEqual(after, before);

  const tables = tableNames(raw);
  for (const table of NEW_TABLES) assert.ok(tables.includes(table), 'missing table ' + table);
});

// ---------------------------------------------------------------------------
// Startup integrity check (plan-002 §6 step 8). The check runs inside db.js when the
// application database is opened, so these tests start the real application module in a
// worker thread instead of poking at internals: db.js has no test seam and this plan adds
// no new module.
// ---------------------------------------------------------------------------

const { Worker } = require('node:worker_threads');

const DB_MODULE = path.join(__dirname, '..', '..', 'src', 'db.js');

function openAppDatabase(dbPath) {
  const raw = new DatabaseSync(dbPath);
  runMigrations(raw, MIGRATIONS_DIR);
  return raw;
}

// A worker thread rather than a child process: it gets a fresh module registry (so the
// db.js singleton runs again) without spawning, which keeps the suite runnable in
// sandboxed environments where child_process is denied.
function startApplication(dbPath, nodeEnv) {
  return new Promise((resolve) => {
    const script =
      'require(' +
      JSON.stringify(DB_MODULE) +
      '); require("node:worker_threads").parentPort.postMessage("started");';
    const worker = new Worker(script, {
      eval: true,
      stderr: true,
      env: { ...process.env, DB_PATH: dbPath, NODE_ENV: nodeEnv },
    });
    let stderr = '';
    if (worker.stderr) worker.stderr.on('data', (chunk) => { stderr += String(chunk); });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      worker.terminate().then(() => resolve({ ...result, stderr }));
    };
    worker.on('message', (message) => {
      setTimeout(() => finish({ started: message === 'started', error: '' }), 50);
    });
    worker.on('error', (error) => {
      finish({ started: false, error: String(error && error.message ? error.message : error) });
    });
  });
}

test('the application starts on a fresh database and applies every migration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnd-integrity-'));
  const dbPath = path.join(dir, 'app.db');
  try {
    const started = await startApplication(dbPath, 'test');
    assert.equal(started.started, true, started.error);

    const raw = new DatabaseSync(dbPath);
    try {
      const recorded = raw.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map((row) => row.id);
      assert.deepEqual(recorded, ['000_baseline.sql', '010_platform_tables.sql', '011_ingestion_tables.sql']);
      const tables = tableNames(raw);
      for (const table of NEW_TABLES) assert.ok(tables.includes(table), 'missing table ' + table);
    } finally {
      raw.close();
    }
  } finally {
    removeDir(dir);
  }
});

test('a version counter behind a row version refuses startup under NODE_ENV=test', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnd-integrity-'));
  const dbPath = path.join(dir, 'inconsistent.db');
  try {
    const raw = openAppDatabase(dbPath);
    try {
      raw.prepare('INSERT INTO user_state_versions (user_id) VALUES (?)').run('usr_inconsistent');
      raw
        .prepare(
          'INSERT INTO category_rules (rule_id, user_id, match_type, pattern, version) VALUES (?, ?, ?, ?, ?)'
        )
        .run('rul_01', 'usr_inconsistent', 'CONTAINS', 'swiggy', 9);
    } finally {
      raw.close();
    }

    const started = await startApplication(dbPath, 'test');
    assert.equal(started.started, false);
    assert.match(started.error, /VERSION_COUNTER_INCONSISTENT/);
  } finally {
    removeDir(dir);
  }
});

test('the same inconsistent database only warns under NODE_ENV=development', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnd-integrity-'));
  const dbPath = path.join(dir, 'inconsistent-dev.db');
  try {
    const raw = openAppDatabase(dbPath);
    try {
      raw.prepare('INSERT INTO user_state_versions (user_id) VALUES (?)').run('usr_inconsistent');
      raw
        .prepare(
          'INSERT INTO category_rules (rule_id, user_id, match_type, pattern, version) VALUES (?, ?, ?, ?, ?)'
        )
        .run('rul_01', 'usr_inconsistent', 'CONTAINS', 'swiggy', 9);
    } finally {
      raw.close();
    }

    const started = await startApplication(dbPath, 'development');
    assert.equal(started.started, true, started.error);
    assert.match(started.stderr, /VERSION_COUNTER_INCONSISTENT/);
  } finally {
    removeDir(dir);
  }
});
