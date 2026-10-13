# Document 4 — Component Responsibility and Interface Specifications (prototype slice)

Each section states what the prototype builds of a component, traced to its frozen specification, and what it defers. Behaviour is never redefined; the only implementation-approach change is ADR-07 (specialist runner plans), explained in §2 and in Doc 1.

Legend: **Build** = implemented in the prototype; **Defer** = not built, control hidden or disabled ("Not in prototype").

---

## 1. John — Orchestrator and Chatbot (`backend/src/agents/john/`)

**Source:** `john-orchestrator-spec.md`.

| Aspect | Prototype |
| --- | --- |
| Responsibilities (Build) | Lifecycle B.2 steps 1–14; rules router + LLM router fallback (B.3); routing table rows for all built task types (§2–§4 below), health overview, health score, chat corrections, profile/preference instructions, scope refusals; packet building with context budgets (B.4); parallel dispatch ≤ 3, **one dependency edge** (B.5); validation checks 1–11 (B.6); conflict rules 1–5 incl. Sentinel arbitration (B.7); one question at a time (B.8); proposals via Action Service, cards, T1 chips, rule-detected chat T1 execution with Undo, typed-confirmation refusal, result reporting (B.9); categorization in chat incl. merchant-scope dry run and `SPECIALIST_HINT` review items (B.10); direct answers (B.11); synthesis + grounding with one regenerate and deterministic fallback (B.12); threads, turns, rolling summary (G.4) |
| Defer | Reconcile round (B.5); memory facts and `goal_priority_order` (G.3 — packets carry an empty array); alert-narrative cache (C.4); consent prompt UX beyond a Settings toggle |
| Non-responsibilities | Arithmetic, categorization, execution, authorization (unchanged) |
| Inputs | `ChatRequest@1` (incl. `UI_ACTION`, `ALERT_OPEN`, `answer_to`); session |
| Outputs | `ChatResponse@1` SSE blocks: `TEXT`, `CARD`, `CHIP`, `QUESTION`, `UNDO`, `NOTICE`, `LINK` |
| Dependencies | Categorizer (status, search, `addReviewItem`), Snapshot, Profile (preferences), Gateway (JOHN allowlist), specialists, Action Service, Budget Monitor (`getAlert`), LLM Adapter |
| Interfaces | `handleMessage(req, session, emit)`, `onVersionEvent(event)` |
| Data access | Own tables only (`chat_*`, `rolling_summaries`); everything else through module interfaces |
| State / mutations | Writes chat tables; creates proposals and executes T1 instructions **only** through the Action Service |
| Errors / uncertainty | John §I matrix; conservative headline; data-quality caveats; partial labels |
| Validation | Request schema; router output schema; specialist response checks; proposal param binding; grounding |
| Router rules file | `routing/routing-rules.json`: ordered patterns with entity extractors (amount `₹?\d[\d,]*(\.\d{1,2})?`, months, dates, goal names from DB, category synonyms, merchant names from Categorizer). Confidence = exact rule hit with all required entities → no LLM router call |
| LLM calls per request | Router (only if rules not confident) + specialists + synthesis (+1 regenerate) ≤ 6 |
| Tests | Routing table unit tests (≥ 100 labelled phrasings for built task types), validator fixtures for each of B.6 checks, conflict scenarios, grounding binder (Indian grouping), typed-confirmation refusal, rule-detected T1 vs router-only chip, fake-LLM integration of F4/F5, live smoke (Doc 6) |

**Routing table (prototype rows)** — subset of John §B.3.2:
| Signal | Destination |
| --- | --- |
| Goal progress/ETA; "can I add X to goal Y"; create goal; review goals; SIP | ATLAS `GOAL_PROGRESS` / `EVALUATE_FUND_ADDITION` / `CREATE_GOAL` / `GOAL_PLAN_REVIEW` / `SIP_PROJECTION` |
| Edit/pause/release/delete goal via chat | LINK block to the Atlas form (task types deferred) |
| Cap status; overspend this month; change a cap; odd charge | NOVA `LIVE_STATUS` / `PROPOSE_REBALANCE` / `ADJUST_CAP_REQUEST` / `EXPLAIN_ANOMALY` |
| Next month plan; purchase affordability; bills; recurring overspend; "is next month OK" | IRIS `MONTHLY_PLAN` / `WHAT_IF_PURCHASE` / `BILL_OUTLOOK` / `OVERSPEND_DIAGNOSIS` / `PLAN_REVIEW` |
| Alert opened | CAP_TIER → NOVA `BREACH_EVENT`; ANOMALY → NOVA `EXPLAIN_ANOMALY`; CASHFLOW_RISK → IRIS `BILL_OUTLOOK` |
| Dependency edge (pressure/capacity hints) | ATLAS `HANDLE_PEER_FINDING` |
| Corrections, review items | John + Categorizer |
| Health overview / health score / chart explain / greetings | John direct |
| Money movement, investment advice, credit, tax | Refusal |

