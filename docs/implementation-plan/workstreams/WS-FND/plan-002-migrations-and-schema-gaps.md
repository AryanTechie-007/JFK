# WS-FND · Plan 2 — Migrations Framework and Schema Gaps

> **Local plan number: Plan 2 of 6 in WS-FND** · Unique ID: **`WS-FND-P2`** · Branch: `ws-fnd/p2-migrations`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream | WS-FND |
| Local plan number | **Plan 2** |
| Unique ID | `WS-FND-P2` |
| Owner / subagent | Dev A — Integration Lead / WS-FND subagent |
| Objective | Replace the inline `CREATE TABLE IF NOT EXISTS` block in `backend/src/db.js` with versioned SQL migrations, reproduce today's schema exactly, and add the tables the prototype design needs but the source baseline lacks (gap G-13) |
| Expected outcome | `db.js` opens the DB, sets pragmas and runs `migrate()`; `000_baseline.sql` = today's schema; `010_*.sql` adds `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `ingestion_batches`, `ingestion_errors`, `rolling_summaries` |
| Size | ~0.5 day; one PR with two commits (framework + baseline, new tables) |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P1 | Temp-DB harness, CI | No |

**Parallel with:** WS-CAT-P1, WS-SEN-P1, WS-UI-P1.
**Unblocks:** WS-FND-P3, WS-FND-P4, WS-CAT-P2 (ingestion tables), WS-PLT-P1 (`intent_tokens`).

