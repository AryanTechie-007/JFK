# Iris — Spending Advisor — Component Specification

| Attribute | Value |
| --- | --- |
| File | `docs/specifications/iris-spending-advisor-spec.md` |
| Component ID | `IRIS` (code module `agents/iris`) |
| Version | 5.0.0 (requirements freeze) — supersedes *Iris Agent Specification V4* |
| Kind | Stateless LLM specialist, forward-looking. Invoked only by John with a `TaskPacket@1`. No write tools. |
| User-facing surface | **Iris workspace** (SC §18): deterministic next-month planner and purchase what-if (Sentinel simulation, no LLM) plus an embedded chat panel (`ui_context.workspace = IRIS`) |
| Shared contracts | `system-contracts.md`: SC §6.4 budget equation, §9 protocol, §10 tools, §11 grounding, §12 codes, §13 actions (incl. month overrides, D-005/D-019) |
| Decisions applied | D-005, D-006, D-007 (proactivity = deterministic daily scan + lazy narrative), D-010, D-012, D-016, D-019 |

---

## A. Identity and purpose

### A.1 Mission
Prevent shortfalls before they happen: turn Sentinel's forecasts and simulations into a clear plan for upcoming spending, warn early about bills and cash-flow pinches, and propose plan changes for the user to approve.

### A.2 Persona (observable rules)
Empathetic, clear, constructive, forward-looking; no jargon, no scolding. Uses Sentinel's `risk_level` words exactly; never invents probabilities.

### A.3 How "proactive" is delivered (D-007)
Iris is never run by a schedule. Proactivity comes from the Budget Monitor's deterministic daily scan, which creates `CASHFLOW_RISK` alerts; when the user opens one, John invokes Iris with `BILL_OUTLOOK` and the alert in `task_params`. This keeps every LLM call user-initiated and bounded.

### A.4 Responsibilities
1. Monthly plans for the current or next months (`MONTHLY_PLAN`, `PLAN_REVIEW`).
2. Purchase what-ifs with options (`WHAT_IF_PURCHASE`).
3. Upcoming bills and cash-flow warnings (`BILL_OUTLOOK`).
4. Diagnosis of recurring overspend with a corrected plan (`OVERSPEND_DIAGNOSIS`).
5. Propose cross-domain changes — month or standing cap adjustments, rebalances, goal creation, goal updates and temporary goal reductions — each validated by Sentinel.
6. Emit `SAVINGS_CAPACITY` and `MISCATEGORIZATION_SUSPECTED` hints.

### A.5 Explicit exclusions
Parsing data, computing, running regressions or simulations itself; live cap status and alert explanations for cap tiers (Nova); goal lifecycle advice beyond plan-driven proposals (Atlas); recategorization; reducing a protected category; investment advice; real money movement, auto-sweeps, recurring transfer rules; "split the payment" or "move the date" as executable actions (advice only, D-019).

### A.6 Boundaries
| Component | Relationship |
| --- | --- |
| JOHN | Sole caller; arbitrates conflicts with Atlas/Nova by Sentinel simulation (John §B.7). |
| SENTINEL | Tools via gateway, IRIS allowlist row (SC §10.4). |
| ATLAS, NOVA | No contact. Their findings arrive as `peer_findings` (Nova's `RECURRING_ANOMALY`, Atlas's `GOAL_COMMITMENT`). Nova and Atlas own the constraints of their domains through the validators Iris must call. |

### A.7 Task types
`MONTHLY_PLAN`, `WHAT_IF_PURCHASE`, `BILL_OUTLOOK`, `OVERSPEND_DIAGNOSIS`, `PLAN_REVIEW`.

---

## B. Functional requirements

### B.1 Preconditions
As Atlas B.1 (`specialist = IRIS`).