---

## 2. Shared specialist runner (`backend/src/agents/shared/runner.js`) — ADR-07

The three specialists share one runner; each supplies a config `{taskTypes: {<TYPE>: {plan, optionalTools, proposals, budget}}, promptVersion, domainSchema}`.

```
run(config, packet, {signal}):
  1. validate packet (TaskPacket@1 + task_params schema) → ERROR/INVALID_INPUT without LLM if invalid
  2. PLAN: execute config.taskTypes[type].plan — ordered steps {tool, params(packet, priorResults), when(priorResults)} via gateway
       (conditional steps evaluated by code from task params and prior results, e.g. "if date ≤ 30 days → cash-flow risk")
  3. LLM call #1 (modelClass SPECIALIST, JSON schema "SpecialistDraft"): inputs = system prompt, packet (minimised),
       results catalogue [{tool_result_id, function, confidence, data (aggregates only)}]
       output = either {need_tools: [{tool, params}] ≤ 3}  or  a full draft response
  4. If need_tools: execute allowlisted, budget-checked calls; LLM call #2 for the draft (no further tool requests)
  5. Proposal validation: for each proposed action call its validator (config.proposals[action].validator, params mapped exactly)
       → PASS: set validation_tool_result_id; REJECTED: drop proposal, add constraint (source VALIDATOR) and keep explanation
  6. Post-checks: schema, placeholders resolve to cited results, IDs known, headline rule, task-specific checks (postprocess.js)
       → one repair LLM call on failure (max 3 LLM completions per task in total), else ERROR SCHEMA_VIOLATION
  7. return SpecialistResponse@1
```
Budgets: plan + optional + validator calls ≤ the task's `max_tool_calls`; deadline from packet; AbortSignal honoured at every await. The runner never writes and never calls anything but the gateway and the LLM adapter.

---

## 3. Atlas — Savings Strategist (`backend/src/agents/atlas/`)

**Source:** `atlas-savings-strategist-spec.md`.

| Task type | Prototype | Plan (runner) | Proposals |
| --- | --- | --- | --- |
| `GOAL_PROGRESS` | Build | goal_progress | — |
| `CREATE_GOAL` | Build | validate_goal_change{CREATE} → if PASS goal_feasibility | `CREATE_GOAL` (not on SHORTFALL) |
| `EVALUATE_FUND_ADDITION` | Build | validate{ADD_FUNDS} → check_available_balance → [feasibility if new monthly add] → goal_progress | `ADD_FUNDS` (+ `UPDATE_GOAL` depends_on) |
| `GOAL_PLAN_REVIEW` | Build | surplus_baseline → feasibility{0, null} → goal_progress per ACTIVE goal (≤ 8 calls) | up to 3 `UPDATE_GOAL`/`SET_GOAL_MONTH_OVERRIDE` |
| `HANDLE_PEER_FINDING` | Build | feasibility → goal_progress(target per Atlas B.2 tie-breakers) | `SET_GOAL_MONTH_OVERRIDE` / `UPDATE_GOAL` |
| `SIP_PROJECTION` | Build | project_sip (rate required; else NEEDS_INPUT) | — |
| `UPDATE_GOAL`, `SET_GOAL_STATUS`, `EVALUATE_FUND_RELEASE`, `DELETE_GOAL` (chat) | **Defer** — forms in the Atlas workspace perform these deterministically | — | — |

| Aspect | Prototype |
| --- | --- |
| Inputs / outputs | `TaskPacket@1` → `SpecialistResponse@1` with `AtlasDomain@1` |
| Dependencies | Runner, Gateway (ATLAS allowlist), LLM Adapter |
| Data access / state | None directly; stateless |
| Errors / uncertainty | Atlas §I; conservative date headline; `INCOME_BASIS_UNCERTAIN` handling |
| Validation | Atlas §B.2 rules 1–12 enforced by runner post-checks (`postprocess.js`) |
| Workspace (deterministic) | Atlas §B.4 rows except "Recently deleted" (`RESTORE_GOAL` deferred) |
| Tests | ATL-AC-01, 03, 05, 06, 07, 08, 10, 12, 13, 14 with fake LLM fixtures; live smoke cases for GOAL_PROGRESS and EVALUATE_FUND_ADDITION |

