# WS-FND · Plan 2 — Migrations Framework and Schema Gaps

> **Local plan number: Plan 2 of 6 in WS-FND** · Unique ID: **`WS-FND-P2`** · Branch: `ws-fnd/p2-migrations`

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream | WS-FND |
| Local plan number | **Plan 2** |
| Unique ID | `WS-FND-P2` |
| Owner / subagent | Dev A — Integration Lead / WS-FND subagent |
| Objective | Replace the inline `CREATE TABLE IF NOT EXISTS` block in `backend/src/db.js` with versioned SQL migrations, reproduce today's schema exactly, and add the tables the prototype design needs but `main` lacks (gap G-13) |
| Expected outcome | `db.js` opens the DB, sets pragmas and runs `migrate()`; `000_baseline.sql` = today's schema; `010_*.sql` adds `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `ingestion_batches`, `ingestion_errors`, `rolling_summaries` |
| Size | ~0.5 day; 2 PRs (framework + baseline, new tables) |

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
| `backend/src/db/TABLES.md` | Create | Mapping of Doc 2 §3 logical names → physical names on `main` | WS-FND | Low |
| `backend/test/db/migrate.test.js`, `schema-baseline.test.js` | Create | Tests | WS-FND | Low |

## 5. Interfaces and contracts
- `migrate(rawDb) -> {applied: string[]}`; idempotent; throws `MIGRATION_CHECKSUM_MISMATCH`.
- Migration number ranges (`workstream-assignments.md` §4): `0xx` FND, `1xx` CAT, `2xx` SEN, `3xx` PLT, `4xx` AGT, `5xx` JON. Merged files are immutable.
- **Table-name decision D-PLAN-2 (recommendation, team lead may veto):** keep the physical names on `main` (`transactions_v1`, `goals_v1`, `caps_v1`, `alerts_v1`, `proposals_v1`, `snapshots_v1`, `outbox_events`, `user_state_versions`, `categorization_history`, `user_profiles_v1`, `accounts_v1`, `declared_bills_v1`). Doc 2 §3 names are logical; `TABLES.md` maps them. Renaming is churn with no prototype benefit.
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

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Baseline differs from inline DDL by whitespace only | Compare normalised SQL (collapse whitespace) in the test |
| A module mutates schema at runtime (e.g. `ALTER` in code) | Grep `ALTER TABLE`/`CREATE TABLE` outside `db/`; move into migrations |
| Integrity check too strict for existing dev DBs | Warn-only when `NODE_ENV=development`; strict in test |

## 12. Assumptions and unresolved questions
- [A] D-PLAN-2 (keep physical names). If vetoed, a rename migration is added in WS-FND-P5, not here.
- [A] Immutability of raw transaction fields (S-13) is checked by WS-CAT-P1 against `transactions_v1`; if raw and classified data share one table, CAT adds a trigger blocking updates to raw columns in `1xx`.

## 13. Completion handoff
README template; include `schema_migrations` listing, `TABLES.md`, and next eligible plans **WS-FND-P3, WS-FND-P4, WS-CAT-P2, WS-PLT-P1**.
