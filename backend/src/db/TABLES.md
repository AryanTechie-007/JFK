# Database tables

Schema authority: `docs/prototype-design/02-shared-data-model-and-contracts.md` §3 defines the logical
tables; `backend/src/db/migrations/*.sql` defines the physical schema. This file maps the two and records
every place where the physical schema differs from the logical contract.

Labels used below:

- **[confirmed]** — read directly from the migration files or asserted by a test.
- **[inferred]** — derived by reading code that uses the table or counter; no document states it.
- **[awaiting owner approval]** — a design decision made while implementing WS-FND-P2 that changes or
  extends a shared contract. It is *not* an approved contract until the owner records a decision.
- **[proposed contract]** — what the plan or Doc 2 says, when it differs from what exists.

## How the schema is applied

- `backend/src/db.js` opens the database, sets `journal_mode = WAL`, `foreign_keys = ON` and
  `busy_timeout = 2000` (`db.js:109-111`), then calls `migrate(raw)` from `backend/src/db/migrate.js`
  (`db.js:113-118`).
- `migrate()` applies every `backend/src/db/migrations/*.sql` file in lexical order, exactly once,
  and records `(id, sha-256 checksum, applied_at)` in `schema_migrations`.
- Migration files are immutable once merged. A changed file raises `MIGRATION_CHECKSUM_MISMATCH`; a
  recorded file that disappeared raises `MIGRATION_FILE_MISSING`.
- Number ranges: `0xx` Foundations, `1xx` Categorizer, `2xx` Sentinel, `3xx` Platform,
  `4xx` Agents, `5xx` John. `000` is the frozen baseline and is never edited.
- After migrating, `db.js` runs the startup integrity check: `PRAGMA integrity_check` must return
  `ok` in every environment, and every version counter must be at least the highest row version it
  stamps (development: warning; test and production: hard failure).

### Migration files, in application order [confirmed]