### B.2 Workflow per task type
| Task type | Required `task_params` | Calls (order) | Possible proposals (max) | Validation cited |
| --- | --- | --- | --- | --- |
| `MONTHLY_PLAN` (budget 8) | `target_month` | `sentinel_get_surplus_baseline` → `sentinel_get_ledger_summary{timeframe_months: 3}` → `sentinel_forecast_bill_outlays{horizon_days: to end of target month}` → `sentinel_run_spending_simulation{target_month}` (baseline) → *if a plan change is warranted*: `sentinel_run_spending_simulation{target_month, cap_changes, goal_changes?}` (plan) → `sentinel_validate_cap_change{scope: MONTH, period: target_month}` per proposed cap / `sentinel_validate_goal_change` per goal proposal | `ADJUST_BUDGET_CAP{scope: MONTH}` (3); `CREATE_GOAL` or `SET_GOAL_MONTH_OVERRIDE` (1) | cap / goal validator |
| `WHAT_IF_PURCHASE` (budget 6) | `amount_minor`, `date`, `label` | `sentinel_run_spending_simulation{target_month: month of date, one_off_outlays}` → *if date ≤ 30 days away*: `sentinel_flag_cashflow_risk{horizon_days: 30}` → *if `risk_level ≠ LOW`*: option A "move the date": simulation with the outlay in the next month (advice only); option B "lower a goal contribution temporarily": `sentinel_validate_goal_change{SET_MONTH_OVERRIDE}` + simulation with `goal_changes` | `SET_GOAL_MONTH_OVERRIDE` (1) | goal validator |
| `BILL_OUTLOOK` (budget 3) | `horizon_days` (default 30); `alert_id?` | `sentinel_forecast_bill_outlays` → `sentinel_flag_cashflow_risk{outlays: {"$ref": "<forecast>:/data/outlays"}}` | none | — |
| `OVERSPEND_DIAGNOSIS` (budget 8) | `category_id` | `sentinel_get_ledger_summary{timeframe_months: 6, category_scope: [category]}` → `sentinel_detect_anomalies{lookback_days: 90}` → `sentinel_run_spending_simulation{target_month: next month, cap_changes: [corrected cap]}` → `sentinel_validate_cap_change{scope: STANDING}` → *optional*: `sentinel_validate_goal_change{UPDATE}` + `sentinel_run_goal_feasibility` for a goal funded by the difference → *if overspend is in the current month*: `sentinel_run_rebalance_simulation` | `ADJUST_BUDGET_CAP{scope: STANDING}` (1); `UPDATE_GOAL` (1); `APPLY_REBALANCE` (1) | cap / goal validator; rebalance result |
| `PLAN_REVIEW` (budget 2) | `target_month?` (default current) | `sentinel_run_spending_simulation{target_month}` | none | — |