Replaces the current `src/agents/atlas/AtlasAgent.js` stub (hardcoded `delay_days`, fabricated result IDs).

---

## 4. Nova — Budget Guardian (`backend/src/agents/nova/`)

**Source:** `nova-budget-guardian-spec.md`.

| Task type | Prototype | Plan | Proposals |
| --- | --- | --- | --- |
| `LIVE_STATUS` | Build | utilization per category (≤ 3) → velocity; or velocity(ALL_CAPPED) → utilization for ≤ 2 OVER | — (question offering rebalance) |
| `BREACH_EVENT` | Build | utilization → velocity → rebalance_simulation → [validate_cap_change] | `APPLY_REBALANCE` / `ADJUST_BUDGET_CAP{MONTH}` / `DISMISS_ALERT` on request |
| `EXPLAIN_ANOMALY` | Build (also used for opened ANOMALY alerts) | detect_anomalies(35) → [ledger_summary 6m] | — (`CREATE_ALERT` watch deferred) |
| `PROPOSE_REBALANCE` | Build | rebalance_simulation → utilization | `APPLY_REBALANCE` |
| `ADJUST_CAP_REQUEST` | Build | validate_cap_change → utilization | `ADJUST_BUDGET_CAP` |
| `ANOMALY_EVENT` | **Defer** (routing maps opened anomaly alerts to `EXPLAIN_ANOMALY`) | — | — |

| Aspect | Prototype |
| --- | --- |
| Reuse | `NovaGuardianView.jsx/.css` (UI), `PlaceholderBinder.js` and `UntrustedTextSanitizer.js` (→ `shared/grounding`), tier logic from `NovaGuardianEngine.js` (→ Sentinel utilization) |
| Replace | `NovaAgentBrain` templated text → LLM specialist via runner; `/api/nova/telemetry/*` endpoints → `/api/v1/workspaces/nova` and chat |
| Errors / uncertainty | Nova §I; provisional labelling; shortfall → `GOAL_FUNDING_PRESSURE` hint |
| Validation | Nova §B.2 rules 1–12 (rebalance params equal Sentinel transfers; no protected/FIXED donors; T1 chips) |
| Workspace (deterministic) | Nova §B.5 all rows incl. "Log expense" (`ADD_MANUAL_TRANSACTION`) |
| Tests | NOV-AC-02, 03, 05, 08, 10, 11, 12, 13, 14, 15 (with Monitor and Action Service integration) |

---

## 5. Iris — Spending Advisor (`backend/src/agents/iris/`)

**Source:** `iris-spending-advisor-spec.md`.

| Task type | Prototype | Plan | Proposals |
| --- | --- | --- | --- |
| `MONTHLY_PLAN` | Build | surplus_baseline → ledger_summary(3) → forecast_bill_outlays → simulation(baseline) → [simulation(plan) → validators] | `ADJUST_BUDGET_CAP{MONTH}` ≤ 3; `CREATE_GOAL` or `SET_GOAL_MONTH_OVERRIDE` ≤ 1 |
| `WHAT_IF_PURCHASE` | Build | simulation(one_off) → [cash-flow if ≤ 30 days] → [if risk ≠ LOW: simulation(moved date) ; validate SET_MONTH_OVERRIDE + simulation(goal_changes)] | `SET_GOAL_MONTH_OVERRIDE` ≤ 1 |
| `BILL_OUTLOOK` | Build | forecast_bill_outlays → flag_cashflow_risk(outlays as ResultRef) | — |
| `OVERSPEND_DIAGNOSIS` | Build | ledger_summary(6, category) → detect_anomalies(90) → simulation(next month, cap_changes) → validate_cap_change{STANDING} → [goal validator + feasibility] → [rebalance if current-month overspend] | `ADJUST_BUDGET_CAP{STANDING}`, `UPDATE_GOAL`, `APPLY_REBALANCE` (≤ 1 each) |
| `PLAN_REVIEW` | Build | simulation(target month) | — |

