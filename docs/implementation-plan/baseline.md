# Source Baseline (verified 2026-10-11 at commit 54f9f6f of the previous project repository; re-checked against fc0981d)

> **Read this first (2026-10-13).** This file describes the **source baseline**: the application code the 21 plans were written against. That code lived in the previous project repository. Team decision **D-PLAN-3** (§6) makes it the starting point of the new project repository `https://github.com/Kathir-M-03/FINNMIN-JFK-John` (commit `fc0981d`, one-time import by the team lead); after the import, implementation never uses the previous repository. At the time of writing the new repository contains documentation only — the import is still to be committed. Every "[V] verified" statement below was verified against the previous repository on 2026-10-11; after an import it must be **re-verified** against the imported commit (see [`../repository-migration-notes.md`](../repository-migration-notes.md) §5). Wherever this file says "on `main`", read "in the source baseline".

> **Re-check (audit, 2026-10-11):** the only upstream change since `54f9f6f` is `fc0981d` "Add files via upload", which edits `package-lock.json` only (package name, Electron pinned to 41.10.7 to match `package.json` `^41.2.0`). No plan is affected; it makes `npm ci` consistent for CI. Remote module branches `atlas`, `iris`, `john`, `nova`, `sentinel`, `tally` still point at `54f9f6f`; `sentinel_web` had diverged. *(Historical: none of these branches exist in the new repository and they must not be recreated — `workstream-assignments.md` §7.)*

> **Decisions taken 2026-10-13:** all blocking decisions are recorded in §6. The team builds in a new repository owned by the team lead (D-PLAN-3); the code facts below were verified on `AryanTechie-007/JFK` `main` @ `fc0981d`, from which that repository starts.

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
| ID | Conflict | Impact | Resolution in plans | Decision |
| --- | --- | --- | --- | --- |
| C-1 | `main` implements deterministic agents; specs + D-008 require LLM agents | Without LLMs the prototype does not validate the AI architecture | Add the LLM layer; keep the existing deterministic composition as the runner's plan step and as the spec-mandated deterministic fallback (John §B.12) | **Decided 2026-10-13:** LLM agents per specs, deterministic fallback |
| C-2 | Repository now ships desktop-only (Electron); prototype design defaulted to browser (U-3) | Demo surface | Plans target Electron with the Vite-built UI; U-3 resolved by the repository's latest commit | Resolved [V] |
| C-3 | README describes 4 developers and long-lived module branches; this planning targets 6 developers and short-lived plan branches (U-4) | Workflow | Short-lived plan branches recommended (`workstream-assignments.md` §5) | **Decided:** four developers, short-lived plan branches (U-4) |
| C-5 | Action names on `main` differ from the SC §13.2 registry (`CORRECT_TRANSACTION_CATEGORY`, `CONFIRM_PROVISIONAL_CATEGORY`, `CONFIRM_TRANSACTION_CATEGORY` vs `RECATEGORIZE_TRANSACTION`/`CONFIRM_CATEGORY`; `SET_TRANSACTION_MOVEMENT_TYPE` vs `SET_TRANSACTION_TYPE`; `CREATE_MANUAL_TRANSACTION` vs `ADD_MANUAL_TRANSACTION`; `UPDATE_USER_PROFILE`/`UPDATE_USER_PREFERENCES` vs `UPDATE_PROFILE`/`UPDATE_PREFERENCE`; `CREATE_DECLARED_BILL` vs `ADD_DECLARED_BILL`; `SET_CATEGORY_WATCH` vs `CREATE_ALERT`; extra `UNDO_ACTION`, `DELETE_MEMORY_FACT`, `LINK_*`, `MARK_*`) | Proposals from specialists (SC names) and UI calls (current names) disagree; validators keyed by name | SC names are canonical; `WS-PLT-P1` adds a temporary alias table (old → SC name, logged), `WS-UI-P1` switches to SC names, `WS-FND-P5` deletes the aliases | **Decided:** SC names + temporary aliases |
| C-6 | Physical table names on `main` (`transactions_v1`, `goals_v1`, `caps_v1`, `outbox_events`, …) differ from Doc 2 §3 logical names (`raw_transactions`/`txn_classification`, `goals`, `caps`, `event_outbox`, …) | Plans could create duplicate tables | **D-PLAN-2:** keep physical names; `backend/src/db/TABLES.md` maps them (WS-FND-P2) | **Decided:** keep physical names (D-PLAN-2) |
| C-4 | `docs/prototype-design` is "Proposed", not yet merged/approved | All plans rely on its ADRs | `WS-FND-P1` merges it; plans proceed on assumption A-ARCH | **Decided:** design approved (A-ARCH); Doc 7 (UI screens, generated 2026-10-13) still awaits approval (TD-05) |
| C-7 | **(added 2026-10-13)** The source baseline is not yet present in the new repository | Every plan modifies or extends source-baseline files | Decided by D-PLAN-3: import `fc0981d` as the first commit of code; procedure in [`../repository-migration-notes.md`](../repository-migration-notes.md) §5.3 | **Decided** — import pending |

