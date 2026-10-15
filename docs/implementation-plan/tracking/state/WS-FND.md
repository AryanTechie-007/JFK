# Execution State — WS-FND (Foundations, Tooling & Integration)

Fed to every new coding session for this workstream (Template A `[STATE FILE]`). Keep it short and factual; append, do not rewrite history.

| Field | Value |
| --- | --- |
| Developer | Dev A — Abhilash (@Falterred) |
| Branch prefix | `ws-fnd/p<n>-<slug>` |
| Current plan | WS-FND-P1 (not started) |

## 1. Sequence overview
| Local | Plan ID | Title | Objective (short) | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| Plan 1 | WS-FND-P1 | Baseline, Guardrails and Route Split | Give every other workstream a safe place to work: specs and design on `main` (done at initialisation), a real test runner on temporary databases, CI, CODEOWNERS, and one route file per domain… | A-ARCH, C-1 | Blocked |
| Plan 2 | WS-FND-P2 | Migrations Framework and Schema Gaps | Replace the inline `CREATE TABLE IF NOT EXISTS` block in `backend/src/db.js` with versioned SQL migrations, reproduce today's schema exactly, and add the tables the… | WS-FND-P1 | Blocked |
| Plan 3 | WS-FND-P3 | Event Dispatcher, Tool-Result Store, Traces and LLM Adapter | Build the shared plumbing every component needs and the source baseline lacks: outbox event append + dispatcher with retries and dead letter (G-3), persistent tool results with… | C-1, U-2, WS-FND-P2 | Blocked |
| Plan 4 | WS-FND-P4 | Demo Dataset and Seed | Produce the labelled synthetic dataset and a one-command reset so every demo, golden test and E2E run starts from identical, independently verified state (prototype… | WS-CAT-P2, WS-FND-P2, WS-PLT-P1 | Blocked |
| Plan 5 | WS-FND-P5 | Legacy Retirement and Single-Server Desktop | Make the prototype one server and one database (ADR-01, P-AC-01): delete Backend B, legacy REST routes, the Gemini coach route, legacy tables and sync code, and the… | WS-CAT-P2, WS-FND-P3, WS-JON-P1, WS-PLT-P1, WS-UI-P1, WS-UI-P2, WS-UI-P3 | Blocked |
| Plan 6 | WS-FND-P6 | End-to-End Suites and Acceptance Run | Prove the integrated prototype: demo-journey E2E on the fake provider, security suite S-1…S-16, failure injection, restart persistence, live-model suite (Qwen from D3, or stand-in)… | WS-AGT-P2, WS-AGT-P3, WS-CAT-P3, WS-FND-P4, WS-FND-P5, WS-JON-P2, WS-PLT-P2, WS-SEN-P2, WS-UI-P2, WS-UI-P3 | Blocked |

Plan files: `docs/implementation-plan/workstreams/WS-FND/`. Status of record: `tracking/STATUS.md`.

## 2. Interfaces this workstream consumes / produces
See the rows naming WS-FND in `cross-workstream-dependencies.md`. Record here the merged contract files as they land:
- (none merged yet)

## 3. Decisions and assumptions in force
- **Source-baseline import (D-PLAN-3) not yet on `main` — every plan in this sequence is Blocked until it is** (`../../../repository-migration-notes.md` §5).
- Decisions of 2026-10-13 in `baseline.md` §6: LLM agents with deterministic fallback; aim Tier 3, fall back to Tier 2 (checkpoint end of D5); one plan = one branch = one PR (contract commit first, Draft PR, merge commit); SC action names + aliases; keep table names; keep existing deferred actions only; LLM consent off by default; stub after half a day late; Qwen details on D3, stand-in provider if unavailable.

## 4. Handoff log (append Template E summaries, newest last)
- (empty)
