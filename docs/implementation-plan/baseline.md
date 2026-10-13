# Source Baseline (verified 2026-10-11 at commit 54f9f6f of the previous project repository; re-checked against fc0981d)

> **Read this first (2026-10-13).** This file describes the **source baseline**: the application code the 21 plans were written against. That code lived in the previous project repository, which is **out of scope** for this project and must not be accessed for implementation. The new project repository `https://github.com/Kathir-M-03/FINNMIN-JFK-John` currently contains documentation only. Whether and how this code enters the new repository is team decision **TD-01** ([`../team-decisions.md`](../team-decisions.md)). Every "[V] verified" statement below was verified against the previous repository on 2026-10-11; after an import it must be **re-verified** against the imported commit (see [`../repository-migration-notes.md`](../repository-migration-notes.md) §5). Wherever this file says "on `main`", read "in the source baseline".

> **Re-check (audit, 2026-10-11):** the only upstream change since `54f9f6f` is `fc0981d` "Add files via upload", which edits `package-lock.json` only (package name, Electron pinned to 41.10.7 to match `package.json` `^41.2.0`). No plan is affected; it makes `npm ci` consistent for CI. Remote module branches `atlas`, `iris`, `john`, `nova`, `sentinel`, `tally` still point at `54f9f6f`; `sentinel_web` had diverged. *(Historical: none of these branches exist in the new repository and they must not be recreated — `workstream-assignments.md` §7.)*

Labels: **[V]** verified by reading code or running it · **[S]** stated in specs/design · **[A]** assumption · **[U]** unresolved.

## 1. Materials inspected
- Code: `backend/` (entire `src/`), `src/` (React views, services, legacy Backend B), `electron/main.js`, `launch.bat`, `package.json` (root, backend), `tests/verifyApp.js`, `backend/test-v1-specs.js`, `.gitignore`, `.env.example`, `README.md`, `branch-manifest.json`.
- Specs: `docs/specifications/*.md` (on `main`, identical to the frozen set).
- Architecture: `docs/prototype-design/*.md` (at planning time on an unmerged docs branch; **now on `main` of the new repository** since its first commit).
- Executed: `node backend/test-v1-specs.js` → all 7 sections pass [V]. Legacy module tests under `src/` pass against Backend B's in-memory emulator (previous inspection) [V].
- **Limitation:** `npm install` is blocked by this planning environment's network policy, so the HTTP server and the React build could not be started here. Statements about HTTP behaviour come from reading the route code, not from running it.