## 3. Scope
**In:** migration runner; baseline migration; new tables with CHECK constraints and indexes per Doc 2 §3.5/§3.3; `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=2000`; startup integrity check (S-14); table-name mapping decision.
**Out:** dropping legacy tables (WS-FND-P5); renaming existing `_v1` tables; any data migration of user rows.

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/db.js` | Modify | Keep the exported wrapper API unchanged; replace inline DDL with `require('./db/migrate').migrate(raw)` | WS-FND | **High** — every module imports it; API must not change |
| `backend/src/db/migrate.js` | Create | Reads `db/migrations/*.sql` in lexical order; `schema_migrations(id TEXT PK, applied_at)`; each file in one transaction; refuses if a recorded file's checksum changed | WS-FND | Low |
| `backend/src/db/migrations/000_baseline.sql` | Create | Exact DDL currently in `db.js` (legacy + v1 tables, indexes) | WS-FND | Low |
| `backend/src/db/migrations/010_platform_tables.sql` | Create | `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `rolling_summaries` | WS-FND | Low |
| `backend/src/db/migrations/011_ingestion_tables.sql` | Create | `ingestion_batches`, `ingestion_errors` | WS-FND (CAT reviews) | Low |
| `backend/src/db/TABLES.md` | Create | Mapping of Doc 2 §3 logical names → physical names in the source baseline | WS-FND | Low |
| `backend/test/db/migrate.test.js`, `schema-baseline.test.js` | Create | Tests | WS-FND | Low |

## 5. Interfaces and contracts
- `migrate(rawDb) -> {applied: string[]}`; idempotent; throws `MIGRATION_CHECKSUM_MISMATCH`.
- Migration number ranges (`workstream-assignments.md` §4): `0xx` FND, `1xx` CAT, `2xx` SEN, `3xx` PLT, `4xx` AGT, `5xx` JON. Merged files are immutable.
- **Table-name decision D-PLAN-2 (recommendation, team lead may veto):** keep the physical names of the source baseline (`transactions_v1`, `goals_v1`, `caps_v1`, `alerts_v1`, `proposals_v1`, `snapshots_v1`, `outbox_events`, `user_state_versions`, `categorization_history`, `user_profiles_v1`, `accounts_v1`, `declared_bills_v1`). Doc 2 §3 names are logical; `TABLES.md` maps them. Renaming is churn with no prototype benefit.
- New-table DDL (columns from Doc 2 §3.5; every user table has `user_id TEXT NOT NULL`, `tenant_id TEXT NOT NULL DEFAULT 'demo'`):
  - `tool_results(tool_result_id PK, user_id, request_id, caller, function, snapshot_id, params_json, result_json, status, created_at)`; index `(user_id, request_id)`.
  - `intent_tokens(token PK, user_id, action, params_hash, origin, expires_at, used_at)`.
  - `event_deliveries(event_id, handler, status CHECK IN ('PENDING','DONE','FAILED','DEAD'), attempts, next_attempt_at, last_error, PRIMARY KEY(event_id, handler))`.
  - `jobs(job_id PK, kind, user_id, run_at, locked_until, attempts, payload_json, status)`; `jobs_dead_letter(job_id PK, kind, payload_json, last_error, failed_at)`.
  - `traces(trace_id, span_id PK, parent_span_id, user_id, component, name, started_at, duration_ms, attrs_json)`.
  - `ingestion_batches(batch_id PK, user_id, source, format, idempotency_key, status, counts_json, created_at, UNIQUE(user_id, idempotency_key))`; `ingestion_errors(batch_id, row_index, code, detail, PRIMARY KEY(batch_id,row_index,code))`.
  - `rolling_summaries(thread_id PK, user_id, summary_text, through_turn_id, updated_at)`.

## 6. Implementation steps
1. Dump today's schema: run the old `db.js` against an empty temp DB and capture `SELECT type,name,sql FROM sqlite_master ORDER BY name` to `backend/test/fixtures/fnd/schema-before.json`.
2. Write `000_baseline.sql` by extracting the DDL strings from `db.js` verbatim (keep `IF NOT EXISTS` so existing developer DBs migrate cleanly).
3. Implement `migrate.js` (sha-256 checksum per file stored in `schema_migrations`).
4. Change `db.js`: open DB, pragmas, `migrate(raw)`, keep every exported method and the default export identical.
5. `schema-baseline.test.js`: fresh temp DB after `000` only → `sqlite_master` equals `schema-before.json`.
6. Existing-DB test: create a DB with the old inline code (fixture), then run `migrate` → no error, `000` recorded, no table altered.
7. Add `010` and `011` with constraints and indexes; test each table accepts a valid row and rejects a CHECK violation.
8. Startup integrity check in `db.js`: `PRAGMA integrity_check` must return `ok`; for each user, `user_state_versions` counters ≥ max stored row versions (log + refuse start in non-test env if violated).
9. Write `TABLES.md`; run full suite; handoff.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Developer DB created by older code with extra/missing columns | `000` uses `IF NOT EXISTS`; columns added later only by new numbered migrations with `ALTER TABLE … ADD COLUMN` guarded by a `pragma table_info` check in JS (migrate supports `.js` migrations for this) |
| Someone edits a merged migration | Checksum mismatch → startup fails with file name |
| Two workstreams add migrations same day | Ranges prevent filename collisions; order across ranges is deterministic |
| Migration fails midway | Per-file transaction → rolled back; `schema_migrations` not updated |
| WAL files left by tests | Temp dir cleanup removes `-wal`/`-shm` |

## 8. Constraints
- `db.js` public API unchanged; no module outside WS-FND changes in this plan.
- No legacy table dropped here. No data rewritten.
- SQL stays SQLite-dialect; no ORM.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/db/migrate.test.js` (order, idempotency, checksum, rollback) | `npm --prefix backend test` |
| `test/db/schema-baseline.test.js` (exact match) | same |
| `test/db/new-tables.test.js` (constraints, unique keys) | same |
| Full regression incl. `legacy-v1-specs.test.js` | same |

## 10. Acceptance criteria
**Plan:** schema-baseline test exact; all new tables present with constraints; existing tests green; integrity check runs at startup.
**Workstream:** single schema authority established for WS-FND-P3/P4/P5.
**Integration:** G2 item "Migration `000_baseline.sql` reproduces today's schema exactly".

**Recorded outcome (2026-10-17):** the plan and workstream criteria are met on the branch and the integration criterion is met by the baseline test, but nothing is merged — see §14.6 for commands and results and §14.10 for the remaining risks.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Baseline differs from inline DDL by whitespace only | Compare normalised SQL (collapse whitespace) in the test |
| A module mutates schema at runtime (e.g. `ALTER` in code) | Grep `ALTER TABLE`/`CREATE TABLE` outside `db/`; move into migrations |
| Integrity check too strict for existing dev DBs | Warn-only when `NODE_ENV=development`; strict in test |

**Recorded outcome (2026-10-17):** no whitespace normalisation was needed (the comparison is byte-exact); no runtime DDL remains outside the migration files — the only `CREATE` statement elsewhere is the runner's own `schema_migrations` table at `backend/src/db/migrate.js:27` (plus comments at `backend/src/db.js:115-117`); the integrity policy was implemented as warn-in-development and throw-in-test/production, which leaves §6 step 8's "refuse start in non-test env" and this row's development wording as an open owner decision (§14.8 item 2).

## 12. Assumptions and unresolved questions
- [A] D-PLAN-2 (keep physical names). If vetoed, a rename migration is added in WS-FND-P5, not here.
- [A] Immutability of raw transaction fields (S-13) is checked by WS-CAT-P1 against `transactions_v1`; if raw and classified data share one table, CAT adds a trigger blocking updates to raw columns in `1xx`.

## 13. Completion handoff
README template; include `schema_migrations` listing, `TABLES.md`, and next eligible plans **WS-FND-P3, WS-FND-P4, WS-CAT-P2, WS-PLT-P1**.

> **Outcome (2026-10-17):** **Complete** — merged by the plan owner; see §14.

## 14. Implementation outcome (recorded 2026-10-17)

**Status of this plan:** **Complete (2026-10-17)** — merged by the plan owner. Branch `ws-fnd/p2-migrations` head `01383eb` (`0a8b1c9` runner + `000_baseline.sql`, `cc762b0` platform and ingestion tables, `01383eb` cross-platform baseline-test fix), pushed to `origin`. Two record items are outstanding rather than verified here: the merge commit / PR link, and the CI run on `main` after the merge — local `origin/main` still reads `10bcba8` and this session cannot fetch (`schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`). Record both when known, the same way WS-FND-P1 does. Sections §1–§13 above are unchanged requirements; this section records what was actually built, including where it deviates.

### 14.1 §6 steps → outcome
| §6 step | Outcome | Evidence |
| --- | --- | --- |
| 1. Dump today's schema | Captured by requiring the pre-change `backend/src/db.js` against an empty temp DB: 27 tables + 3 indexes = 30 `sqlite_master` objects. Stored **inside the test**, not at the fixture path (14.7). | `backend/test/db/schema-baseline.test.js:28` (`BASELINE_SCHEMA`) |
| 2. `000_baseline.sql` | The old inline `db.exec` template copied verbatim, `IF NOT EXISTS` kept, plus a UTF-8 header comment. 392 lines. | `backend/src/db/migrations/000_baseline.sql` |
| 3. `migrate.js` | Runner with per-file sha-256 recording, lexical order, per-file transaction, rollback, checksum and missing-file guards. 115 lines. | `backend/src/db/migrate.js` |
| 4. `db.js` | Opens the DB, sets WAL / `foreign_keys` / `busy_timeout = 2000`, calls `migrate(raw)`, then runs the startup integrity check; wrapper classes, `Db` methods and `module.exports = db` unchanged. 224 lines. | `backend/src/db.js:107-224` |
| 5. `schema-baseline.test.js` | Baseline-only temp directory, application-schema dump excluding `sqlite_%` and `tbl_name = 'schema_migrations'`, deep-equal against the captured dump; a second test pins the metadata table. | `backend/test/db/schema-baseline.test.js:30-86` |
| 6. Existing-DB test | Executes `000_baseline.sql` directly, snapshots `sqlite_master`, runs `runMigrations`, asserts pre-existing objects are unchanged and `010`/`011` applied. | `backend/test/db/migrate.test.js:295-321` |
| 7. `010` + `011` | Nine tables, twelve indexes, CHECK / UNIQUE / composite-PK constraints (inventory in 14.5). | `010_platform_tables.sql` (95 lines), `011_ingestion_tables.sql` (31 lines) |
| 8. Startup integrity check | `PRAGMA integrity_check` must return exactly `ok` in every environment; per-user counter vs maximum row version comparison, environment-dependent handling (14.4). | `backend/src/db.js:120-222`; tests `migrate.test.js:371-438` |
| 9. `TABLES.md`, full suite, handoff | `TABLES.md` written and extended with the table inventory; suite green (14.6); handoff recorded in `tracking/state/WS-FND.md`. | `backend/src/db/TABLES.md` |

### 14.2 Baseline comparison method and evidence
The pre-change `db.js` was executed once against a fresh temp DB and the query `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name` was captured (30 objects). The test re-runs that query on a database whose only applied migration is `000_baseline.sql` (the file is written alone into a temp directory by `baselineOnlyDir()`, with line endings canonicalised to LF) and compares with `assert.deepEqual` against the literal array — **no whitespace normalisation inside the statements**, so any byte-level difference in a `sql` string fails. Commit `01383eb` made this deterministic across checkouts: `BASELINE_SCHEMA` and the executed copy are both LF, because `core.autocrlf=true` on Windows otherwise put `\r\n` into `sqlite_master` and all 27 multi-line tables differed only by line endings. Strength is unchanged — mutating `PRIMARY KEY`→`UNIQUE` and widening a two-space indent to four both still fail the assertion. The comparison also excludes `tbl_name = 'schema_migrations'` (created by the runner, absent from the baseline) and asserts the excluded objects are exactly `schema_migrations` plus its autoindex. This is stricter than §11's "collapse whitespace" mitigation.

### 14.3 Migration runner behaviour (as implemented)
- Order: every `*.sql` under `backend/src/db/migrations/`, sorted by an explicit lexical comparator (`migrate.js:37-43`); a missing directory yields an empty list.
- Metadata: `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))` (`migrate.js:27-31`). §5 wrote only `schema_migrations(id TEXT PK, applied_at)`; the `checksum` column is required by §6 step 3.
- Checksum: lowercase hex sha-256 of the UTF-8 file text (`migrate.js:33-35`).
- Transactions: `BEGIN IMMEDIATE` … `COMMIT` per file, `ROLLBACK` on error, the row is inserted only after the statements succeed (`migrate.js:94-104`); a rollback failure is swallowed so the original error surfaces (`migrate.js:50-57`).
- Refusals: `MIGRATION_CHECKSUM_MISMATCH` when a recorded file's content changed (`migrate.js:85-92`); `MIGRATION_FILE_MISSING` when a recorded id has no file (`migrate.js:69-78`) — the second guard is **not** in this plan, but without it a deleted migration would be silently skipped on existing databases and re-applied on new ones.
- Interface: `migrate(rawDb) -> { applied: string[] }`; `runMigrations(raw, dir)` is the directory seam the tests use; `sha256` and `MIGRATIONS_DIR` are also exported (`migrate.js:59-115`).

### 14.4 Startup integrity check behaviour (as implemented)
- `PRAGMA integrity_check` must return a single row equal to `'ok'`; anything else, including a `PRAGMA` error, raises `STARTUP_INTEGRITY_CHECK_FAILED` in **every** environment (`db.js:166-180`).
- The counter check reads every row of `user_state_versions` and compares each counter with the maximum row version it stamps, treating missing/NULL as 0 (`db.js:182-208`).
- Environment policy (`db.js:160-164`, `210-220`): `development` (also the default for unset or unrecognised `NODE_ENV`) logs `[db] VERSION_COUNTER_INCONSISTENT: … (development: continuing)` and continues; `test` throws; `production` writes the same message to stderr via `console.error` and throws.
- The check runs at module load (`db.js:222`), so it runs for every importer including tests, and it throws rather than calling `process.exit` because test files require `db.js` at import time.
- Tested three ways (`migrate.test.js:371-438`, each starting the real module in a worker thread with an `env` override): a fresh database starts and records all three migrations; an inconsistent database refuses under `NODE_ENV=test`; the same database only warns under `NODE_ENV=development`.

### 14.5 Schema inventory added (exact)
`010_platform_tables.sql`: `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `rolling_summaries`.
`011_ingestion_tables.sql`: `ingestion_batches`, `ingestion_errors`.
Indexes (12): `idx_tool_results_user_request`, `idx_tool_results_reuse`, `idx_intent_tokens_user`, `idx_event_deliveries_pending`, `idx_jobs_due`, `idx_jobs_user`, `idx_jobs_dead_letter_kind`, `idx_traces_user_started`, `idx_rolling_summaries_user`, `idx_ingestion_batches_user`, `idx_ingestion_batches_status`, `idx_ingestion_errors_batch`.
Column-level definitions, CHECK constraints, primary keys and unique constraints are listed in `backend/src/db/TABLES.md`, section "New table inventory", and asserted at `migrate.test.js:191-294`.

### 14.6 Test results
| Command | Result | Note |
| --- | --- | --- |
| `npm --prefix backend test` | 30 tests, 30 pass, 0 fail | Full-filesystem run, **before** the three startup-integrity tests existed. This command cannot be re-run in the restricted sandbox: the runner spawns one process per file and the sandbox denies it. Re-verified 2026-10-17: `5 tests, 0 pass, 5 fail`, every failure `Error: spawn EPERM` at the spawn step — one failed process per test file, no test body executed, so this is an execution-environment result, not a product-code failure. |
| `node --test --test-isolation=none test/temp-db.test.js test/routes-inventory.test.js test/legacy-v1-specs.test.js test/db/migrate.test.js test/db/schema-baseline.test.js` (from `backend/`) | 33 tests, 33 pass, 0 fail, exit 0 | Verified 2026-10-17. Same five files and assertions as §9, run in one runner process without per-file process isolation. |
| The same five files, one `node --test --test-isolation=none <file>` each | 4/4, 4/4, 7/7, 16/16, 2/2 | Per-file confirmation of the 33 total. |
| `node backend/test-v1-specs.js` with a temp `DB_PATH` | ALL SPECIFICATION VERIFICATION TESTS PASSED! (exit 0) | Verified 2026-10-17. |
| `npx oxlint` | 152 warnings, 0 errors, exit 0 | Non-blocking, per the WS-FND-P1 CI convention. |
| `npm run build` | passes with full filesystem access (built in 1.42s); **fails in the restricted sandbox** | Sandbox failure is `failed to load config from … vite.config.js` / `[plugin externalize-deps] Error: spawn EPERM` inside vite's `optimizeSafeRealPathSync`. It is an execution-environment restriction, not a product-code failure: this plan changes no file under `src/` or `vite.config.js`. |

New test files: `backend/test/db/migrate.test.js` (16 tests) and `backend/test/db/schema-baseline.test.js` (2 tests). §9 names a third, `test/db/new-tables.test.js`, which §4 does not list; its constraint tests were folded into `migrate.test.js`.

### 14.7 Deviations from this plan and from Doc 2 §3
| Item | §5 / Doc 2 wrote | Implemented | Status |
| --- | --- | --- | --- |
| `tool_results` | §5: `params_json, result_json, status`; Doc 2 §3.5: `params, params_hash, snapshot_id, envelope` | Doc 2 columns, **no** `status` (status is part of the `SentinelResult@1` envelope, SC §10.2); extra index `(function, params_hash, snapshot_id)` for SC §10.3 reuse | Doc 2 verified; the index is an addition |
| `intent_tokens` | §5: `token PK` | `token_hash TEXT PRIMARY KEY` (sha-256), no plaintext column | Doc 2 §3.4 + WS-PLT-P1 verified; **differs from §5 on a security boundary — owner approval required** |
| `jobs` / `jobs_dead_letter` | §5: job-queue shape; Doc 2 §3.5: `job_name`/`last_run_at`/`last_status`, `jobs_dead_letter(id, source, ref, error, created_at)` | §5 queue shape (`job_id PK, kind, user_id, run_at, locked_until, attempts, payload_json, status`) and `jobs_dead_letter(job_id PK, kind, payload_json, last_error, failed_at)` | **Doc 2 amendment and owner approval required** |
| `traces` | §5: `span_id PK`; Doc 2: `PK(trace_id, span_id)` | `PK(trace_id, span_id)` + `parent_span_id` | Doc 2 verified for the key; `parent_span_id` comes from WS-FND-P3 |
| `rolling_summaries` | §5: `summary_text` | `summary` with `CHECK (length(summary) <= 800)`, `through_turn_id`/`updated_at` `NOT NULL` | Doc 2 §3.5 verified |
| `ingestion_batches` / `ingestion_errors` | §5: `source, format, counts_json`, `UNIQUE(user_id, idempotency_key)`; Doc 2: `UNIQUE(tenant_id, idempotency_key)`, `PK(batch_id, row_index)` | Doc 2 columns, `UNIQUE(user_id, idempotency_key)`, `PK(batch_id, row_index, code)` + `field`/`detail` | **Doc 2 amendment required for both keys; owner approval required** |

Other recorded deviations:
- §6 step 1's fixture path `backend/test/fixtures/fnd/schema-before.json` is outside §4's file table, so the golden dump is embedded in `schema-baseline.test.js:28` with a header comment at `:6-13`. **Owner approval required** for the artifact-path deviation.
- §7's ".js migration" support (guarded `ALTER TABLE … ADD COLUMN`) is **not implemented**; the runner applies `.sql` files only. **Owner decision required** if a consumer needs it before merge.
- `tenant_id TEXT NOT NULL DEFAULT 'demo'` was added to all nine new tables (Doc 2 §3); baseline tables still lack it (out of scope until WS-FND-P5).
- `busy_timeout = 2000` was added (`db.js:111`), which §3 requires and the baseline lacked.

### 14.8 Owner decisions required before consumers rely on the affected contracts
1. **Counter-to-row-version mapping** (§6 step 8): `ledger_version` ↔ `transactions_v1.categorized_version` + `categorization_history.version`; `plan_version` ↔ `goals_v1.version` + `caps_v1.version`; `profile_version` ↔ `user_profiles_v1.version` + `declared_bills_v1.version`; `rules_version` ↔ `category_rules.version`. Derived by inspecting `backend/src/engines/categorizer/index.js:56-88`, `backend/src/platform/snapshot.js:93-104` and the version-bump pairs in `backend/src/platform/action-service.js`; **documented nowhere**. Doc 2 §3.1 instead names `categorization_version` and `balance_version`, neither of which exists in the baseline.
2. **Startup behaviour for inconsistent counters** (§6 step 8 vs §11): §11 says warn-only in development and strict in test; §6 says "log + refuse start in non-test env". Implemented warn in development, throw in test, throw in production; unset `NODE_ENV` is treated as development. **Owner approval required** for the production half and the default.
3. **`intent_tokens.token_hash`** vs §5's plaintext `token` — security boundary; WS-PLT-P1 is the consumer and has not reviewed the table.
4. **`jobs` / `jobs_dead_letter`** shape and the Doc 2 §3.5 amendment; consumers WS-FND-P3 (queue + dead letter) and SC §13.6.
5. **`ingestion_batches` uniqueness** — `UNIQUE(user_id, idempotency_key)` vs Doc 2's `UNIQUE(tenant_id, idempotency_key)`; consumer WS-CAT-P2.
6. **`ingestion_errors` primary key** — `(batch_id, row_index, code)` vs Doc 2's `(batch_id, row_index)`; consumer WS-CAT-P2.
7. **Embedded schema fixture** vs the §6 step 1 path — owner approval for the deviation, or a follow-up commit adding the fixture.
8. **JavaScript migrations** — required before merge, or deferred to WS-FND-P3.
9. **Duplicate summary authority** — `chat_threads.rolling_summary` (baseline) and `rolling_summaries` (new) both exist; WS-JON must choose one and WS-FND-P5 must delete the other.

### 14.9 Known limitations
- `.sql` migrations only; no `.js` migration support (§7).
- No `balance_version` counter (Doc 2 §3.1) in the schema, so the integrity check cannot verify it.
- The golden baseline schema lives inside a test file, not at the planned fixture path.
- Two rolling-summary authorities exist until WS-JON/WS-FND-P5 resolves them.

### 14.10 Risks (observed, not hypothetical)
- The nine new tables are shared schema consumed by WS-FND-P3, WS-PLT-P1, WS-CAT-P2 and WS-JON; none has reviewed the shape, so a mismatch surfaces at runtime rather than at build time.
- The counter mapping is inferred from call sites; a write path that bumps a row version without its counter (for example `backend/src/platform/profile.js:99-108`, `124-135`) is not detected, and a production throw on a legacy developer database blocks startup until counters are repaired.
- Merged migration files are immutable: any later edit to `000`/`010`/`011` aborts startup on every existing database with `MIGRATION_CHECKSUM_MISMATCH`.
- Local `main` is at `8e8521a` while `origin/main` is `10bcba8`; the PR must target `origin/main` so the diff stays at the eight P2 files.

### 14.11 Integration instructions for consumers
Migrations run automatically at module load of `backend/src/db.js`; nothing is run by hand. On first start against any database `schema_migrations` records, in this order, with these checksums:

| id | sha-256 |
| --- | --- |
| `000_baseline.sql` | `f9cf36f87dde6eac31f0ff13b46746187ec184401c0a6ce95f993026dcc5bbb7` |
| `010_platform_tables.sql` | `111731fe2b096669281f8a3eb411ed37499dea8aacf51a79fe2d875ff64a9923` |
| `011_ingestion_tables.sql` | `e6c59ae8cf6d4ab265abe02641080b494e72726d6fc040cef9ab87b38a6c2e19` |

Existing databases upgrade in place (`000` is `IF NOT EXISTS` and a no-op; `010`/`011` create the new objects). New migrations take the next free number in the author's range. No environment variable, seed step or route changes; the route inventory is unchanged (25 routes, `routes-inventory.test.js` 4/4). Read `backend/src/db/TABLES.md` before writing queries against the new tables.