| # | File | sha-256 | Creates |
| --- | --- | --- | --- |
| 1 | `000_baseline.sql` (392 lines) | `f9cf36f87dde6eac31f0ff13b46746187ec184401c0a6ce95f993026dcc5bbb7` | The 27 baseline tables + 3 indexes, verbatim from the pre-migration inline DDL |
| 2 | `010_platform_tables.sql` (95 lines) | `111731fe2b096669281f8a3eb411ed37499dea8aacf51a79fe2d875ff64a9923` | `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `rolling_summaries` + 9 indexes |
| 3 | `011_ingestion_tables.sql` (31 lines) | `e6c59ae8cf6d4ab265abe02641080b494e72726d6fc040cef9ab87b38a6c2e19` | `ingestion_batches`, `ingestion_errors` + 3 indexes |

The runner also creates the metadata table it needs:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

[confirmed] `schema_migrations` is created by `backend/src/db/migrate.js:27-31`, excluded from the
baseline comparison, and asserted by `backend/test/db/schema-baseline.test.js:57-86` (columns, a
64-character checksum, exactly one row).

All three files use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so an existing
database created by the old inline code opens unchanged and only gains the new objects.
`backend/test/db/migrate.test.js:295-321` proves that path.

On a fresh database the ordering above is what an operator will see in `schema_migrations`; because
`000` is a no-op on existing databases, the recorded ids are the same in both cases.

## Baseline tables (migration `000_baseline.sql`, reproduced exactly)

The baseline is the schema the source application created inline in `db.js`. `000_baseline.sql` is
byte-for-byte the same DDL, so existing databases open unchanged
(`backend/test/db/schema-baseline.test.js` pins the exact `sqlite_master` content: 27 tables,
3 indexes, 30 objects).

| Logical table (Doc 2 §3) | Physical table | Notes |
| --- | --- | --- |
| users | users | |
| version_counters | user_state_versions | Physical columns are `ledger_version`, `plan_version`, `profile_version`, `rules_version`. |
| profiles | user_profiles_v1 | |
| accounts | accounts_v1 | |
| declared_bills | declared_bills_v1 | |
| goals | goals_v1 | `goals` also exists as a legacy table and is retired in WS-FND-P5. |
| goal_month_overrides | goal_month_overrides | |
| caps | caps_v1 | |
| cap_month_overrides | cap_month_overrides | |
| proposals | proposals_v1 | |
| action_ledger | action_ledger | |
| confirmation_tokens | confirmation_tokens | |
| alerts | alerts_v1 | |
| snapshots | snapshots_v1 | |
| event_outbox | outbox_events | Same role; logical name `event_outbox`. |
| chat_threads | chat_threads | Also carries a legacy `rolling_summary` column; the authoritative summaries table is `rolling_summaries` — see "Duplicate summary authority". |
| chat_turns | chat_turns | |

Baseline tables with no Doc 2 §3 counterpart (source-application tables kept until WS-FND-P5
decides their fate): `budget_categories`, `transactions`, `upcoming_bills`, `subscriptions`,
`review_items`, `category_rules`, `categorization_history`, `memory_facts`.

Baseline tables carry no `tenant_id` and no `intent_tokens`/`tool_results`/`event_deliveries`
counterpart. Adding `tenant_id` to them is WS-FND-P5 work, not this migration.

## New tables (migrations `010_platform_tables.sql`, `011_ingestion_tables.sql`)

| Logical table (Doc 2 §3) | Physical table | Migration |
| --- | --- | --- |
| tool_results | tool_results | 010 |
| intent_tokens | intent_tokens | 010 |
| event_deliveries | event_deliveries | 010 |
| jobs | jobs | 010 |
| jobs_dead_letter | jobs_dead_letter | 010 |
| traces | traces | 010 |
| rolling_summaries | rolling_summaries | 010 |
| ingestion_batches | ingestion_batches | 011 |
| ingestion_errors | ingestion_errors | 011 |

Every new table carries `tenant_id TEXT NOT NULL DEFAULT 'demo'` (Doc 2 §3, single-tenant
deployment until WS-FND-P5) and every user-scoped table carries `user_id TEXT NOT NULL` with an
index that leads on `user_id`.

## New table inventory (exact) [confirmed]

Read from `010_platform_tables.sql` and `011_ingestion_tables.sql`; structure pinned by
`backend/test/db/migrate.test.js:191-294`. Column order, types, defaults and CHECK constraints are
exactly as below.

### `tool_results` — 010, lines 6-21
`tool_result_id` TEXT PK; `user_id` TEXT NN; `request_id` TEXT NN; `task_id` TEXT (nullable);
`caller` TEXT NN; `function` TEXT NN; `params` TEXT NN (JSON); `params_hash` TEXT NN;
`snapshot_id` TEXT NN; `envelope` TEXT NN (JSON, the `SentinelResult@1`); `created_at` TEXT NN
DEFAULT `datetime('now')`; `tenant_id` TEXT NN DEFAULT `'demo'`.
Indexes: `idx_tool_results_user_request (user_id, request_id)`;
`idx_tool_results_reuse (function, params_hash, snapshot_id)`.

### `intent_tokens` — 010, lines 23-33
`token_hash` TEXT PK (sha-256 of the token, never the token); `user_id` TEXT NN; `action` TEXT NN;
`params_hash` TEXT NN; `origin` TEXT NN; `expires_at` TEXT NN; `used_at` TEXT (nullable);
`tenant_id` TEXT NN DEFAULT `'demo'`. Index: `idx_intent_tokens_user (user_id)`.
Single use is enforced by the Action Service reading/locking `used_at`, not by a constraint.

### `event_deliveries` — 010, lines 35-45
`event_id` TEXT NN; `handler` TEXT NN; `status` TEXT NN DEFAULT `'PENDING'` CHECK IN
(`PENDING`, `DONE`, `FAILED`, `DEAD`); `attempts` INTEGER NN DEFAULT 0; `last_error` TEXT;
`next_attempt_at` TEXT; `tenant_id` TEXT NN DEFAULT `'demo'`; PRIMARY KEY `(event_id, handler)`.
Index: `idx_event_deliveries_pending (status, next_attempt_at)`.

### `jobs` — 010, lines 47-60
`job_id` TEXT PK; `kind` TEXT NN; `user_id` TEXT (nullable — global jobs); `run_at` TEXT NN;
`locked_until` TEXT; `attempts` INTEGER NN DEFAULT 0; `payload_json` TEXT NN DEFAULT `'{}'`;
`status` TEXT NN DEFAULT `'PENDING'` CHECK IN (`PENDING`, `RUNNING`, `DONE`, `FAILED`, `DEAD`);
`created_at` TEXT NN DEFAULT `datetime('now')`; `tenant_id` TEXT NN DEFAULT `'demo'`.
Indexes: `idx_jobs_due (status, run_at)`; `idx_jobs_user (user_id, run_at)`.

### `jobs_dead_letter` — 010, lines 62-70
`job_id` TEXT PK; `kind` TEXT NN; `payload_json` TEXT NN DEFAULT `'{}'`; `last_error` TEXT NN;
`failed_at` TEXT NN DEFAULT `datetime('now')`; `tenant_id` TEXT NN DEFAULT `'demo'`.
Index: `idx_jobs_dead_letter_kind (kind, failed_at)`.

### `traces` — 010, lines 72-85
`trace_id` TEXT NN; `span_id` TEXT NN; `parent_span_id` TEXT; `user_id` TEXT (nullable for
system spans); `component` TEXT NN; `name` TEXT NN; `started_at` TEXT NN; `duration_ms` INTEGER;
`attrs_json` TEXT NN DEFAULT `'{}'`; `tenant_id` TEXT NN DEFAULT `'demo'`; PRIMARY KEY
`(trace_id, span_id)`. Index: `idx_traces_user_started (user_id, started_at)`.

### `rolling_summaries` — 010, lines 87-95
`thread_id` TEXT PK; `user_id` TEXT NN; `summary` TEXT NN CHECK `length(summary) <= 800`;
`through_turn_id` TEXT NN; `updated_at` TEXT NN DEFAULT `datetime('now')`; `tenant_id` TEXT NN
DEFAULT `'demo'`. Index: `idx_rolling_summaries_user (user_id)`.

### `ingestion_batches` — 011, lines 6-20
`batch_id` TEXT PK; `user_id` TEXT NN; `idempotency_key` TEXT NN; `source_format` TEXT NN;
`mapping_profile_id` TEXT; `status` TEXT NN CHECK IN (`PROCESSING`, `COMPLETED`,
`COMPLETED_WITH_ERRORS`, `FAILED`); `counts` TEXT NN DEFAULT `'{}'`; `progress` TEXT NN
DEFAULT `'{}'`; `created_at` TEXT NN DEFAULT `datetime('now')`; `tenant_id` TEXT NN DEFAULT
`'demo'`; UNIQUE `(user_id, idempotency_key)`.
Indexes: `idx_ingestion_batches_user (user_id, created_at)`;
`idx_ingestion_batches_status (status, created_at)`.

### `ingestion_errors` — 011, lines 22-31
`batch_id` TEXT NN; `row_index` INTEGER NN; `code` TEXT NN; `field` TEXT; `detail` TEXT;
`tenant_id` TEXT NN DEFAULT `'demo'`; PRIMARY KEY `(batch_id, row_index, code)`.
Index: `idx_ingestion_errors_batch (batch_id, row_index)`.

Nine tables and twelve indexes in total, all asserted by
`backend/test/db/migrate.test.js:191-201` (names) and `:202-294` (columns, CHECKs, composite keys,
the 800-character bound).

## Differences: this implementation vs WS-FND-P2 §5 vs Doc 2 §3

WS-FND-P2 §5 describes the tables in shorthand; Doc 2 §3 is the frozen logical contract. Where the
three disagree, this is what exists and why. Nothing here is approved by the owner yet.

| Table | WS-FND-P2 §5 says | Doc 2 §3 says | Implemented | Status |
| --- | --- | --- | --- | --- |
| `tool_results` | `params_json`, `result_json`, `status` | `params`, `params_hash`, `snapshot_id`, `envelope` | Doc 2 columns, no `status` (it is inside `envelope`), plus the reuse index | Doc 2 wins; index is an addition **[awaiting owner approval]** |
| `intent_tokens` | `token` PK | `token_hash` PK | `token_hash` (sha-256) | Doc 2 wins; §5's plaintext column would be a security defect **[awaiting owner approval]** |
| `jobs` | `job_id`, `kind`, `user_id`, `run_at`, `locked_until`, `attempts`, `payload_json`, `status` | `job_name` PK, `locked_until`, `last_run_at`, `last_status` | §5 queue shape | §5 wins; **Doc 2 amendment required** **[awaiting owner approval]** |
| `jobs_dead_letter` | `job_id`, `kind`, `payload_json`, `last_error`, `failed_at` | `id`, `source`, `ref`, `error`, `created_at` | §5 shape | §5 wins; **Doc 2 amendment required** **[awaiting owner approval]** |
| `traces` | `span_id` PK | PK `(trace_id, span_id)` | Doc 2 key + `parent_span_id` | Doc 2 wins; `parent_span_id` is an addition for WS-FND-P3 **[awaiting owner approval]** |
| `rolling_summaries` | `summary_text` | `summary` CHECK `<= 800`, `through_turn_id`, `updated_at` | Doc 2 shape + `user_id` | Doc 2 wins; `user_id` is an addition **[awaiting owner approval]** |
| `ingestion_batches` | `source`, `format`, `counts_json`, UNIQUE `(user_id, idempotency_key)` | `source_format`, `mapping_profile_id`, `status` CHECK, `counts`, `progress`, UNIQUE `(tenant_id, idempotency_key)` | Doc 2 columns, UNIQUE `(user_id, idempotency_key)` | mixed; **Doc 2 amendment required for the unique key** **[awaiting owner approval]** |
| `ingestion_errors` | PK `(batch_id, row_index, code)` | PK `(batch_id, row_index)` | §5 key + `field`, `detail` | §5 wins; **Doc 2 amendment required** **[awaiting owner approval]** |

### Recorded deviations from Doc 2 §3 (rationale)

These were decided while implementing WS-FND-P2 and need confirmation in the Doc 2 contract
(`docs/implementation-plan/README.md:80`: contract changes are a first commit plus owner and
consumer approval).

1. `jobs` / `jobs_dead_letter`. Doc 2 §3.5 specifies `jobs(job_name PK, locked_until, last_run_at,
   last_status)` and `jobs_dead_letter(id, source, ref, error, created_at)`. That shape cannot hold
   the queued work the specification needs: SC §13.6 requires a `reconcile_action` queue with
   attempts and `jobs_dead_letter`, and WS-FND-P3 exposes
   `enqueueJob(kind, { userId, runAt, payload })`, which needs one row per queued job with a
   payload and a due time. The physical shape is therefore the §5 queue shape above, plus
   `jobs_dead_letter(job_id PK, kind, payload_json, last_error, failed_at)`.
2. `tool_results`. Doc 2 §3.5 columns are kept exactly; there is deliberately no separate `status`
   column, because `status` is part of the `SentinelResult@1` envelope (SC §10.2) and
   `params_hash` is what makes identical-call reuse possible (SC §10.3). The
   `(function, params_hash, snapshot_id)` index exists so that reuse lookup is an index seek.
3. `traces`. Doc 2 §3.5's primary key `(trace_id, span_id)` is used, plus `parent_span_id` because
   WS-FND-P3's span context is `{ traceId, userId, parentSpanId }`. Attributes are stored as
   `attrs_json`.
4. `rolling_summaries`. `summary` keeps Doc 2's `CHECK (length(summary) <= 800)`; `through_turn_id`
   and `updated_at` are `NOT NULL`. `user_id` is added so the table is user-scoped like every other
   user-owned table.
5. `intent_tokens`. The primary key is `token_hash` (SHA-256), never a plaintext token: tokens are
   single-use bearer capabilities (WS-PLT-P1). `params_hash`, `origin`, `expires_at` and `used_at`
   follow Doc 2 §3.4.
6. `ingestion_batches`. Columns follow Doc 2 §3.3 and the uniqueness constraint is
   `UNIQUE (user_id, idempotency_key)`, which is what the ingestion flow de-duplicates on
   (WS-CAT-P2). "Per tenant" and "per user" are the same predicate while `tenant_id` is the
   constant `'demo'`; the user-scoped key is the one a consumer can actually pass.
7. `ingestion_errors`. Primary key is `(batch_id, row_index, code)` rather than Doc 2's
   `(batch_id, row_index)`, because one row can fail several validations and each failure code must
   be storable. `field` and `detail` localise the failure; the batch is referenced by `batch_id`.

## Approval status of the new schema [awaiting owner approval]

Confirmed by tests: existence of all nine tables and twelve indexes, the column set of every new
table, the CHECK constraints, the composite primary keys, the `UNIQUE (user_id, idempotency_key)`
constraint and the 800-character bound (`backend/test/db/migrate.test.js:191-294`).

Not approved by anyone yet — the owner must record a decision before a consumer builds against them:

1. the `jobs` / `jobs_dead_letter` shape and the Doc 2 §3.5 amendment;
2. `ingestion_batches` unique-key semantics (`user_id` vs `tenant_id`);
3. `ingestion_errors` primary key (`(batch_id, row_index, code)` vs two columns);
4. `intent_tokens.token_hash` in place of §5's plaintext `token`;
5. the `parent_span_id` and `user_id` additions to `traces` / `rolling_summaries`;
6. the reuse index on `tool_results`.

Consumers and what they need settled: WS-FND-P3 (`tool_results`, `event_deliveries`, `jobs`,
`jobs_dead_letter`, `traces`), WS-PLT-P1 (`intent_tokens`, `confirmation_tokens`), WS-CAT-P2
(`ingestion_batches`, `ingestion_errors`), WS-JON (`rolling_summaries`, `chat_*`), WS-SEN-P1/P2
(`tool_results` / `snapshots` via the gateway).

## Version counters and row versions

`user_state_versions` holds the monotonic counters (Doc 2 §3.6: counters only increase):
`ledger_version`, `plan_version`, `profile_version`, `rules_version`. The startup integrity check
compares them against the row versions that exist in this schema:

| Counter | Row versions compared |
| --- | --- |
| ledger_version | `transactions_v1.categorized_version`, `categorization_history.version` |
| plan_version | `goals_v1.version`, `caps_v1.version` |
| profile_version | `user_profiles_v1.version`, `declared_bills_v1.version` |
| rules_version | `category_rules.version` |

The mapping is **[inferred]**, not documented: it comes from the code that bumps each pair —
`backend/src/engines/categorizer/index.js:56-88` (ledger counter with the categorization write),
`backend/src/platform/snapshot.js:93-104` (snapshot reads all counters), and the paired increments in
`backend/src/platform/action-service.js` (`goals_v1`/`caps_v1` version with `plan_version`,
`user_profiles_v1` version with `profile_version`, `category_rules.version` with `rules_version`).
No document states the mapping. Two consequences are worth knowing:

- `transactions_v1.categorized_version` is a ledger *stamp*, not a revision of the row itself; the
  check uses `MAX(…)` of it, which is the strongest available proxy.
- Some writers update a row without bumping its counter (for example
  `backend/src/platform/profile.js:99-108`, `124-135`). That is harmless for a "counter ≥ row
  version" check but means the counter is not a change log.

`balance_version` and `categorization_version` (Doc 2 §3.1) have no physical counter or row version
in the source baseline; `balance_version` is introduced by the profile/balance workstream, and the
integrity check cannot verify either of them today. **[awaiting owner approval]**

## Duplicate summary authority

Two tables can hold a thread summary: `chat_threads.rolling_summary` (baseline, TEXT NOT NULL
DEFAULT `''`) and the new `rolling_summaries` (one row per thread, 800-character bound,
`through_turn_id`). Nothing keeps them in sync and no document says which one wins. Until WS-JON
picks one, treat `rolling_summaries` as the target shape and `chat_threads.rolling_summary` as
legacy to be dropped in WS-FND-P5. **[awaiting owner approval]** (owner: WS-JON plan owner with
WS-FND.)

## Known limitations

- **SQL-only migrations.** `migrate.js` applies `*.sql` files in lexical order; WS-FND-P2 §7's
  "guarded `ALTER TABLE … ADD COLUMN` written in JavaScript" is not implemented. Any consumer that
  needs a conditional column change needs a numbered migration with SQL that is safe on both old and
  new databases (`IF NOT EXISTS` where SQLite allows it), or a plan change to add `.js` migrations.
- **Immutable files.** Editing a merged migration aborts startup on every database that already
  recorded it (`MIGRATION_CHECKSUM_MISMATCH`). Fix a mistake with a new numbered migration.
- **Baseline golden schema lives in a test.** WS-FND-P2 §6 step 1 named
  `backend/test/fixtures/fnd/schema-before.json`; that path is outside the plan's file table, so the
  30-object dump is the `BASELINE_SCHEMA` literal in
  `backend/test/db/schema-baseline.test.js:28`. There is no JSON fixture on disk to diff against.
- **No data migration.** New tables start empty; nothing backfills them from the legacy tables.
- **No `balance_version`.** See "Version counters and row versions".
- **Tenant column is a constant.** `tenant_id` exists on the new tables but is always `'demo'`; the
  baseline tables have no `tenant_id` at all (WS-FND-P5).