Rules for all task types:
1. **No local computation.** Every figure is a placeholder (SC §11). Plans that cannot be simulated are not stated as numbers.
2. **Where suggested amounts come from.** A suggested cap must equal a field of a cited simulation's `category_plan` (`baseline_outflow_minor` or `p80_outflow_minor`) or a number the user gave; a goal override amount must equal 0 (pause), the user's number, or `allocation_outcome.unallocated_signed_minor` when positive. Iris never invents an amount.
3. **Headline.** If `confidence ≠ HIGH` or `risk_comfort = CONSERVATIVE`, Iris leads with `conservative_end_balance_signed_minor` / `conservative_available_signed_minor` and states the uncertainty in plain words (SC §11.4).
4. **Risk language.** Uses `risk_level` (`LOW`, `MEDIUM`, `HIGH`) exactly as Sentinel defines it; no percentages of likelihood.
5. **Cross-agent harmony.** Before proposing a cut or a contribution change Iris uses the simulation (which reads active goals and caps) and preferences (protected categories). If the simulation returns `GOAL_COMMITMENT_CONFLICT`, Iris returns that constraint and **no cap proposal** (preserves V4 Pattern B). Iris never proposes a reduction of a protected category (the gateway forces `override_protected: false`).
6. **Data quality.** Iris reads `data_quality` first. When `uncategorized_amount_minor` or `needs_review_count` is material to the plan (uncategorized ≥ 10 % of the window's spend, or any provisional amount in a category she proposes to change), she: (a) adds a `data_quality_notes` entry, (b) shows the uncategorized amount as its own plan line (never allocates it to a category), and (c) adds an `actionable_steps` item "Review N transactions" with `navigation: REVIEW_LIST` (N bound to `{{status:/needs_review_count|count}}`); it is navigation, not a proposal. Coverage below Sentinel's floor → `LOW_CATEGORIZATION_COVERAGE` in 100 % of cases.
7. **Merchant-level advice** only for merchants in a cited ledger summary's `top_merchants` (Sentinel includes only resolved merchants from CONFIRMED/AUTO rows).
8. **Peer hints.** Positive `unallocated` in a plan → `SAVINGS_CAPACITY` (target `ATLAS`). Nova's `RECURRING_ANOMALY` in `peer_findings` is cited in `BILL_OUTLOOK`/`MONTHLY_PLAN`.
9. **No recategorization.** Suspicion → `MISCATEGORIZATION_SUSPECTED` hint.
10. **Advice-only options (D-019).** "Split the payment" and "move the date" are `RECOMMENDATION` findings, optionally backed by a simulation; they never become proposals.
11. **Dependent proposals.** When a plan has a cap change and a goal change that must be confirmed together for the simulated outcome to hold, the second carries `depends_on_action_ref`; John renders them as separate cards confirmed in order.

### B.3 Clarification and refusal
| Situation | Behaviour |
| --- | --- |
| Target month ambiguous | `NEEDS_INPUT` (options: this month / next month / the month after) |
| Purchase date missing | `NEEDS_INPUT` with options (this week / next month / pick a date via free text) |
| Not enough history (< 3 months) | `PARTIAL`; say what is missing; qualitative guidance only; no numbers from a failed simulation |
| Investment or money-movement ask | `CAVEAT` scope statement |
| Validator REJECTED for a proposal | Drop that proposal; explain the rule in plain language |
| Conflicting peer finding | Return both facts as constraints/findings; do not choose silently |
| Stale data / import in progress | `PARTIAL` if the answer would materially change (incomplete data in the categories she plans for); otherwise caveat and proceed |

### B.4 Iris workspace (deterministic, no LLM)
| UI element | Endpoint | Sentinel calls | Action |
| --- | --- | --- | --- |
| Planner: target month, per-category adjustment sliders, cap/goal what-ifs | `POST /api/v1/workspaces/iris/simulate` | `run_spending_simulation` | "Apply this plan" → `ADJUST_BUDGET_CAP{scope: MONTH}` cards (proposer USER) |
| Purchase what-if | same with `one_off_outlays` | simulation, `flag_cashflow_risk` | — |
| Upcoming bills strip | `GET /api/v1/workspaces/iris` | `forecast_bill_outlays` | — |
| "Ask Iris" panel | `/api/v1/chat` (`workspace: IRIS`) | via John | — |
The existing "Before vs After" delivery-frequency slider maps to `category_adjustments` on `FOOD.DELIVERY` (the result shows Sentinel's numbers, not client-side arithmetic).

### B.5 Acceptance criteria
| ID | Requirement | Criterion |
| --- | --- | --- |
| IRS-AC-01 | B.2 rule 1 | Zero ungrounded numbers in Iris's eval set |
| IRS-AC-02 | F | Allowlist has no write tools |
| IRS-AC-03 | B.2 | No proposal reaches the user that a Sentinel validator rejected |
| IRS-AC-04 | C.2 | Every actionable step implying a state change links to an `action_ref`; review steps link to `REVIEW_LIST` and have no proposal |
| IRS-AC-05 | B.2 rule 3 | With non-high confidence or CONSERVATIVE, the conservative figure leads in 100 % of cases |
| IRS-AC-06 | B.2 rule 4 | Risk wording matches `risk_level` in every case |
| IRS-AC-07 | SC §13.2 | Iris never proposes anything outside the registry or outside her proposer rights |
| IRS-AC-08 | B.2 | Sentinel call sequences match B.2 per task type |
| IRS-AC-09 | B.2 rule 6 | Coverage below floor → `LOW_CATEGORIZATION_COVERAGE` in 100 % of cases |
| IRS-AC-10 | B.2 rule 7 | No merchant-level claim about a merchant absent from a cited `top_merchants` |
| IRS-AC-11 | A.5 | No recategorization action |
| IRS-AC-12 | B.2 rule 2 | Every suggested amount equals a cited Sentinel field or the user's number |
| IRS-AC-13 | B.2 rule 5 | `GOAL_COMMITMENT_CONFLICT` ⇒ no cap proposal |
| IRS-AC-14 | B.2 rule 10 | "Split"/"move date" never appear as proposals |

---

## C. Data contracts

### C.1 `task_params`
```json
{
 "MONTHLY_PLAN":        {"required": ["target_month"], "properties": {"target_month": {"type": "string", "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])$"}}},
 "WHAT_IF_PURCHASE":    {"required": ["amount_minor", "date", "label"], "properties": {"amount_minor": {"type": "integer", "minimum": 1}, "date": {"type": "string", "format": "date"}, "label": {"type": "string", "maxLength": 40}}},
 "BILL_OUTLOOK":        {"properties": {"horizon_days": {"type": "integer", "minimum": 1, "maximum": 60}, "alert_id": {"type": "string"}, "alert": {"$ref": "Alert@1"}}},
 "OVERSPEND_DIAGNOSIS": {"required": ["category_id"], "properties": {"category_id": {"type": "string"}}},
 "PLAN_REVIEW":         {"properties": {"target_month": {"type": "string"}}}
}
```

### C.2 Output: `SpecialistResponse@1` with `domain: IrisDomain@1`
```json
{"$id": "IrisDomain@1", "type": "object", "additionalProperties": false,
 "required": ["kind", "spending_plan_guide", "proactive_warnings", "actionable_steps"],
 "properties": {
  "kind": {"const": "IrisDomain@1"},
  "simulation_tool_result_id": {"type": ["string", "null"]},
  "spending_plan_guide": {"type": "array", "maxItems": 16, "items": {"type": "object", "required": ["line", "rationale"],
     "properties": {
      "line": {"type": "string", "description": "A category_id or the literal \"UNCATEGORIZED\""},
      "suggested_cap_text": {"$ref": "Finding@1", "description": "Placeholder bound to a simulation category_plan field; absent for the UNCATEGORIZED line"},
      "rationale": {"$ref": "Finding@1"},
      "action_ref": {"type": ["string", "null"]}}}},
  "proactive_warnings": {"type": "array", "maxItems": 5, "items": {"type": "object", "required": ["finding", "tool_result_id"],
     "properties": {"finding": {"$ref": "Finding@1"}, "tool_result_id": {"type": "string"}, "severity": {"enum": ["HIGH", "MEDIUM", "LOW"]}}}},
  "actionable_steps": {"type": "array", "maxItems": 6, "items": {"type": "object", "required": ["order", "finding"],
     "properties": {"order": {"type": "integer", "minimum": 1}, "finding": {"$ref": "Finding@1"}, "action_ref": {"type": ["string", "null"]}, "navigation": {"enum": ["REVIEW_LIST", null]}}}}
 }}
```
`headline` (SC §9.4) is the executive summary.

### C.3 Proposal params
| Action | Params | Binding |
| --- | --- | --- |
| `ADJUST_BUDGET_CAP` | `{category_id, new_cap_minor, scope, period?}` | Equal to `validate_cap_change` params; `new_cap_minor` equal to a cited `category_plan` field or the user's number |
| `APPLY_REBALANCE` | `{period, transfers[]}` | Equal to the rebalance result |
| `CREATE_GOAL` | as Atlas C.3 | `validate_goal_change{CREATE}` + feasibility |
| `UPDATE_GOAL` | as Atlas C.3 | `validate_goal_change{UPDATE}` + feasibility |
| `SET_GOAL_MONTH_OVERRIDE` | `{goal_id, period, monthly_add_minor}` | `validate_goal_change{SET_MONTH_OVERRIDE}` |
Iris's `CREATE_GOAL` uses the name and target the user stated; without them she returns a `SAVINGS_CAPACITY` hint and a `RECOMMENDATION` instead of a proposal (John may ask Atlas).

### C.4 Bad data behaviour
| Condition | Behaviour |
| --- | --- |
| Sentinel error/timeout | `ERROR`, no numbers |
| `INSUFFICIENT_HISTORY` | `PARTIAL`, qualitative guidance |
| Category uncertain | Use provisional category as Sentinel reports; mark provisional in notes |
| Category missing | Uncategorized line; never guessed |
| Corrected after answer | Next request runs on a new snapshot; John discards the cached result |
| Malformed tool output | Runner retries once; then `ERROR` |

---

## D. Agent reasoning and workflow
- **Decisions Iris owns:** whether a plan change is warranted (risk not `LOW`, a category overrun, or the user asked); which categories to adjust (largest overruns first, never protected or FIXED); which goal to reduce temporarily (lowest priority, then latest deadline); wording and ordering of steps.
- **Order and stop rules:** baseline facts before simulations; simulation before validators; stop proposing once a MANDATORY failure occurs for that item; never exceed the per-task budget (B.2).
- **Evidence kinds:** historical totals `FACT`; surplus `CALCULATION`; averages `ESTIMATE`; simulations, forecasts, cash-flow flags `PREDICTION`; plan `RECOMMENDATION`; coverage notes `CAVEAT`.
- **Limits:** one session, one repair retry, no loops, no peer calls.

---

## E. Communication and integration
| Direction | Counterpart | Message | Mode |
| --- | --- | --- | --- |
| In | JOHN | `TaskPacket@1` (`trigger` USER_MESSAGE / UI_ACTION / ALERT_OPEN) | Async in-process, AbortSignal |
| Out | Gateway → SENTINEL | `ToolCall@1`; `outlays` passed as `ResultRef` | Sync |
| Out | JOHN | `SpecialistResponse@1` | Return |
Iris may run in parallel with Atlas and Nova. Her `SAVINGS_CAPACITY` hint may feed Atlas as the single dependency edge in a request.

---

## F. Tools and permissions
Allowed: `sentinel_get_surplus_baseline`, `sentinel_get_ledger_summary`, `sentinel_run_spending_simulation`, `sentinel_detect_anomalies`, `sentinel_run_rebalance_simulation`, `sentinel_validate_cap_change`, `sentinel_run_goal_feasibility`, `sentinel_validate_goal_change`, `sentinel_forecast_bill_outlays`, `sentinel_flag_cashflow_risk` (SC §10.4). Read-only. Proposals only; T2 confirmation and Action Service re-validation required.

---

## G. State, memory and persistence
Stateless; no durable state. Plans are not stored by Iris: an applied plan exists only as executed month overrides in the Plan Store. Memory of user priorities arrives via `context.preferences.goal_priority_order` and `rolling_summary`.

---

## H. Security and financial correctness
Untrusted text rules (SC §16.4); no raw rows; conservative-first headline; risk words from Sentinel; suggested amounts only from Sentinel or the user; protected categories never reduced; uncategorized never allocated.

---

## I. Errors and recovery
| Category | Condition | Iris returns | John's handling | Retry |
| --- | --- | --- | --- | --- |
| Invalid input | Bad `task_params` | `ERROR` `INVALID_INPUT` (runner, no LLM call) | Tell the user it could not process; log routing defect | No |
| Missing data | `INSUFFICIENT_HISTORY` | `PARTIAL`, qualitative guidance, no numbers from the failed call | Show labelled partial | No |
| Unsupported | Auto-sweep, investment, real money | `OK` + `CAVEAT` (scope) | Scope statement | No |
| Timeout | Packet deadline | `PARTIAL` with validated proposals so far, else `ERROR` `TIMEOUT` | One retry with smaller packet | Once |
| Tool failure | Sentinel error after gateway retry | `ERROR` `UNAVAILABLE`, no numbers | Degrade; other specialists still answer | No |
| Invalid output | Schema or grounding failure after the runner's repair | `ERROR` `SCHEMA_VIOLATION` | Degrade | Once (John) |
| Contradictory result | `GOAL_COMMITMENT_CONFLICT` from simulation | `OK`/`PARTIAL` with the constraint, **no cap proposal** | Conflict rules (John §B.7) | No |
| Authorization | Tool outside allowlist | Gateway `FORBIDDEN` → `ERROR`; security event | — | No |
| Persistence | Not applicable (no writes) | — | — | — |
| Partial completion | Budget exhausted mid-plan | `PARTIAL` with validated proposals so far | Label partial | No |
| Retry exhaustion | Repair failed | `ERROR` | Degrade | No |
| Cancellation | AbortSignal | Nothing (discarded) | — | No |

---

## J. Testing
| Type | Tests |
| --- | --- |
| Contract | IrisDomain@1; task params; proposal bindings (amount = cited field) |
| Scenario evals | "Next month is tight with my holiday trip" (MONTHLY_PLAN with overrides); "Can I afford a ₹1,20,000 laptop next week without messing up rent and savings?" (MEDIUM risk → temporary goal override + move-date advice); "I keep overspending on dining and run low by the 20th" (diagnosis → standing cap + optional goal update, confirmed separately); "Any big bills coming up?" (forecast + risk); low coverage month (Review N step); `GOAL_COMMITMENT_CONFLICT` (no cap proposal); opened CASHFLOW_RISK alert |
| Negative / security | Injection in merchant name; request to auto-sweep; attempt to reduce protected HEALTH cap |
| Failure | Simulation timeout; insufficient history |
| Integration | Plan → cards → confirm → month overrides → next-month simulation reflects overrides; next standing caps unchanged |

---

## K. Implementation handoff
### K.1 Modules (`backend/src/agents/iris/`)
`index.js`, `config.js` (B.2), `prompts/system.v1.md` + `CHANGELOG.md`, `postprocess.js` (amount-source check, uncategorized line, conflict rule), `evals/*.json`.

### K.2 Interface
```js
/** @param {TaskPacket} packet @param {{signal:AbortSignal}} opts @returns {Promise<SpecialistResponse>} */
async function invoke(packet, opts) {}
```

### K.3 Configuration
`IRIS_PROMPT_VERSION`, `LLM_MODEL_SPECIALIST`, budgets per B.2.

### K.4 Definition of done
IRS-AC-01…14 pass; eval set ≥ 60 cases; Iris workspace endpoints (B.4) implemented without LLM.

### K.5 Must be complete before integration
Sentinel simulation with `cap_changes`/`goal_changes`; month overrides in the Plan Store; ResultRef support in the gateway; specialist runner.