## 2. Stack and runtime [V]
| Layer | Fact |
| --- | --- |
| Backend | Node ≥ 22.5 (CommonJS), Express 4, `node:sqlite` via `backend/src/db.js`, JWT + bcrypt auth (`backend/src/middleware/auth.js`), port 4000, entry `backend/src/index.js` (exports `app`; listens only when run directly) |
| Backend package | `backend/package.json`: scripts `start`, `dev`, `seed`; deps bcryptjs, cors, dotenv, express, jsonwebtoken. No test script, no Ajv, no decimal.js |
| Frontend | React 19 + Vite 8 + Recharts + lucide-react; root `package.json` is the Electron app (`"main": "electron/main.js"`) |
| Desktop | Electron 41; `electron/main.js` starts **both** `backend/src/index.js` (:4000) **and** legacy `src/index.js` (:4001) and loads `dist/`. Latest commit made the desktop app the only delivery surface (web-testing removed) |
| Tests | No test runner; ad-hoc scripts (`backend/test-v1-specs.js`, `src/**/**.test.js`, `tests/novaEngine.test.js`, gate `tests/verifyApp.js` which checks legacy modules only). No CI configuration (`.github/` absent) |
| Config | `backend/.env` (`PORT`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CORS_ORIGIN`); `.gitignore` ignores `.env`, `*.db`; `dist/` is committed |

## 3. What exists on `main` [V]
| Area | Location | State |
| --- | --- | --- |
| Shared primitives | `backend/src/shared/ids.js`, `money.js`, `finance/movement.js`, `finance/coverage.js`, `contracts/{action-registry,constraint-messages,grounding,validator}.js` | ULIDs, paise helpers with half-even rounding, Indian formatting, grounding resolver + unbound-digit detector, action registry (≥ 30 entries), constraint codes (≥ 31), caller allowlist |
| Schema | `backend/src/db.js` (inline `CREATE TABLE IF NOT EXISTS`) | **Two schemas side by side:** legacy REAL-rupee tables (`users`, `goals`, `budget_categories`, `transactions`, `upcoming_bills`, `subscriptions`) and v1 integer-paise tables (`user_state_versions`, `user_profiles_v1`, `accounts_v1`, `transactions_v1`, `categorization_history`, `review_items`, `category_rules`, `goals_v1`, `goal_month_overrides`, `caps_v1`, `cap_month_overrides`, `declared_bills_v1`, `alerts_v1`, `snapshots_v1`, `proposals_v1`, `confirmation_tokens`, `action_ledger`, `memory_facts`, `chat_threads`, `chat_turns`, `outbox_events`). No migrations framework |
| Item Categorizer | `backend/src/engines/categorizer/{index,merchants,normalize,taxonomy}.js` | Movement typing (transfers, card payments, refunds…), merchant matching, rules, confidence, history, status, review queue; `syncLegacyTransactionsForUser` copies legacy rows into v1 |
| Sentinel | `backend/src/engines/sentinel/{index,params}.js`, `rules/index.js` | 17 functions exposed via `SENTINEL_FUNCTIONS`/`callSentinel`; rule library |
| Platform | `backend/src/platform/{action-service,budget-monitor,gateway,profile,snapshot}.js` | Proposals + confirmation tokens + ledger + undo; synchronous monitor `scanUserBudgets`; `GatewaySession` with allowlist and **in-memory** result map; snapshots with version counters |
| Agents | `backend/src/agents/{john,atlas,nova,iris}/index.js` | **Deterministic only — no LLM call anywhere.** John routes by regex, dispatches specialists, validates, renders templates |
| HTTP v1 | `backend/src/routes/v1/index.js` (one 697-line file) | chat, actions propose/execute/undo/history, workspaces (atlas, nova, iris, sentinel), categorizer status/taxonomy/review-queue, ingest batch/manual, settings, memory facts |
| Legacy HTTP | `backend/src/routes/{auth,users,goals,transactions,budget,insights,coach,subscriptions}.js` | Still mounted; `coach.js` calls Gemini |
| Legacy Backend B | `src/index.js`, `src/db/`, `src/routes/`, `src/contracts/`, `src/tools/*/*.js`, `src/agents/*/*.js` (non-JSX), `demo.js` | Still started by Electron (:4001); no auth (`x-user-id`) |
| Frontend | `src/App.jsx`, `src/components/*`, views in `src/agents/*/*.jsx`, `src/tools/{sentinel,tally}/*.jsx`, services `src/services/*` | Atlas, Iris, Nova, Sentinel views use `workspaceService` (v1). App shell, Onboarding, Settings (part), Subscriptions, Spending Analyser, Statement Import, Home, Health still call **legacy** endpoints. Nine nav items. Mock data still imported by `Header`, `Sidebar`, `AgentStatusBadge`, `FinancialHealthView`, `JohnCoachDashboard`, `geminiService`; John view falls back to Gemini on v1 failure |

## 4. Gaps against the specifications and the prototype design
| ID | Gap | Spec / design reference | Plan |
| --- | --- | --- | --- |
| G-1 | No LLM in John or specialists (D-008 requires Qwen 32B-class for the prototype; specs define LLM specialists) | SC §2.1, §17.8; John §A, Atlas/Nova/Iris §D; ADR-06/07 | WS-FND-P3, WS-AGT-P1/P2, WS-JON-P1 |
| G-2 | Confirmation token returned at proposal creation; `/actions/execute` auto-registers and executes any action in one call → T2/T3 executable without a card tap | SC §13.1, §13.4 | WS-PLT-P1 |
| G-3 | Outbox table unused; Budget Monitor runs synchronously inside GET/ingest routes | SC §14; ADR-04 | WS-FND-P3, WS-PLT-P2 |
| G-4 | Tool results only in memory per gateway session (no audit, no cross-request grounding) | SC §10.2, §7.3 | WS-FND-P3 |
| G-5 | Dual legacy/v1 schemas with sync code | ADR-01, ADR-08 | WS-FND-P5 |
| G-6 | Backend B still booted by Electron; unauthenticated | ADR-01, R-2 | WS-FND-P5 |
| G-7 | No canonical ingestion (`CanonicalBatch@1`, CSV mapping profile, idempotent batches) | SC §17.7; ADR-10 | WS-CAT-P2 |
| G-8 | No test runner, temp DB isolation or CI; tests use the real DB file | ADR-13 | WS-FND-P1 |
| G-9 | Nine nav items, mocks, legacy calls in the UI | SC §18; ADR-11 | WS-UI-P1, WS-UI-P2 |
| G-10 | Single `routes/v1/index.js` shared by every workstream (merge-conflict hotspot) | Workstream ownership | WS-FND-P1 |
| G-11 | No rolling summaries / SSE streaming / consent gate for chat | John §B.2, §G.4; SC §16.6 | WS-JON-P1 |
| G-12 | Conformance of existing engines to spec acceptance criteria is unproven (one script, 7 sections) | Categorizer §B.9, Sentinel §B.9 | WS-CAT-P1, WS-SEN-P1 |
| G-14 | Single-writer violations: `platform/action-service.js` updates `transactions_v1` directly (categorizer tables); `platform/profile.js` updates `goals_v1` during legacy sync | SC §2.3; D-001 | WS-CAT-P3 (executors move into the categorizer), WS-FND-P5 (sync removed) |
| G-13 | Missing tables: `tool_results`, `intent_tokens`, `event_deliveries`, `jobs`, `jobs_dead_letter`, `traces`, `ingestion_batches`, `ingestion_errors`, `rolling_summaries` | Doc 2 §3 | WS-FND-P2 |

## 5. Conflicts requiring awareness or decision
| ID | Conflict | Impact | Resolution in plans | Decision owner |
| --- | --- | --- | --- | --- |
| C-1 | `main` implements deterministic agents; specs + D-008 require LLM agents | Without LLMs the prototype does not validate the AI architecture | Add the LLM layer; keep the existing deterministic composition as the runner's plan step and as the spec-mandated deterministic fallback (John §B.12) | Team lead to confirm (default: follow specs) |
| C-2 | Repository now ships desktop-only (Electron); prototype design defaulted to browser (U-3) | Demo surface | Plans target Electron with the Vite-built UI; U-3 resolved by the repository's latest commit | Resolved [V] |
| C-3 | The source baseline's README describes 4 developers and long-lived module branches; this planning targets short-lived plan branches (U-4) | Workflow | Short-lived plan branches (`workstream-assignments.md` §7; [`../development-workflow.md`](../development-workflow.md)). The old module branches do not exist in the new repository | Team lead (TD-09) |
| C-5 | Action names on `main` differ from the SC §13.2 registry (`CORRECT_TRANSACTION_CATEGORY`, `CONFIRM_PROVISIONAL_CATEGORY`, `CONFIRM_TRANSACTION_CATEGORY` vs `RECATEGORIZE_TRANSACTION`/`CONFIRM_CATEGORY`; `SET_TRANSACTION_MOVEMENT_TYPE` vs `SET_TRANSACTION_TYPE`; `CREATE_MANUAL_TRANSACTION` vs `ADD_MANUAL_TRANSACTION`; `UPDATE_USER_PROFILE`/`UPDATE_USER_PREFERENCES` vs `UPDATE_PROFILE`/`UPDATE_PREFERENCE`; `CREATE_DECLARED_BILL` vs `ADD_DECLARED_BILL`; `SET_CATEGORY_WATCH` vs `CREATE_ALERT`; extra `UNDO_ACTION`, `DELETE_MEMORY_FACT`, `LINK_*`, `MARK_*`) | Proposals from specialists (SC names) and UI calls (current names) disagree; validators keyed by name | SC names are canonical; `WS-PLT-P1` adds a temporary alias table (old → SC name, logged), `WS-UI-P1` switches to SC names, `WS-FND-P5` deletes the aliases | Team lead (default: SC names) |
| C-6 | Physical table names on `main` (`transactions_v1`, `goals_v1`, `caps_v1`, `outbox_events`, …) differ from Doc 2 §3 logical names (`raw_transactions`/`txn_classification`, `goals`, `caps`, `event_outbox`, …) | Plans could create duplicate tables | **D-PLAN-2:** keep physical names; `backend/src/db/TABLES.md` maps them (WS-FND-P2) | Team lead (default: keep) |
| C-4 | `docs/prototype-design` is "Proposed", not yet approved | All plans rely on its ADRs | Merged: on `main` of the new repository since initialisation. Approval still pending (A-ARCH / TD-05) | Team lead |
| C-7 | **(added 2026-10-13)** The source baseline is not present in the new repository | Every plan modifies or extends source-baseline files; none can start | Team decision TD-01: import the source baseline (with the code owner's agreement) or re-plan for a greenfield build. Recorded in [`../repository-migration-notes.md`](../repository-migration-notes.md) §5 | Team lead |

## 6. Assumptions and unresolved questions
| ID | Item | Consequence | Owner |
| --- | --- | --- | --- |
| A-ARCH | `docs/prototype-design` is the approved architecture once merged | If parts are rejected, the affected plans are re-planned | Team lead |
| U-1 | Hackathon duration / demo date | Schedule in `roadmap.md` uses relative days D1–D6 | Team lead |
| U-2 | Qwen endpoint (base URL, model ID, JSON-schema/JSON-mode support, rate limits) | **Blocks** `WS-AGT-P3` and the live parts of `WS-FND-P6`; all other plans use the fake provider | Team lead / whoever holds the API account |
| U-4 | Branching model | See C-3 | Team lead |
| D-PLAN-2 | Keep physical table names (see C-6) | Avoids rename churn | Team lead |
| D-PLAN-1 | **Resolved:** exactly four developers; allocation in `workstream-assignments.md` §2 (Dev A WS-FND; Dev B WS-CAT + WS-PLT; Dev C WS-JON + WS-AGT; Dev D WS-SEN + WS-UI) | Schedule D1–D9 | Team lead (confirm names) |

## Appendix A — `/api/v1` route inventory on `main` (25 method/path pairs, verified)
Source: `backend/src/routes/v1/index.js`. `WS-FND-P1` step 7 freezes this list in `backend/test/routes-inventory.test.js`; later plans update it in the same PR that adds/removes a route.

| # | Method | Path | # | Method | Path |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/chat` | 14 | POST | `/workspaces/iris/simulate` |
| 2 | POST | `/actions/propose` | 15 | GET | `/workspaces/sentinel` |
| 3 | POST | `/actions/execute` | 16 | GET | `/categorizer/status` |
| 4 | POST | `/actions/:id/undo` | 17 | GET | `/categorizer/taxonomy` |
| 5 | GET | `/actions/history` | 18 | GET | `/categorizer/review-queue` |
| 6 | GET | `/workspaces/atlas` | 19 | POST | `/ingest/batch` |
| 7 | GET | `/workspaces/atlas/archived` | 20 | POST | `/ingest/manual` |
| 8 | POST | `/workspaces/atlas/validate` | 21 | GET | `/settings` |
| 9 | POST | `/workspaces/atlas/sip` | 22 | GET | `/settings/category-rules` |
| 10 | GET | `/workspaces/nova` | 23 | GET | `/settings/memory-facts` |
| 11 | POST | `/workspaces/nova/validate-cap` | 24 | POST | `/memory/facts` |
| 12 | POST | `/workspaces/nova/rebalance` | 25 | DELETE | `/memory/facts/:fact_id` |
| 13 | GET | `/workspaces/iris` | | | |

## Appendix B — Verified tooling facts used by the plans
| Fact | Evidence |
| --- | --- |
| `node --test test/` (bare directory) fails on Node 22 with "Cannot find module"; glob patterns such as `"test/**/*.test.js"` work | Run on Node 22.22.0 during the audit |
| `backend/src/index.js` exports `app` and only listens when `require.main === module` | File tail |
| Both `package-lock.json` (root) and `backend/package-lock.json` exist, so `npm ci` is usable in CI | Repository listing |
| Root `npm test` runs legacy `tests/verifyApp.js`; backend has no test script yet | `package.json` files |
| Developer machines include Windows (PowerShell); use `git grep` rather than `grep` in gates | Planning machine was Windows; `launch.bat` in the source baseline |
