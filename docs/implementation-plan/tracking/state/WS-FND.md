# Execution State — WS-FND (Foundations, Tooling & Integration)

Fed to every new coding session for this workstream (Template A `[STATE FILE]`). Keep it short and factual; append, do not rewrite history.

| Field | Value |
| --- | --- |
| Developer | Dev A — Abhilash (@Falterred) |
| Branch prefix | `ws-fnd/p<n>-<slug>` |
| Current plan | WS-FND-P2 — **Complete** (2026-10-17); next: WS-FND-P3 |

## 1. Sequence overview
| Local | Plan ID | Title | Objective (short) | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| Plan 1 | WS-FND-P1 | Baseline, Guardrails and Route Split | Give every other workstream a safe place to work: specs and design on `main` (done at initialisation), a real test runner on temporary databases, CI, CODEOWNERS, and one route file per domain… | A-ARCH, C-1 | Complete |
| Plan 2 | WS-FND-P2 | Migrations Framework and Schema Gaps | Replace the inline `CREATE TABLE IF NOT EXISTS` block in `backend/src/db.js` with versioned SQL migrations, reproduce today's schema exactly, and add the tables the… | WS-FND-P1 | Complete |
| Plan 3 | WS-FND-P3 | Event Dispatcher, Tool-Result Store, Traces and LLM Adapter | Build the shared plumbing every component needs and the source baseline lacks: outbox event append + dispatcher with retries and dead letter (G-3), persistent tool results with… | C-1, U-2, WS-FND-P2 | Blocked |
| Plan 4 | WS-FND-P4 | Demo Dataset and Seed | Produce the labelled synthetic dataset and a one-command reset so every demo, golden test and E2E run starts from identical, independently verified state (prototype… | WS-CAT-P2, WS-FND-P2, WS-PLT-P1 | Blocked |
| Plan 5 | WS-FND-P5 | Legacy Retirement and Single-Server Desktop | Make the prototype one server and one database (ADR-01, P-AC-01): delete Backend B, legacy REST routes, the Gemini coach route, legacy tables and sync code, and the… | WS-CAT-P2, WS-FND-P3, WS-JON-P1, WS-PLT-P1, WS-UI-P1, WS-UI-P2, WS-UI-P3 | Blocked |
| Plan 6 | WS-FND-P6 | End-to-End Suites and Acceptance Run | Prove the integrated prototype: demo-journey E2E on the fake provider, security suite S-1…S-16, failure injection, restart persistence, live-model suite (Qwen from D3, or stand-in)… | WS-AGT-P2, WS-AGT-P3, WS-CAT-P3, WS-FND-P4, WS-FND-P5, WS-JON-P2, WS-PLT-P2, WS-SEN-P2, WS-UI-P2, WS-UI-P3 | Blocked |

Plan files: `docs/implementation-plan/workstreams/WS-FND/`. Status of record: `tracking/STATUS.md`.

## 2. Interfaces this workstream consumes / produces
See the rows naming WS-FND in `cross-workstream-dependencies.md`. Record here the merged contract files as they land:
- (none merged yet — WS-FND-P1 produces no shared contract files; its test helpers `setupTempDb()`, `loadApp()`, `signup()`, `createUser()` and `authed()` are the frozen harness other workstreams test against)
- WS-FND-P2 (merged 2026-10-17) adds the migration interface `migrate(rawDb) -> { applied: string[] }` +
  `runMigrations(raw, dir)`, the metadata table `schema_migrations`, the numbering ranges, and nine new tables —
  `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `rolling_summaries`,
  `ingestion_batches`, `ingestion_errors`. Six of those definitions are **not approved contracts** (see
  `backend/src/db/TABLES.md` §“Approval status” and plan §14.8).

## 3. Decisions and assumptions in force
- **Source-baseline import (D-PLAN-3): resolved 2026-10-16** — import commit `645355c` is merged into `main` (PR #1), so this sequence is no longer blocked (`../../../repository-migration-notes.md` §5).
- Decisions of 2026-10-13 in `baseline.md` §6: LLM agents with deterministic fallback; aim Tier 3, fall back to Tier 2 (checkpoint end of D5); one plan = one branch = one PR (contract commit first, Draft PR, merge commit); SC action names + aliases; keep table names; keep existing deferred actions only; LLM consent off by default; stub after half a day late; Qwen details on D3, stand-in provider if unavailable.

## 4. Handoff log (append Template E summaries, newest last)

### WS-FND-P1 — Baseline, Guardrails and Route Split — Complete 2026-10-16
- Branch `ws-fnd/p1-baseline-guardrails-route-split`, PR merged; commits `5d8a807` (helpers),
  `32829fb` (legacy port + scripts), `018c257` (CI + `.gitignore` check), `487337f` (route split +
  inventory), `f2c6fa8` (CODEOWNERS), plus `604fa36` (root lockfile resync) and `aff2652`
  (`setupTempDb` rename).
- Evidence: `npm --prefix backend test` 15/15 on temp DBs; `node backend/test-v1-specs.js` 7/7 on a
  temp `DB_PATH`; ported asserts 45/45 (original unchanged); route inventory 25/25 frozen;
  `backend/finmate.db` never created by a test; CI + CODEOWNERS on `main`.
- Boundary: `routes/v1/index.js` is wiring only; handlers own one file per domain; CI added. This is
  the harness + CI every later WS-FND plan depends on. No contract files produced.
- Unblocks: WS-FND-P2, WS-CAT-P1, WS-SEN-P1, WS-UI-P1 (WS-SEN-P2 still waits on WS-SEN-P1).
- Note: `backend/test/live/.gitkeep` and `backend/test/temp-db.test.js` were created because the plan
  text requires them though plan §4 omits them; `npx oxlint` stays non-blocking until WS-FND-P6.
### WS-FND-P2 — Migrations Framework and Schema Gaps — Complete 2026-10-17
- Branch `ws-fnd/p2-migrations`: `0a8b1c9` (runner + baseline schema), `cc762b0` (platform and
  ingestion tables + `TABLES.md`), `01383eb` (cross-platform baseline-test fix). Pushed to
  `origin/ws-fnd/p2-migrations` and **merged 2026-10-17**; merge commit / PR link to be recorded by the
  owner (local `origin/main` still reads `10bcba8`; this session cannot fetch).
- Implemented all nine plan §6 steps: `000_baseline.sql` (392 lines, verbatim pre-migration DDL),
  `migrate.js` (lexical order, sha-256 in `schema_migrations`, per-file transaction + rollback,
  `MIGRATION_CHECKSUM_MISMATCH`, `MIGRATION_FILE_MISSING`), `db.js` = open + pragmas (WAL,
  `foreign_keys`, `busy_timeout = 2000`) + `migrate` + startup integrity check, `010`/`011` with
  constraints and indexes, exact baseline test, existing-database test, `TABLES.md`.
- Schema added: 9 tables (`tool_results`, `intent_tokens`, `event_deliveries`, `jobs`,
  `jobs_dead_letter`, `traces`, `rolling_summaries`, `ingestion_batches`, `ingestion_errors`) and 12
  indexes. Checksums: `000` `f9cf36f8…bbb7`, `010` `111731fe…9923`, `011` `e6c59ae8…e19`. The full
  inventory is in `backend/src/db/TABLES.md`.
- Tests, verified 2026-10-17: `node --test --test-isolation=none` over the five files from
  `backend/` → **33 tests, 33 pass, 0 fail, exit 0** (temp-db 4/4, routes-inventory 4/4,
  legacy-v1-specs 7/7, migrate 16/16, schema-baseline 2/2); `node backend/test-v1-specs.js` on a temp
  `DB_PATH` → ALL SPECIFICATION VERIFICATION TESTS PASSED; `npx oxlint` → 152 warnings, 0 errors.
  `npm --prefix backend test` reported 30/30 in the earlier full-access session, before the three
  startup-integrity tests existed; it cannot run in the restricted sandbox — re-verified 2026-10-17 it
  reports `5 tests, 0 pass, 5 fail` with `Error: spawn EPERM` on every test file at the spawn step and
  no test body executed, so that is an execution-environment result, not a product failure. `npm run build`
  passes with full access and is blocked by the same sandbox restriction, which is unrelated to this
  plan (no change under `src/` or `vite.config.js`).
- Evidence locations: `backend/test/db/migrate.test.js` (438 lines), `backend/test/db/schema-baseline.test.js`
  (86 lines), plan §14 (14.6 commands and results, 14.7 deviations), `backend/src/db/TABLES.md`.
- Unresolved owner decisions (details in plan §14.8 and `TABLES.md` "Approval status"): counter-to-row-version
  mapping (inferred, documented nowhere; Doc 2 names `categorization_version`/`balance_version` which do
  not exist); environment policy for inconsistent counters (dev warn, test/production throw — plan §6
  step 8 vs §11 contradict); `intent_tokens.token_hash` vs plan §5's plaintext `token` (security
  boundary); `jobs`/`jobs_dead_letter` shape needing a Doc 2 §3.5 amendment; `ingestion_batches`
  UNIQUE key (`user_id` vs Doc 2's `tenant_id`); `ingestion_errors` PK (`(batch_id, row_index, code)`);
  golden schema embedded in a test instead of §6 step 1's fixture path; no JavaScript-migration support
  (plan §7); duplicate summary authority (`chat_threads.rolling_summary` vs `rolling_summaries`).
- Status: **Complete 2026-10-17** (merged by the plan owner). Branch head `01383eb` (adds the
  cross-platform baseline-test fix), pushed to `origin`. Two record items are still blank and must be
  filled in when known, as WS-FND-P1 did: the merge commit / PR link, and the CI run on `main` — local
  `origin/main` still reads `10bcba8` and this session cannot fetch (`SEC_E_NO_CREDENTIALS`).
- The seven decisions `WS-FND-P2-1`…`-7` stay open in `tracking/STATUS.md` §4; consumers WS-FND-P3,
  WS-PLT-P1, WS-CAT-P2 and WS-JON must not treat those table shapes as approved contracts until the
  owner records them. WS-FND-P3 and WS-PLT-P1 are unblocked by the merge (consumer owners flip their
  own rows to Ready); WS-CAT-P2 still waits on WS-CAT-P1 and WS-FND-P4 on WS-CAT-P2/WS-PLT-P1.