## 6. Decisions, assumptions and open questions (decided 2026-10-13)
| ID | Item | Decision | Consequence in the plans |
| --- | --- | --- | --- |
| A-ARCH | Build target | **Decided:** `docs/prototype-design` approved | Plans proceed as written |
| C-1 | LLM layer | **Decided:** real LLM agents (John, Atlas, Nova, Iris) with today's deterministic code as the fallback | WS-AGT, WS-JON |
| U-1 | Time available | **Decided:** 9 or more working days | D1–D9 schedule (`roadmap.md` §4) |
| D-PLAN-9 | Scope target | **Decided:** aim for Tier 3, fall back to Tier 2. Checkpoint at the end of D5: if G3 closed more than 1 day late, cut the Tier 3 items listed in `roadmap.md` §5. Tier 1 is not a planned fallback; if Tier 2 is at risk, escalate to the team lead | `roadmap.md` §5; tier notes in WS-AGT-P2, WS-JON-P2, WS-UI-P2, WS-FND-P6 |
| U-4 | Branching | **Decided:** short-lived plan branches, protected `main`, PR + review + green CI | `workstream-assignments.md` §7 |
| D-PLAN-3 | Repository | **Decided:** a new repository owned by the team lead, starting from `AryanTechie-007/JFK` `main` @ `fc0981d`. Name/link: `https://github.com/Kathir-M-03/FINNMIN-JFK-John` (recorded 2026-10-15) | Old module branches are not carried over; check branch-protection availability (§7 of the assignments) |
| D-PLAN-4 | PR granularity | **Decided:** one plan = one branch = one PR; no plan is split. Contract files a plan produces go in its first commit; the PR is opened as a Draft so consumers approve that commit; the PR merges whole with a merge commit (not squash) | README, assignments §7, execution manual §2 |
| C-5 | Action names | **Decided:** SC §13.2 names + temporary aliases (removed in WS-FND-P5) | WS-PLT-P1, WS-UI-P1, WS-FND-P5 |
| D-PLAN-2 | Table names | **Decided:** keep the physical names | `backend/src/db/TABLES.md` (WS-FND-P2) |
| D-PLAN-5 | Deferred actions | **Decided:** keep those already working on `main` (`RESTORE_GOAL`, watch → `CREATE_ALERT`, movement type → `SET_TRANSACTION_TYPE`, `CREATE_CATEGORY_RULE`); build no new deferred actions | WS-CAT-P3, WS-PLT-P1/P2, WS-UI-P1 |
| D-PLAN-6 | LLM consent default | **Decided:** off until the user opts in; demo user seeded with consent on | WS-PLT-P2, WS-JON-P1, WS-FND-P4 |
| D-PLAN-7 | Late dependency | **Decided:** the producer publishes a contract-matching stub once **half a day** late | `cross-workstream-dependencies.md` §4 |
| D-PLAN-8 | Independent review | **Decided:** mandatory only for sensitive plans (money, consent/tokens, security, shared contracts, data model) | `tracking/README.md` §3 |
| U-2 | Qwen endpoint | **Partly decided:** key and model arrive on **D3**; until then everything is built and tested with the fake provider | WS-FND-P3 (live smoke), WS-AGT-P3, WS-FND-P6 |
| D-PLAN-11 | API key handling | **Decided:** each developer's local `backend/.env` + a GitHub Actions secret for the manual live workflow; shared privately by one person; never committed | WS-FND-P3, WS-FND-P6, WS-AGT-P3 |
| D-PLAN-12 | Qwen unavailable | **Decided:** temporarily use another OpenAI-compatible provider (configuration only: `LLM_BASE_URL`, `LLM_MODEL_*`, `LLM_API_KEY`); results labelled with the model actually used | WS-AGT-P3, WS-FND-P6, WS-UI-P3 |
| D-PLAN-10 | Sentinel backtest limit | **Provisional:** monthly spend forecast within ±15 % on the held-out month; confirmed or adjusted on D4 | WS-SEN-P2 |
| D-PLAN-13 | Defaults not objected to | Golden categorization target per Doc 6 P-AC-03 (≥ 90 % of labelled rows, 0 transfers/card payments as spend); on D8, delete Backend B, legacy tables and the committed `dist/` after backing up developer databases | WS-CAT-P3, WS-FND-P5 |
| D-PLAN-1 | Team | **Decided:** four developers — Dev A Abhilash (@Falterred), Dev B Kathir (@Kathir-M-03), Dev C Anish (@DEstroy746), Dev D Aryan (@AryanTechie-007); names recorded 2026-10-15 | `workstream-assignments.md` §2.0 |

**Still open:** the source-baseline import commit (D-PLAN-3, before D1); which stand-in provider and who holds its key (before D8); whether branch protection is available on the new repository (if not, "PR + green CI before merge" is enforced by team agreement).

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