| Aspect | Prototype |
| --- | --- |
| Correction to existing code | `branch-manifest.json` describes Iris as "Subscription & Recurring Specialist"; the spec defines a forward-looking Spending Advisor. Subscriptions are declared recurring bills (Sentinel workspace) that Iris reads through `forecast_bill_outlays` |
| Reuse | `IrisAdvisorView.jsx` simulator slider → `POST /workspaces/iris/simulate` with `category_adjustments` on `FOOD.DELIVERY` |
| Errors / uncertainty | Iris §I; conservative-first; `GOAL_COMMITMENT_CONFLICT` ⇒ no cap proposal; uncategorized line + "Review N" step |
| Validation | Iris §B.2 rules 1–11, especially amount-source rule (suggested amounts equal cited Sentinel fields or user numbers) |
| Tests | IRS-AC-01, 03–06, 08, 09, 12–14 |

---

## 6. Sentinel — Financial Observer and Predictor (`backend/src/engines/sentinel/`)

**Source:** `sentinel-financial-observer-spec.md`.

| Aspect | Prototype |
| --- | --- |
| Functions (Build — all 17) | surplus_baseline, ledger_summary, spending_timeseries, spending_simulation, category_utilization, velocity_projection, detect_anomalies, rebalance_simulation, validate_cap_change, goal_progress, goal_feasibility, validate_goal_change, check_available_balance, forecast_bill_outlays, flag_cashflow_risk, compute_health_score, project_sip |
| Simplifications | Snapshot inputs read current state with `assertCurrent` (ADR-05). Statistical methods use the spec's starting rules verbatim (nearest-rank P80, ±5-day cadence tolerance, k = 3 spikes); documented in `engines/sentinel/METHODS.md`; no backtest gate (SEN-AC-08 deferred to production) |
| Reuse | `src/tools/sentinel/runCategoryUtilization.js`, `runVelocityProjection.js`, `detectAnomalies.js`, `runRebalanceSimulation.js`, `validateCapChange.js`, `getLedgerSummary.js` → ported (paise, SC taxonomy, exclusive cap partition, `SentinelResult@1`) |
| Inputs | Snapshot (SC §7.2) via read helpers on a `query_only` connection |
| Outputs | `SentinelResult@1` (SC §10.2) with `confidence`, `variance_band`, `data_quality`, `constraint_codes` |
| Rule library | `rules/goal.js`, `rules/cap.js`, `rules/rebalance.js`, `rules/balance.js`, `rules/profile.js` — imported by the Action Service |
| Registry | `registry/1.0.0.json` with every SC/Sentinel §C.4 key |
| State / mutations | None (read-only connection enforced by `PRAGMA query_only = ON`) |
| Errors | Sentinel §I (`INVALID_INPUT`, `SNAPSHOT_NOT_FOUND`, `DATA_STALE`, `INSUFFICIENT_HISTORY`, `UNKNOWN_ENTITY`, `TIMEOUT`, `INTERNAL_ERROR`) |
| Validation | Param schemas per function; identity params and literal facts rejected |
| Workspace | Sentinel §B.6.18 (spending, trends, forecast, bills panel, overview, transactions, review list) |
| Tests | SEN-AC-01 (golden ≥ 3 cases/function), 02, 03, 05, 06, 07, 09, 13, 14, 16, 17, 18, 19, 20; determinism replay |

---

## 7. Item Categorizer (`backend/src/engines/categorizer/`) and Ingestion (`backend/src/platform/ingestion/`)

**Source:** `item-categorizer-spec.md`; SC §17.7.

| Aspect | Prototype |
| --- | --- |
| Pipeline (Build) | Steps 1 validate/store raw; 2 normalize; 3 re-delivery + supersession (pending→posted, manual→bank); 4 movement typing (a matched own-account pairs, b card-payment pairs and `counterpart_missing`, c refunds/reversals/chargebacks with `REFUND_OF`, d cash, e fees/interest (credit interest → INCOME), f EMI, g P2P, h/i expense/income); 5 merchant match (user alias, global alias, VPA); 6 rules (E1 user history/rules, E2 alias, E3 keyword/MCC); 9 confidence; 10 persist + event, chunked |
| Pipeline (Defer) | 7 classifier and 8 LLM (off by spec); own-account counterparty list (4a second clause; action deferred); fuzzy merchant candidates (E4) |
| Corrections (Build) | `RECATEGORIZE_TRANSACTION` (TRANSACTION, MERCHANT with dry run and matching-key rule), `CONFIRM_CATEGORY`, `UNDO_CLASSIFICATION_CHANGE`, `DISMISS_REVIEW_ITEM`, `ADD_MANUAL_TRANSACTION` |
| Corrections (Defer) | `SET_TRANSACTION_TYPE`, `CONFIRM_LINK`/`BREAK_LINK`, `RESOLVE_DUPLICATE`, `MARK_OWN_ACCOUNT_COUNTERPARTY`, rule CRUD, taxonomy migrations. Review items whose resolution needs them show the reason and a disabled control |
| Ingestion (Build) | Canonical JSON; CSV with `MappingProfile@1` `demo-bank-v1`; idempotency; accounts and balances to Profile |
| Ingestion (Defer) | camt.053/054 adapters, signed external endpoint, SFTP |
| Reuse | Keyword lists from `TallyCategorizer.js` → `seed/global-rules.json` mapped to SC leaf IDs; `TaxonomyRegistry.js` replaced by the SC taxonomy seed; Spending Analyser and Statement Import UI reused in the Sentinel workspace |
| Outputs | `ClassificationResult@1`, `DataQuality@1` status, `categorization.updated` |
| State | Sole writer of its tables (Doc 2 §3.3) |
| Errors | Categorizer §I |
| Tests | CAT-AC-01…07, 09, 10, 11, 13, 14, 15, 16, 18; golden set of ≥ 120 labelled demo rows incl. transfers, card payments, refunds, reversals, duplicates, pending, manual |

