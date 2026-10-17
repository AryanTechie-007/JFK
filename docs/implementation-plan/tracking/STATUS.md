# Plan Status Board

Update this file in the same PR that changes a plan's state (or via a small `tracking:` PR). Rules and evidence requirements: `tracking/README.md`. Statuses: **Blocked → Ready → In progress → In review → Complete**.

Local plan numbers restart at Plan 1 in every workstream; always refer to plans by **ID**.

> **2026-10-16:** the **source-baseline import** (D-PLAN-3) is on `main` (import commit `645355c`, merged by PR #1) and **WS-FND-P1 is Complete**, so the note of 2026-10-15 is removed. Plans are now blocked only by their own listed implementation dependencies. Remaining open items: [`../../team-decisions.md`](../../team-decisions.md).



## 1. Plans
| Plan ID | Local | Title | Developer | Target (roadmap §4) | Status | Waiting on (implementation deps) | PR | Evidence (tests · acceptance · review) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WS-FND-P1 | Plan 1 | Baseline, Guardrails and Route Split | Dev A | D1 | Complete | — | merged (PR #2) | `npm --prefix backend test` 15/15; legacy script 7/7 on temp DB; ported asserts 45/45; route inventory 25/25; CI + CODEOWNERS on `main` | Branch `ws-fnd/p1-baseline-guardrails-route-split`; helper renamed to `setupTempDb`; root lockfile resynced (`604fa36`) |
| WS-FND-P2 | Plan 2 | Migrations Framework and Schema Gaps | Dev A | D2 | Complete | — | merged (PR #4, `5634455`) | `node --test --test-isolation=none` over five backend test files: 33/33 (4/4, 4/4, 7/7, 16/16, 2/2), 2026-10-17; `npm --prefix backend test` 30/30 in earlier full-access run; `node backend/test-v1-specs.js` passed on a temp `DB_PATH`; `npx oxlint` 0 errors; `npm run build` blocked by session sandbox (`spawn EPERM`) | Branch `ws-fnd/p2-migrations` at `01383eb` (`0a8b1c9` + `cc762b0` + cross-platform baseline-test fix), pushed to `origin`. Migration runner + `000_baseline.sql` + `010`/`011` (9 tables, 12 indexes) + `TABLES.md`. Seven schema/contract items remain open as §4 decisions `WS-FND-P2-1`…`-7`. |
| WS-FND-P3 | Plan 3 | Event Dispatcher, Tool-Result Store, Traces and LLM Adapter | Dev A | D3 | Ready | — | — | — | — |
| WS-FND-P4 | Plan 4 | Demo Dataset and Seed | Dev A | D4 | Blocked | WS-CAT-P2, WS-PLT-P1 | — | — | — |
| WS-FND-P5 | Plan 5 | Legacy Retirement and Single-Server Desktop | Dev A | D8 | Blocked | WS-CAT-P2, WS-FND-P3, WS-JON-P1, WS-PLT-P1, WS-UI-P1, WS-UI-P2, WS-UI-P3 | — | — | — |
| WS-FND-P6 | Plan 6 | End-to-End Suites and Acceptance Run | Dev A | D9 | Blocked | WS-AGT-P2, WS-AGT-P3, WS-CAT-P3, WS-FND-P4, WS-FND-P5, WS-JON-P2, WS-PLT-P2, WS-SEN-P2, WS-UI-P2, WS-UI-P3 | — | — | — |
| WS-CAT-P1 | Plan 1 | Categorizer Conformance and Pipeline Fixes | Dev B | D2 | Ready | — | — | — | — |
| WS-CAT-P2 | Plan 2 | Canonical Ingestion Gateway | Dev B | D5 | Blocked | WS-CAT-P1, WS-FND-P2 | — | — | Seed files from WS-FND-P4 are validated here (built against SC §17.7). `WS-FND-P2` ingestion tables are merged; `WS-CAT-P1` remains the outstanding implementation dependency. |
| WS-CAT-P3 | Plan 3 | Corrections via the Action Service, Read API and Golden Evaluation | Dev B | D6 | Blocked | WS-CAT-P1, WS-FND-P4 | — | — | — |
| WS-SEN-P1 | Plan 1 | Sentinel Conformance: Envelope, Read-Only Access and Golden Tests | Dev D | D4 am | Complete | — | merged (PR #5, `f233f2c`) | SEN-AC-01..05, 10, 19, 20 green (71/71 tests pass); `PRAGMA query_only=ON`; determinism replay | Completed on `dev-d` |
| WS-SEN-P2 | Plan 2 | Rule-Library Parity, Workspace View Contracts and Performance | Dev D | D5 am | Complete | — | merged (PR #5, `f233f2c`) | 65-case parity suite (SEN-AC-06), parameter registry SHA hashing (SEN-AC-09), `METHODS.md` statistical backtests within ±15% (SEN-AC-08, D-PLAN-10), volume benchmarks across 7,200 transactions (SEN-AC-11), workspace view routes (13/13) | Completed on `dev-d` |
| WS-PLT-P1 | Plan 1 | Consent-Safe Action Service | Dev B | D4 am | Ready | — | — | — | Unblocked by WS-FND-P2 merge |
| WS-PLT-P2 | Plan 2 | Event-Driven Budget Monitor and Profile Conformance | Dev B | D4 | Blocked | WS-FND-P3, WS-PLT-P1 | — | — | — |
| WS-AGT-P1 | Plan 1 | Specialist Runner and Nova on the LLM Adapter | Dev C | D5 | Blocked | WS-FND-P3 | — | — | — |
| WS-AGT-P2 | Plan 2 | Atlas and Iris on the Runner | Dev C | D8 am | Blocked | WS-AGT-P1 | — | — | Tier cut note applies if Tier 3 is cut at end of D5 |
| WS-AGT-P3 | Plan 3 | Live-Model Evaluation (Qwen prototype endpoint) | Dev C | D9 (U-2) | Blocked | WS-AGT-P2 | — | — | Qwen key/model arrive D3; stand-in provider if unavailable (D-PLAN-12) |
| WS-JON-P1 | Plan 1 | LLM Router Fallback, Grounded Synthesis, Streaming and Consent | Dev C | D4 am | Blocked | WS-FND-P3 | — | — | Contract commit first; draft PR for Dev D approval on D1 |
| WS-JON-P2 | Plan 2 | Proposals, Rule-Detected Instructions, Corrections and Arbitration in Chat | Dev C | D7 am | Blocked | WS-CAT-P3, WS-JON-P1, WS-PLT-P1 | — | — | Tier cut note: dependency edge skipped if Tier 3 is cut |
| WS-UI-P1 | Plan 1 | Five-Workspace Shell, Single API Client and Shared Components | Dev D | D2 | Complete | — | merged (PR #5, `f233f2c`) | Zero mocks (P-AC-01), display formatting only (P-AC-05), grep gate green (0 occurrences), single v1 API client with JWT 401 handling, shared UI components | Completed on `dev-d` |
| WS-UI-P2 | Plan 2 | Sentinel Workspace and Settings | Dev D | D7 am | Complete | — | merged (PR #6, `e26da14`) | Sentinel workspace (Balances, Spending, Forecast, Transaction ledger with inline T1 and undo, Review queue, BillsPanel), Settings page, NotificationBell, deleted legacy views and services | Completed on `dev-d` |
| WS-UI-P3 | Plan 3 | Chat UX (Streaming, Cards, Chips, Undo), Alert Explain and Desktop Verification | Dev D | D8 am | Complete | — | merged (PR #7, `72b4aaf`) | SSE client and parser (4/4 tests), John star orchestrator view, canonical BlockRenderer (7 kinds), Composer with stop and consent gating, workspace chat panels, alert explain trigger, deleted legacy services | Completed on `dev-d` |

## 2. Developer queues (execution order)
| Developer | Order |
| --- | --- |
| Dev A | WS-FND-P1 → WS-FND-P2 → WS-FND-P3 → WS-FND-P4 → WS-FND-P5 → WS-FND-P6 |
| Dev B | WS-CAT-P1 → WS-PLT-P1 → WS-PLT-P2 → WS-CAT-P2 → WS-CAT-P3 |
| Dev C | WS-JON-P1 → WS-AGT-P1 → WS-JON-P2 → WS-AGT-P2 → WS-AGT-P3 |
| Dev D | WS-UI-P1 → WS-SEN-P1 → WS-SEN-P2 → WS-UI-P2 → WS-UI-P3 |

## 3. Gate log
| Gate | Target | Status | Evidence links | Date |
| --- | --- | --- | --- | --- |
| G1 Contract agreement | end D1 | Open | WS-FND-P1 merged: docs on `main`, harness + CI, route split, CODEOWNERS (outstanding: WS-JON-P1 Draft PR with its Chat-schema contract commit) | 2026-10-16 |
| G2 Skeleton integration | end D3 | Open | | |
| G3 Core deterministic loop | end D4 | Open | | |
| Tier checkpoint (D-PLAN-9) | end D5 | Open | G3 ≤ 1 day late → keep Tier 3; else cut Tier 3 | |
| G4 Cross-component behaviour | end D7 | Open | | |
| G5 End-to-end prototype | end D8 | Open | | |
| G6 Regression/security/reliability | D9 | Open | | |
| G7 Final acceptance | D9 | Open | | |

## 4. Decision and escalation log
| Date | ID | Decision / question | Raised by | Owner | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-10-13 | A-ARCH, C-1 | Design approved; real LLM agents with deterministic fallback | Planning | Team lead | Decided |
| 2026-10-13 | U-1, D-PLAN-9 | ≥ 9 working days; aim Tier 3, fall back to Tier 2; checkpoint at end of D5 (G3 > 1 day late → cut Tier 3) | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-3 | Build in a new repository owned by the team lead | Planning | Team lead | Decided — `https://github.com/Kathir-M-03/FINNMIN-JFK-John`; source-baseline import merged into `main` (`645355c`, PR #1) |
| 2026-10-13 | U-4, D-PLAN-4 | Short-lived plan branches; one plan = one branch = one PR; contract commit first in a Draft PR; merge commit | Planning | Team lead | Decided |
| 2026-10-13 | C-5 | SC §13.2 action names + temporary aliases | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-2 | Keep physical table names | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-5 | Keep deferred actions that already work on `main`; build no new ones | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-6 | LLM consent off until the user opts in; demo user seeded on | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-7 | Contract-matching stub after half a day late | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-8 | Independent review mandatory for sensitive plans only | Planning | Team lead | Decided |
| 2026-10-13 | U-2, D-PLAN-11 | Qwen key/model arrive D3; key in local `.env` + GitHub Actions secret, never committed | Planning | Team lead | Decided (details pending D3) |
| 2026-10-13 | D-PLAN-12 | If Qwen unavailable, temporarily use another OpenAI-compatible provider | Planning | Team lead | Decided — provider + key holder to choose before D8 |
| 2026-10-13 | D-PLAN-10 | Sentinel backtest limit ±15 % (provisional) | Planning | Team lead | Confirm on D4 |
| 2026-10-13 | D-PLAN-13 | Golden target per Doc 6 P-AC-03; D8 deletion of Backend B, legacy tables, `dist/` | Planning | Team lead | Default, not objected to |
| 2026-10-15 | D-PLAN-1 | Dev A Abhilash (@Falterred), Dev B Kathir (@Kathir-M-03), Dev C Anish (@DEstroy746), Dev D Aryan (@AryanTechie-007) | Planning | Team lead | Decided |
| — | — | Branch protection available on the new repository? | Planning | Team lead | Open — check Settings → Branches |
| 2026-10-17 | WS-FND-P2-1 | Counter-to-row-version mapping used by the startup integrity check (`ledger_version` ↔ `transactions_v1.categorized_version`/`categorization_history.version`, `plan_version` ↔ `goals_v1.version`/`caps_v1.version`, `profile_version` ↔ `user_profiles_v1.version`/`declared_bills_v1.version`, `rules_version` ↔ `category_rules.version`) is inferred from the bump sites; Doc 2 §3.1 names `categorization_version`/`balance_version`, which do not exist | Dev A | Team lead | Open — owner decision required (plan §14.8 item 1) |
| 2026-10-17 | WS-FND-P2-2 | Startup behaviour when a counter is below a row version: plan §6 step 8 says "log + refuse start in non-test env", plan §11 says warn-only in development. Implemented warn in development, throw in test and production, unset `NODE_ENV` treated as development | Dev A | Team lead | Open — owner decision required (plan §14.8 item 2) |
| 2026-10-17 | WS-FND-P2-3 | `intent_tokens` primary key is `token_hash` (sha-256) per Doc 2 §3.4 and WS-PLT-P1, not the plaintext `token` written in plan §5 — security boundary | Dev A | Team lead + WS-PLT-P1 owner | Open — consumer review required (plan §14.8 item 3) |
| 2026-10-17 | WS-FND-P2-4 | `jobs`/`jobs_dead_letter` use the §5 queue shape instead of Doc 2 §3.5's `job_name`/`last_run_at`/`last_status`; a Doc 2 amendment is required before WS-FND-P3 builds on it | Dev A | Team lead | Open — contract amendment required (plan §14.8 item 4) |
| 2026-10-17 | WS-FND-P2-5 | `ingestion_batches` unique key is `(user_id, idempotency_key)` (Doc 2 says `(tenant_id, idempotency_key)`); `ingestion_errors` PK is `(batch_id, row_index, code)` (Doc 2 says `(batch_id, row_index)`) — both are WS-CAT-P2 inputs | Dev A | Team lead + WS-CAT-P2 owner | Open — contract amendment required (plan §14.8 items 5–6) |
| 2026-10-17 | WS-FND-P2-6 | Golden baseline schema is embedded in `backend/test/db/schema-baseline.test.js` because plan §6 step 1's `backend/test/fixtures/fnd/schema-before.json` is outside plan §4's file table; JS-migration support (§7) was not implemented | Dev A | Team lead | Open — approval or follow-up commit required (plan §14.8 items 7–8) |
| 2026-10-17 | WS-FND-P2-7 | Two summary authorities now exist: baseline `chat_threads.rolling_summary` and new `rolling_summaries`; nothing keeps them in sync | Dev A | WS-JON owner + Team lead | Open — ownership decision required (plan §14.8 item 9) |
