# Execution State — WS-FND (Foundations, Tooling & Integration)

Fed to every new coding session for this workstream (Template A `[STATE FILE]`). Keep it short and factual; append, do not rewrite history.

| Field | Value |
| --- | --- |
| Developer | Dev A — Abhilash (@Falterred) |
| Branch prefix | `ws-fnd/p<n>-<slug>` |
| Current plan | WS-FND-P1 — **Complete** (2026-10-16); next: WS-FND-P2 |

## 1. Sequence overview
| Local | Plan ID | Title | Objective (short) | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| Plan 1 | WS-FND-P1 | Baseline, Guardrails and Route Split | Give every other workstream a safe place to work: specs and design on `main` (done at initialisation), a real test runner on temporary databases, CI, CODEOWNERS, and one route file per domain… | A-ARCH, C-1 | Complete |
| Plan 2 | WS-FND-P2 | Migrations Framework and Schema Gaps | Replace the inline `CREATE TABLE IF NOT EXISTS` block in `backend/src/db.js` with versioned SQL migrations, reproduce today's schema exactly, and add the tables the… | WS-FND-P1 | Ready |
| Plan 3 | WS-FND-P3 | Event Dispatcher, Tool-Result Store, Traces and LLM Adapter | Build the shared plumbing every component needs and the source baseline lacks: outbox event append + dispatcher with retries and dead letter (G-3), persistent tool results with… | C-1, U-2, WS-FND-P2 | Blocked |
| Plan 4 | WS-FND-P4 | Demo Dataset and Seed | Produce the labelled synthetic dataset and a one-command reset so every demo, golden test and E2E run starts from identical, independently verified state (prototype… | WS-CAT-P2, WS-FND-P2, WS-PLT-P1 | Blocked |
| Plan 5 | WS-FND-P5 | Legacy Retirement and Single-Server Desktop | Make the prototype one server and one database (ADR-01, P-AC-01): delete Backend B, legacy REST routes, the Gemini coach route, legacy tables and sync code, and the… | WS-CAT-P2, WS-FND-P3, WS-JON-P1, WS-PLT-P1, WS-UI-P1, WS-UI-P2, WS-UI-P3 | Blocked |
| Plan 6 | WS-FND-P6 | End-to-End Suites and Acceptance Run | Prove the integrated prototype: demo-journey E2E on the fake provider, security suite S-1…S-16, failure injection, restart persistence, live-model suite (Qwen from D3, or stand-in)… | WS-AGT-P2, WS-AGT-P3, WS-CAT-P3, WS-FND-P4, WS-FND-P5, WS-JON-P2, WS-PLT-P2, WS-SEN-P2, WS-UI-P2, WS-UI-P3 | Blocked |

Plan files: `docs/implementation-plan/workstreams/WS-FND/`. Status of record: `tracking/STATUS.md`.

## 2. Interfaces this workstream consumes / produces
See the rows naming WS-FND in `cross-workstream-dependencies.md`. Record here the merged contract files as they land:
- (none merged yet — WS-FND-P1 produces no shared contract files; its test helpers `setupTempDb()`, `loadApp()`, `signup()`, `createUser()` and `authed()` are the frozen harness other workstreams test against)

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