---

## 8. Platform services (shared foundations)

| Service | Build | Defer |
| --- | --- | --- |
| Action Service + Plan Store (`platform/action-service`) | Proposal store and lifecycle; tokens (DB-backed, hashed); idempotency; base-version check; rule-library re-validation at create and execute; policy checks (proposer rights, `override_protected` origin); executors; ledger; verify; undo for T1; reconcile job | Undo for T2 beyond goal/cap inverses already covered; operator tools |
| Profile Service (`platform/profile`) | Accounts, balances (precedence, staleness), profile + fixed lines, preferences, declared bills | Balance history |
| Budget Monitor (`platform/budget-monitor`) | Event-triggered tier alerts with dedupe and hygiene; `plan.changed` and `period.rolled` triggers; daily scan (anomaly + cash-flow) at startup and on demand | Schedule at 06:00 (runs at startup/demo trigger instead) |
| Snapshot Service (`platform/snapshot`) | Create/get/assertCurrent | Temporal reads |
| Tool Gateway (`platform/gateway`) | Allowlist (SC §10.4), identity injection, ResultRef resolution, per-request budget (12), dedupe, `tool_results` store, `verifyResultOwnership`, arbitration flag | — |
| Events (`platform/events`) | Outbox, dispatcher, delivery tracking, retries, dead letter, job locks | Separate worker process |
| LLM Adapter (`platform/llm`) | `openai_compat` (Qwen 32B-class), `fake` (tests only), JSON-schema output, timeouts, circuit breaker, token usage in traces | `gemini_vertex` provider |

### 8.1 Prototype action subset (from SC §13.2)
| Action | Tier | Built initiators | Undo |
| --- | --- | --- | --- |
| `CREATE_GOAL`, `UPDATE_GOAL`, `SET_GOAL_STATUS`, `SET_GOAL_MONTH_OVERRIDE`, `ADD_FUNDS`, `RELEASE_FUNDS` | T2 | Atlas forms; Atlas/Iris proposals per §3/§5 | — (inverse via another card) |
| `DELETE_GOAL` | T3 | Atlas form | — (`RESTORE_GOAL` deferred) |
| `ADJUST_BUDGET_CAP`, `REMOVE_CAP` | T2 | Nova form; Nova/Iris proposals | — |
| `APPLY_REBALANCE` | T2 | Nova "Cover this overspend"; Nova/Iris proposals | — |
| `DISMISS_ALERT` | T1 | Alert card; Nova chip | Yes |
| `RECATEGORIZE_TRANSACTION` | T1 (TRANSACTION) / T2 (MERCHANT) | Transaction list; John chat | T1: yes |
| `CONFIRM_CATEGORY`, `DISMISS_REVIEW_ITEM` | T1 | Review list, chips | Yes |
| `UNDO_CLASSIFICATION_CHANGE` | T1 | Undo control | — |
| `ADD_MANUAL_TRANSACTION` | T1 | Nova "Log expense" | Yes (internal tombstone) |
| `ADD_DECLARED_BILL`, `DELETE_DECLARED_BILL` | T1 | Sentinel bills panel | Yes |
| `UPDATE_PROFILE` | T2 | Settings; onboarding; John card | — |
| `UPDATE_PREFERENCE` | T1 | Settings; John rule-detected instruction | Yes |
| `PERIOD_ROLLOVER` | SYSTEM | Scheduler | — |

All other registry actions: deferred (Overview §3.2).
