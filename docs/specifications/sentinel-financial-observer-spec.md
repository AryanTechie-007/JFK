# Sentinel — Financial Observer and Predictor — Component Specification

| Attribute | Value |
| --- | --- |
| File | `docs/specifications/sentinel-financial-observer-spec.md` |
| Component ID | `SENTINEL` (code module `engines/sentinel`) |
| Version | 5.0.0 (requirements freeze) — supersedes *Sentinel Mathematical Model Specification V4* |
| Kind | Deterministic mathematical and statistical model plus the shared rule library. **No LLM, no generative model, no persona, never a chat target.** |
| User-facing surface | The **Sentinel workspace** (one of the five options, SC §18), rendered by code from Sentinel results via the Workspace API |
| Shared contracts | `system-contracts.md` — SentinelResult@1 (SC §10.2), allowlist (SC §10.4), spend definition and budget equation (SC §6), snapshots (SC §7), DataQuality@1 and confidence cap (SC §8), constraint codes (SC §12), money rules (SC §4.2) |
| Decisions applied | D-003, D-004, D-005, D-006, D-007, D-010, D-011, D-013, D-015, D-018, D-019, D-024, D-025 |

---

## A. Identity and purpose

### A.1 Mission
Be the single source of every financial figure the user sees. Given a snapshot and parameters, return exact, reproducible numbers, uncertainty, and rule verdicts, so that Atlas, Nova, Iris, John and the workspaces never compute, guess or disagree.

### A.2 Responsibilities
1. Ledger arithmetic: spend, utilization, velocity, surplus, available balance, ledger summaries, time series.
2. Goal progress, feasibility and SIP projection.
3. The **rule library** (goal, cap, rebalance, balance and profile validators) — the same code the Action Service runs before executing.
4. Statistical components: anomaly detection, recurring-payment cadence, bill-outlay forecast, cash-flow risk, spending simulation with empirical bands.
5. The on-demand Financial Health score (D-024).
6. Confidence, conservative values, variance bands and data-quality reporting on every result.
7. The parameter registry and `model_version`.

### A.3 Explicit exclusions
Categorizing or correcting transactions (Categorizer), writing any state (it has no write permission), initiating anything (no jobs, notifications or events of its own), natural-language output, advice, choosing which figures to show (the caller decides), real-money movement, investment advice (SIP projection is arithmetic on a user-supplied rate only).

### A.4 Boundaries
| Component | Relationship |
| --- | --- |
| CATEGORIZER | Upstream. Sentinel trusts its types, categories and links via `categorized_as_of(user, N)` and never alters them. Miscategorization is fixed in the Categorizer; the next snapshot reflects it. |
| PROFILE_SERVICE, Plan Store | Upstream state read via the Snapshot Service (`goalsAsOf`, `capsAsOf`, `profileAsOf`, `preferencesAsOf`, `balancesAsOf`, `declaredBillsAsOf`). |
| ATLAS, NOVA, IRIS, JOHN | Callers through the Tool Gateway, each limited to the SC §10.4 allowlist. |
| WORKSPACE_API | Caller through the gateway for every workspace view and form pre-validation. |
| BUDGET_MONITOR | Caller through the gateway for tier detection and daily scans. |
| ACTION_SERVICE | Links the rule library in-process; does not call functions through the gateway. |

### A.5 Dependencies and assumptions
Snapshot Service read helpers; Categorizer view; shared `shared/finance/` (spend predicate, coverage); `decimal.js`; parameter registry file `engines/sentinel/registry/<model_version>.json`.

---

## B. Functional requirements

### B.1 Core principle
Every function is a pure function of `(snapshot, params, registry[model_version])`. Same inputs ⇒ byte-identical `data` (excluding `tool_result_id`, `computed_at`). Statistical methods are closed-form or seeded; no unseeded randomness; method version recorded in `model_version`.

### B.2 Per-call lifecycle
1. Receive `{function, params}` from the gateway with `snapshot_id`, user scope, deadline. Reject any identity field in params (`INVALID_INPUT`).
2. Validate params against the function schema (C.3); resolve `ResultRef` facts (gateway already resolved) — Sentinel never accepts a literal for a `fact: true` param.
3. Load the snapshot; if missing or older than 24 h → `SNAPSHOT_NOT_FOUND`.
4. Read inputs as of the snapshot (B.3).
5. Apply the spend definition (SC §6.2) and the function's formula with registry parameters.
6. Attach `confidence` (B.5), `variance_band` (forecasts), `data_as_of`, `categorization_version`, `data_quality` for the window used, `constraint_codes`, `model_version`, `params_hash`.
7. Return `SentinelResult@1`. Store nothing except the optional result cache keyed `(snapshot_id, function, params_hash)`.

### B.3 Inputs (all as of the snapshot)
| Input | Source | Notes |
| --- | --- | --- |
| Transactions | `categorized_as_of(user, categorization_version)` | Transaction@1 incl. links, posting status, source |
| Accounts and balances | `balancesAsOf` | AccountBalance@1 with precedence (SC §5.2) |
| Profile | `profileAsOf` | declared income, fixed-expense lines |
| Preferences | `preferencesAsOf` | protected categories, risk comfort |
| Goals, goal month overrides | `goalsAsOf` | Goal@1 (SC §5.6) |
| Caps, cap month overrides | `capsAsOf(period)` | Cap@1 (SC §5.7) |
| Declared bills | `declaredBillsAsOf` | DeclaredBill@1 |
| Calendar | `as_of_date` from snapshot; `Asia/Kolkata`; calendar-month periods | Never from callers |

### B.4 Shared derived quantities (used by several functions)
- **FIXED categories** and **effective caps**, **cap coverage** (exclusive partition: a parent cap covers its non-FIXED leaves without their own cap) — SC §5.7, §6.4.
- **Income** (`income_minor`, `income_basis`):
  - `DECLARED` if `declared_income_minor` is not null.
  - else `OBSERVED` = median of monthly Σ `INCOME` credits over the last `timeframe_months` full months (median of an even set = mean of the two middle values, half-even to paise). Needs ≥ 1 full month with any income, else `INSUFFICIENT_HISTORY`.
  - `conservative_income_minor` = declared value if `DECLARED`; else the 25th percentile (nearest-rank) of the monthly sums.
- **Goal commitments(P)** = Σ effective monthly add (SC §5.6) over goals.
- **Spendable balance** and staleness — SC §5.2.
- **Earmarked total** = Σ `saved_minor` of goals with status `ACTIVE`, `PAUSED`, `COMPLETED`.
- **Available** = spendable balance − earmarked total (may be negative).
- **Days**: `days_elapsed` = day-of-month of `as_of_date` − 1 (completed days before today); `days_remaining` = days in month − day-of-month + 1 (today and the rest of the month).

### B.5 Confidence rules
1. Function-specific base confidence (per function in B.6).
2. Then apply the shared cap (SC §8.3): `≤ MEDIUM` when `data_quality.complete = false` or coverage < `min_coverage_for_high_bp`; `LOW` when coverage < `min_coverage_for_medium_bp`.
3. Then: any balance input stale → `≤ MEDIUM`.
4. Results with no history dependency (validators, SIP, utilization of settled amounts) have `confidence: null` except utilization, whose confidence is `MEDIUM` when `tier_is_provisional` else `HIGH` (then capped by rule 2).

### B.6 Function specifications
Formulas are frozen by golden tests (J). Field-level schemas are in C.3.

#### B.6.1 `sentinel_get_surplus_baseline`
Params `timeframe_months` (1–12, default 3). Returns income, `income_basis`, monthly observed income series, fixed total and lines, `net_surplus_signed_minor = income − fixed_total`, `conservative_net_surplus_signed_minor = conservative_income − fixed_total`, `goal_commitments_minor` (current period), `caps_total_minor` (current period), `unallocated_surplus_signed_minor = net_surplus − goal_commitments − caps_total`.
Base confidence: `DECLARED` → `HIGH`; `OBSERVED` → `HIGH` if ≥ 3 months and coefficient of variation ≤ `income.cv_high` (0.15), `MEDIUM` if ≥ 2 months or CV ≤ `income.cv_medium` (0.35), else `LOW`.
Constraint codes: `INCOME_BASIS_UNCERTAIN` when `OBSERVED` and confidence ≠ `HIGH`, or when any credit in the window is `UNKNOWN` or has review reason `AMBIGUOUS` with amount ≥ `income.uncertain_credit_bp` (2000 bp) of the median; `LOW_CATEGORIZATION_COVERAGE` when coverage < floor. Refunds, reversals, chargebacks, transfers and card payments are never income (SC §6.1).

#### B.6.2 `sentinel_get_ledger_summary`
Params `timeframe_months` (1–12), `category_scope?` (array of category IDs, max 20). For each category in scope (default: all with spend): window total, monthly average, settled and provisional parts; top `ledger.top_merchants` (5) merchants **from settled rows with a resolved `merchant_id` only**; plus `uncategorized_minor`, `card_payment_unmatched_minor`, `unclassified_movement_minor`, `unmatched_credits_minor`, and the **recurring schedule** (cadence detection, B.6.13). Aggregates only; never raw rows, descriptions or counterparty data. Base confidence: `HIGH` if the window has ≥ 3 full months, else `MEDIUM`.

#### B.6.3 `sentinel_get_spending_timeseries` (Workspace API only)
Params `granularity` (`MONTH`, `WEEK`, `DAY`), `from_period`, `to_period` (≤ 24 months span; DAY ≤ 92 days), `category_scope?`. Returns buckets of `spend_signed_minor` per category and total. Same spend definition; totals equal ledger-summary totals for the same window (SEN-AC-14).

#### B.6.4 `sentinel_run_spending_simulation`
Params: `target_month` (current month or up to 3 months ahead), `category_adjustments?` (≤ 15 `{category_id, delta_spend_signed_minor}` — the user's assumed behaviour change), `cap_changes?` (≤ 15 `{category_id, new_cap_minor}`), `goal_changes?` (≤ 5 `{goal_id | null, monthly_add_minor}`; null = a new goal), `one_off_outlays?` (≤ 5 `{label ≤ 40, amount_minor, date}` within target month).
Method:
1. **Monthly baseline outflow** per DISCRETIONARY category = trailing `simulation.baseline_months` (3) full-month average of spend, plus `category_adjustments`; per FIXED category = declared line amount; plus detected recurring bills not already inside a category average (none double-counted: recurring detection is by merchant inside categories, so it is used only for timing in cash-flow, not added again); plus declared bills due in the month (SC §5.8) when their category is not FIXED; plus one-off outlays.
2. **Bands**: per DISCRETIONARY category the empirical P80 of the trailing `simulation.band_months` (6) monthly spends (nearest-rank; fewer months → the max observed). `conservative_outflow` = Σ P80 + FIXED + bills + one-offs; income uses `conservative_income_minor`.
3. **Opening balance** of the target month: if target = current month → current spendable balance + remaining expected income this month − projected remaining discretionary spend (velocity, B.6.6) − remaining declared/detected bills; if a later month → previous month's projected closing balance (chained, central and conservative separately).
4. `projected_end_balance_signed_minor = opening + income − outflow`; `conservative_end_balance_signed_minor = opening_conservative + conservative_income − conservative_outflow`.
5. **Commitments**: `goal_commitments_after_changes` = effective monthly adds with `goal_changes` applied; `earmarked_total` from snapshot.
6. `projected_available_signed_minor = projected_end_balance − earmarked_total − goal_commitments_after_changes`; same for conservative.
7. `risk_level`: `HIGH` if projected_available < 0; `MEDIUM` if projected_available ≥ 0 and conservative_available < 0; else `LOW`.
8. **Plan checks**: caps after `cap_changes` → `caps_total`; if `fixed_total + goal_commitments_after_changes + caps_total > income` → constraint `GOAL_COMMITMENT_CONFLICT` (WARNING). Categories whose baseline outflow exceeds their effective cap after changes → `category_overrun[]`. `risk_level ∈ {MEDIUM, HIGH}` → constraint `NEGATIVE_BALANCE_RISK`.
Returns all of the above, `allocation_outcome` (`{income, fixed_total, goal_commitments, caps_total, unallocated_signed}`), `variance_band` = `{low_minor: conservative_end_balance, high_minor: projected_end_balance + (projected − conservative)}` (symmetric empirical band). Base confidence: `HIGH` if ≥ 6 full months history and income `DECLARED` or `HIGH`; `MEDIUM` if ≥ 3; else `INSUFFICIENT_HISTORY` (F-08).

#### B.6.5 `sentinel_run_category_utilization`
Params `category_id`, `period?` (default current). Uses the cap coverage of SC §5.7 (exclusive partition). Returns `cap_minor` (effective, or null when the category has no cap), `covered_category_ids`, `spent_signed_minor`, `spent_total_minor = max(0, spent_signed)`, `spent_settled_minor` (CONFIRMED/AUTO and POSTED), `spent_provisional_minor` (NEEDS_REVIEW or PENDING), `utilization_bp = spent_total × 10000 / cap` (half-even; null when cap null), `remaining_signed_minor = cap − spent_total`, `tier` (`HEALTHY` < `tier.warning_bp` 8000; `WARNING` 8000–10000 inclusive; `EXCEEDED` > 10000; cap 0 → `EXCEEDED` if any spend else `HEALTHY`), `tier_is_provisional` (tier computed from settled alone differs). Uncategorized amounts never count toward a category. Constraint codes: `PROVISIONAL_DATA` when `tier_is_provisional`.

#### B.6.6 `sentinel_run_velocity_projection`
Params `category_scope` (array of IDs or `"ALL_CAPPED"`). `days_remaining` is computed (never a param; fixes X-17). Needs `days_elapsed ≥ 1` (not on the 1st) else `INSUFFICIENT_HISTORY`. Per category: `daily_burn_minor = spent_through_yesterday / days_elapsed` (spend dated before `as_of_date`); `projected_month_end_minor = spent_total + daily_burn × days_remaining` (today's posted spend is in `spent_total`; the projection then assumes the average rate for today and the remaining days, a deliberately conservative choice); `pacing` (`UNDER` if projected ≤ `velocity.under_bp` 9000 of cap, `ON_TRACK` ≤ 10000, `OVER` above; null when uncapped); `safe_daily_envelope_minor = max(0, cap − spent_total) / days_remaining`; `conservative_daily_envelope_minor = safe × (10000 − buffer_bp(confidence)) / 10000` with `velocity.buffer_bp = {HIGH: 0, MEDIUM: 1000, LOW: 2000}` (starting values). Base confidence: `HIGH` if `days_elapsed ≥ 10` and no provisional amounts; `MEDIUM` if ≥ 3; else `LOW`.

#### B.6.7 `sentinel_detect_anomalies`
Params `lookback_days` (1–90). Rules (registry, starting values; tune on data):
- `DUPLICATE_SWIPE`: same `merchant_id`, same amount, same day (window `anomaly.dup_window_days` 0), both POSTED; ignores rows linked `DUPLICATE_OF` and superseded rows.
- `SPIKE`: single `EXPENSE` above the category's trailing 6-month per-transaction mean + `anomaly.spike_k` (3) standard deviations (population SD); needs ≥ 10 prior rows in the category.
- `PRICE_CREEP`: recurring merchant (B.6.13) whose latest charge exceeds the previous cycle's by > `anomaly.creep_bp` (500).
Returns items `{anomaly_type, merchant_id?, merchant_name?, category_id?, txn_ids[], amount_minor, baseline_minor, delta_bp, date, recurring}`. Base confidence `HIGH` for duplicates, `MEDIUM` for spikes and creep.

#### B.6.8 `sentinel_run_rebalance_simulation`
Params `deficit_category_id`, `period?` (current only in v1). Deficit = `max(0, projected_month_end − cap)` using B.6.6 (projected ≥ spent so it covers an existing overrun). Eligible donors: capped categories ≠ deficit, not protected (preferences), not FIXED, with `donor_capacity = max(0, cap − projected_month_end)`; on the 1st of the month (no velocity) the deficit and capacities use `spent_total` instead of the projection. Order donors by capacity descending, then `category_id` ascending; allocate greedily. Returns `transfers[] {from_category_id, to_category_id, amount_minor}`, `covered_minor`, `shortfall_minor`, `updated_caps[] {category_id, new_cap_minor}` (these become **month overrides**, D-005), `net_cap_change_minor` (always 0), `excluded_protected[]`, `excluded_fixed[]`. Sentinel reports `shortfall_minor` only; turning a shortfall into the peer hint `GOAL_FUNDING_PRESSURE` is Nova's job (SC §9.6).

#### B.6.9 `sentinel_validate_cap_change` (rule library `rules/cap.js`)
Params `category_id`, `new_cap_minor`, `scope` (`STANDING` | `MONTH`), `period?` (for MONTH), `override_protected?` (boolean; the gateway forces `false` for specialist callers, SC §13.4). Rules: `AMOUNT_PRECISION`, `CAP_NEGATIVE`, `CATEGORY_UNKNOWN`, `CATEGORY_NOT_CAPPABLE`, `PROTECTED_CATEGORY` (reduction of a protected category and `override_protected` false) — MANDATORY; `CAPS_EXCEED_SPENDABLE`, `CAP_ON_DEPRECATED_CATEGORY` (+ `suggested_category_id`), `CAP_BELOW_SPEND` — WARNING. Returns `verdict` (`PASS` if no MANDATORY), `rule_codes`, `warnings`, `current_cap_minor`, `spent_total_minor`.
Rebalance legs are validated by `rules/rebalance.js`: each leg passes the cap rules (reductions on donors) and Σ legs nets to zero and no donor exceeds its capacity → else `ZERO_SUM_VIOLATION`.

#### B.6.10 `sentinel_run_goal_progress`
Params `goal_id`. Returns `saved_minor`, `target_minor`, `remaining_minor`, `progress_bp`, `effective_monthly_add_minor`, `trailing_actual_contribution_minor` (mean of actual contributions over the last `goal.trailing_months` (3) full months that the goal existed), `projected_date` (end of the month in which `remaining` is covered at the effective monthly add; null if add = 0), `conservative_date` (same with `min(effective add, trailing actual)`; null if < 1 full month of history or that minimum is 0), `on_track` and `required_monthly_add_for_deadline_minor` when a deadline exists, `acceleration_extra_monthly_minor` (additional monthly add that reaches the target one month earlier than `projected_date`; null when projected is null or ≤ 1 month away). Base confidence: `HIGH` if ≥ 3 months history and trailing actual ≥ effective add; `MEDIUM` if ≥ 1 month; `LOW` otherwise. A `COMPLETED` goal returns progress 10000 and null dates.

#### B.6.11 `sentinel_run_goal_feasibility`
Params `proposed_monthly_add_minor`, `goal_id?` (null = new goal; else the goal's current effective add is replaced by the proposal), `period?` (current or a future month for overrides). Using SC §6.4: `headroom_vs_surplus_signed_minor = income − fixed_total − goal_commitments_incl_proposed`; `headroom_after_caps_signed_minor = headroom_vs_surplus − caps_total`. When income confidence ≠ `HIGH`, the verdict uses `conservative_income_minor` (and both central and conservative headrooms are returned). Verdict: `FITS` if headroom_after_caps ≥ 0; `TIGHT` if only headroom_vs_surplus ≥ 0 → code `FEASIBILITY_TIGHT`; else `SHORTFALL` → code `SURPLUS_SHORTFALL` (MANDATORY, D-006). Plus `INCOME_BASIS_UNCERTAIN` per B.6.1.

#### B.6.12 `sentinel_validate_goal_change` (rule library `rules/goal.js`)
Params `operation` (`CREATE`, `UPDATE`, `SET_STATUS`, `SET_MONTH_OVERRIDE`, `ADD_FUNDS`, `RELEASE_FUNDS`, `RESTORE`), `goal_id?`, and the operation's fields (`name`, `target_minor`, `monthly_add_minor`, `deadline`, `priority_tier`, `status`, `period`, `amount_minor`). The current `saved_minor` and status are read from the snapshot, never from params. Rules (all MANDATORY): `TARGET_NOT_POSITIVE`, `CONTRIBUTION_EXCEEDS_TARGET`, `FUNDS_EXCEED_TARGET` (saved + amount > target), `TARGET_BELOW_SAVED`, `NAME_INVALID` (empty, > 40 chars, or duplicate case-insensitively among non-archived goals), `DEADLINE_IN_PAST`, `AMOUNT_PRECISION`, `GOAL_LIMIT` (`goal.max_active` 20), `GOAL_NOT_ACTIVE` (`ADD_FUNDS` and `SET_MONTH_OVERRIDE` require status `ACTIVE`; `RELEASE_FUNDS` requires `ACTIVE`, `PAUSED` or `COMPLETED`; `UPDATE`/`SET_STATUS` are refused on `ARCHIVED`), `RELEASE_EXCEEDS_SAVED`, `RESTORE_WINDOW_EXPIRED`. Returns `verdict`, `rule_codes`.

#### B.6.13 `sentinel_forecast_bill_outlays`
Params `lookback_months` (3–12, default 6), `horizon_days` (1–90, default 30). **Detected** bills: cadence detection per `merchant_id` over the lookback (≥ 3 occurrences; intervals within ±`bills.cadence_tolerance_days` (5) of 7, 30/31, 91 or 365 days); amount = median of the last 3 charges; next date = last date + median interval; confidence `HIGH` if ≥ 6 occurrences and amount CV ≤ 0.1, `MEDIUM` if ≥ 3, else excluded. **Declared** bills (SC §5.8, `ACTIVE`): due dates within horizon (expanding recurrence). Merge: a detected bill within ±5 days and ±10 % of a declared bill with the same category (or merchant label match) is dropped in favour of the declared one. Returns `outlays[] {source, merchant_id?, merchant_name?, label, category_id?, amount_minor, due_date, confidence, variance_band}`, `total_minor`. Needs ≥ 3 months history for detected bills (else only declared bills, confidence `LOW`).

#### B.6.14 `sentinel_flag_cashflow_risk`
Params `horizon_days` (1–60, default 30), `outlays?` (`ResultRef` to a bill forecast's `/data/outlays`; fact; if omitted Sentinel computes the forecast with defaults). Next income date = next expected `INCOME` per cadence detection on income credits; unknown → horizon end. Walk days from `as_of_date` to next income date: cumulative outflow = scheduled outlays + daily discretionary burn (all categories, B.6.6). Flag when cumulative outflow > spendable balance. `gap_minor` = largest excess; severity `HIGH` if gap ≥ `cashflow.high_bp` (2500) of monthly income, `MEDIUM` ≥ 1000, else `LOW`; `lead_time_days` = days from today to the first shortfall date. Constraint `NEGATIVE_BALANCE_RISK` when any flag. Balance unknown → `INSUFFICIENT_HISTORY`.

#### B.6.15 `sentinel_check_available_balance` (rule library `rules/balance.js`)
Params `amount_minor`. Returns `verdict` (`OK` if amount ≤ available, else `INSUFFICIENT`), `spendable_balance_signed_minor`, `earmarked_total_minor`, `available_signed_minor`, `balance_as_of`, `stale`. Codes: `INSUFFICIENT_BALANCE`, `BALANCE_UNKNOWN`, `OVER_EARMARKED` (available < 0), `STALE_BALANCE`.

#### B.6.16 `sentinel_compute_health_score` (JOHN only; D-024)
Computed for the **last full calendar month** P (stable, not month-to-date). Preserves the existing 4 × 25 formula with corrected inputs:
- `saving_behavior` = min(25, round(`savings_rate_bp` / `health.savings_benchmark_bp` (2000) × 25)), where `savings_rate_bp` = goal commitments(P) / income.
- `budget_discipline` = round(within / capped × 25), where capped = categories with an effective cap in P, within = those with `spent_total ≤ cap`; no caps → `health.no_caps_discipline_score` (12).
- `spending_control` = clamp(0, 25, round((1 − outflow/income) / `health.control_span_bp` (4000) × 25)), where outflow(P) = spend in DISCRETIONARY categories + Σ over fixed lines max(declared amount, observed spend in that line's categories).
- `future_planning` = min(25, `health.points_per_funded_goal` (8) × funded goals), funded = `ACTIVE` goals with effective monthly add > 0.
- `score` = sum; `grade`: `EXCELLENT` ≥ 80, `GOOD` ≥ 60, `FAIR` ≥ 40, else `NEEDS_WORK`.
Rounding half-even. Income unknown → `INSUFFICIENT_HISTORY`. Confidence = income confidence capped by data quality. Returns components, metrics (`savings_rate_bp`, `outflow_ratio_bp`, `capped_count`, `within_cap_count`, `funded_goals_count`) and `period`. Not shown on any page; John presents it only when the user asks to quantify their habits.

#### B.6.17 `sentinel_project_sip` (ATLAS, WORKSPACE_API; D-024)
Params `monthly_amount_minor` (10,000 – 100,000,000), `annual_rate_bp` (0 – 3,000), `months` (1 – 600), `annual_step_up_bp` (0 – 5,000, default 0). Monthly rate `r = annual_rate_bp / 120000` (decimal). Annuity-due compounding month by month with the instalment increased by the step-up every 12 months: `value_m = (value_{m−1} + instalment_m) × (1 + r)`. Returns `future_value_minor`, `total_invested_minor`, `estimated_gain_minor`, `yearly_schedule[] {year, invested_minor, value_minor}`, `illustrative: true`, `rate_source: "USER_SUPPLIED"`. `confidence: null`, no variance band. The function never suggests a rate, product or fund; callers must label the result illustrative.

### B.6.18 Sentinel workspace (deterministic, no LLM; D-025)
The Sentinel workspace is rendered by the Workspace API from Sentinel results and Categorizer/Profile reads. Sentinel itself has no UI code and no persona; the workspace's chat panel posts to John.

| UI element | Endpoint (Workspace API) | Source |
| --- | --- | --- |
| Spending analyzer: category totals, merchants, uncategorized and unclassified buckets | `GET /api/v1/workspaces/sentinel/spending?months=` | `sentinel_get_ledger_summary` |
| Trends chart | `GET /api/v1/workspaces/sentinel/timeseries?granularity=&from=&to=` | `sentinel_get_spending_timeseries` |
| Forecast and risk radar (detected + declared bills, cash-flow flags) | `GET /api/v1/workspaces/sentinel/forecast?horizon_days=` | `sentinel_forecast_bill_outlays`, `sentinel_flag_cashflow_risk` |
| Declared bills panel (add/edit/delete) | `POST /api/v1/actions` (`ADD_DECLARED_BILL`, `UPDATE_DECLARED_BILL`, `DELETE_DECLARED_BILL`, T1) | Profile Service via Action Service |
| Balances and data-quality badge | `GET /api/v1/workspaces/sentinel/overview` | Profile Service balances, Categorizer status |
| Transactions list with category chips, inline correction, evidence | `GET /api/v1/transactions`, `GET /api/v1/transactions/{id}` | Categorizer; corrections via `/api/v1/actions` / `/api/v1/proposals` |
| Needs-review list | `GET /api/v1/review-queue` | Categorizer; T1 actions per reason |

Every view returns the `snapshot_id`, `as_of_date` and `DataQuality@1` it used; figures are rendered by the shared grounding formatter (SC §11.1 formats).

### B.7 Minimum history (F-08)
Utilization, validators, available balance, SIP: none. Velocity: ≥ 1 full day elapsed. Simulations and detected bill forecasts: ≥ 3 full months. Observed income: ≥ 1 full month (confidence rules above). Below minimum → `INSUFFICIENT_HISTORY` (status) or a result with `confidence: LOW` as specified per function.

### B.8 Performance (F-07, p95 at realistic volume: 24 months × 300 rows/month per user)
| Group | p95 |
| --- | --- |
| Validators, utilization, feasibility, available balance, SIP, health score | < 300 ms |
| Velocity, anomalies, goal progress, ledger summary, timeseries | < 1 s |
| Simulation, bill forecast, cash-flow risk | < 2 s |

### B.9 Acceptance criteria
| ID | Requirement | Criterion |
| --- | --- | --- |
| SEN-AC-01 | B.6 | Every function has ≥ 3 golden cases plus edge cases (zero income, no history, negative surplus, cap 0, leap month, month boundary at IST midnight, goal exactly at target, refund across months, pending row, superseded manual row); all exact |
| SEN-AC-02 | B.1 | Replaying any request on the same snapshot and model version returns identical `data` |
| SEN-AC-03 | B.2 | A request containing an identity parameter or a literal for a `fact` param is rejected |
| SEN-AC-04 | A.3 | Static check: no LLM or model-provider client imported under `engines/sentinel/` |
| SEN-AC-05 | F | Sentinel's DB credentials cannot write (test) |
| SEN-AC-06 | B.6.9/12/15 | Rule library results identical whether called by Sentinel or the Action Service over a shared corpus |
| SEN-AC-07 | B.5 | Forecasts and simulations always include `confidence` and `variance_band` |
| SEN-AC-08 | B.1 | Each statistical component has a documented method and passes a backtest on held-out history with team-set error thresholds |
| SEN-AC-09 | C.4 | Every parameter is in the registry; changing one creates a new `model_version` |
| SEN-AC-10 | SC §16.3 | Cross-user access returns no data |
| SEN-AC-11 | B.8 | Performance targets met at realistic volume |
| SEN-AC-12 | SC §7 | A correction or plan change creates a new snapshot and changes results; requests pinned to the old snapshot are unchanged |
| SEN-AC-13 | SC §6.2 | Golden cases for: own-account transfer, matched card payment, card payment with missing counterpart, matched and unmatched refund, reversal, chargeback, ATM withdrawal, pending row, duplicate row, superseded manual entry, credit interest |
| SEN-AC-14 | SC §6.2 | Spend totals identical for the same snapshot through utilization, ledger summary, timeseries and health score |
| SEN-AC-15 | B.5 | Confidence is capped by coverage, completeness and balance staleness in 100 % of test cases |
| SEN-AC-16 | SC §5.7 | Exclusive cap partition: Σ utilization spend over all caps + uncapped spend = total category spend |
| SEN-AC-17 | B.6.4 | For a future target month with no changes, no bills and only FIXED categories, `projected_end_balance − opening_balance = net_surplus` exactly (surplus and simulation agree by construction) |
| SEN-AC-18 | B.6.8 | Rebalance never includes a protected or FIXED donor and always nets to zero |
| SEN-AC-19 | B.6.16 | Health score reproduces the documented worked examples |
| SEN-AC-20 | B.6.17 | SIP matches a reference spreadsheet to the paisa for 20 cases |

---

## C. Data contracts

### C.1 Request (after the gateway)
`{function, schema_version: 1, snapshot_id, params}` + gateway context `{user scope, caller, task_id?, request_id, trace_id, deadline}`. Callers never supply identity or `snapshot_id` in `params`.

### C.2 Response
`SentinelResult@1` (SC §10.2). `data` is null when `status ≠ OK`. `constraint_codes` lists every SC §12 code the result produced.

### C.3 Function schemas (params and `data`)
JSON Schemas live in `backend/src/engines/sentinel/schemas/<function>.json`. Key shapes (all money `_minor` integers, ratios `_bp`):

```json
{"sentinel_get_surplus_baseline": {
  "params": {"timeframe_months": {"type": "integer", "minimum": 1, "maximum": 12, "default": 3}},
  "data": {"income_minor": "int", "conservative_income_minor": "int", "income_basis": "DECLARED|OBSERVED",
           "income_monthly_series": [{"period": "YYYY-MM", "income_minor": "int"}],
           "fixed_total_minor": "int", "fixed_lines": [{"line_id": "str", "category_id": "str", "amount_minor": "int"}],
           "net_surplus_signed_minor": "int", "conservative_net_surplus_signed_minor": "int",
           "goal_commitments_minor": "int", "caps_total_minor": "int", "unallocated_surplus_signed_minor": "int", "period": "YYYY-MM"}},
 "sentinel_get_ledger_summary": {
  "params": {"timeframe_months": "1..12", "category_scope": {"type": "array", "maxItems": 20, "items": "category_id"}},
  "data": {"periods": ["YYYY-MM"], "categories": [{"category_id": "str", "total_signed_minor": "int", "monthly_average_minor": "int", "settled_minor": "int", "provisional_minor": "int",
            "top_merchants": [{"merchant_id": "str", "merchant_name": "str≤40", "total_minor": "int", "count": "int"}]}],
           "uncategorized_minor": "int", "card_payment_unmatched_minor": "int", "unclassified_movement_minor": "int", "unmatched_credits_minor": "int",
           "recurring_schedule": [{"merchant_id": "str", "merchant_name": "str", "cadence": "WEEKLY|MONTHLY|QUARTERLY|YEARLY", "typical_amount_minor": "int", "next_expected_date": "date", "confidence": "Confidence"}]}},
 "sentinel_get_spending_timeseries": {
  "params": {"granularity": "MONTH|WEEK|DAY", "from_period": "YYYY-MM", "to_period": "YYYY-MM", "category_scope": "array?"},
  "data": {"buckets": [{"bucket": "YYYY-MM|YYYY-Www|YYYY-MM-DD", "category_id": "str|null(total)", "spend_signed_minor": "int"}]}},
 "sentinel_run_spending_simulation": {
  "params": {"target_month": "YYYY-MM", "category_adjustments": [{"category_id": "str", "delta_spend_signed_minor": "int"}],
             "cap_changes": [{"category_id": "str", "new_cap_minor": "int≥0"}], "goal_changes": [{"goal_id": "str|null", "monthly_add_minor": "int≥0"}],
             "one_off_outlays": [{"label": "str≤40", "amount_minor": "int≥1", "date": "date"}]},
  "data": {"target_month": "YYYY-MM", "opening_balance_signed_minor": "int", "projected_end_balance_signed_minor": "int", "conservative_end_balance_signed_minor": "int",
           "projected_available_signed_minor": "int", "conservative_available_signed_minor": "int", "risk_level": "LOW|MEDIUM|HIGH",
           "allocation_outcome": {"income_minor": "int", "fixed_total_minor": "int", "goal_commitments_minor": "int", "caps_total_minor": "int", "unallocated_signed_minor": "int"},
           "category_plan": [{"category_id": "str", "baseline_outflow_minor": "int", "p80_outflow_minor": "int", "effective_cap_minor": "int|null", "overrun_minor": "int"}],
           "category_overrun": ["category_id"]}},
 "sentinel_run_category_utilization": {
  "params": {"category_id": "str", "period": "YYYY-MM?"},
  "data": {"category_id": "str", "period": "YYYY-MM", "cap_minor": "int|null", "covered_category_ids": ["str"], "spent_signed_minor": "int", "spent_total_minor": "int",
           "spent_settled_minor": "int", "spent_provisional_minor": "int", "utilization_bp": "int|null", "remaining_signed_minor": "int|null",
           "tier": "HEALTHY|WARNING|EXCEEDED|null", "tier_is_provisional": "bool"}},
 "sentinel_run_velocity_projection": {
  "params": {"category_scope": "array of category_id | \"ALL_CAPPED\""},
  "data": {"days_elapsed": "int", "days_remaining": "int", "categories": [{"category_id": "str", "daily_burn_minor": "int", "projected_month_end_minor": "int", "pacing": "UNDER|ON_TRACK|OVER|null",
            "safe_daily_envelope_minor": "int|null", "conservative_daily_envelope_minor": "int|null"}]}},
 "sentinel_detect_anomalies": {
  "params": {"lookback_days": "1..90"},
  "data": {"items": [{"anomaly_type": "DUPLICATE_SWIPE|SPIKE|PRICE_CREEP", "merchant_id": "str?", "merchant_name": "str?", "category_id": "str?", "txn_ids": ["str"], "amount_minor": "int", "baseline_minor": "int", "delta_bp": "int", "date": "date", "recurring": "bool", "confidence": "Confidence"}]}},
 "sentinel_run_rebalance_simulation": {
  "params": {"deficit_category_id": "str", "period": "YYYY-MM? (current only)"},
  "data": {"period": "YYYY-MM", "deficit_minor": "int", "transfers": [{"from_category_id": "str", "to_category_id": "str", "amount_minor": "int"}], "covered_minor": "int", "shortfall_minor": "int",
           "updated_caps": [{"category_id": "str", "new_cap_minor": "int"}], "net_cap_change_minor": 0, "excluded_protected": ["str"], "excluded_fixed": ["str"]}},
 "sentinel_validate_cap_change": {
  "params": {"category_id": "str", "new_cap_minor": "int", "scope": "STANDING|MONTH", "period": "YYYY-MM?", "override_protected": "bool?"},
  "data": {"verdict": "PASS|REJECTED", "rule_codes": ["code"], "warnings": ["code"], "current_cap_minor": "int|null", "spent_total_minor": "int", "suggested_category_id": "str?"}},
 "sentinel_run_goal_progress": {
  "params": {"goal_id": "str"},
  "data": {"goal_id": "str", "name": "str", "status": "GoalStatus", "saved_minor": "int", "target_minor": "int", "remaining_minor": "int", "progress_bp": "int",
           "effective_monthly_add_minor": "int", "trailing_actual_contribution_minor": "int|null", "projected_date": "date|null", "conservative_date": "date|null",
           "deadline": "date|null", "on_track": "bool|null", "required_monthly_add_for_deadline_minor": "int|null", "acceleration_extra_monthly_minor": "int|null"}},
 "sentinel_run_goal_feasibility": {
  "params": {"proposed_monthly_add_minor": "int≥0", "goal_id": "str|null", "period": "YYYY-MM?"},
  "data": {"verdict": "FITS|TIGHT|SHORTFALL", "income_basis": "DECLARED|OBSERVED", "verdict_income": "CENTRAL|CONSERVATIVE",
           "headroom_vs_surplus_signed_minor": "int", "headroom_after_caps_signed_minor": "int",
           "conservative_headroom_after_caps_signed_minor": "int",
           "components": {"income_minor": "int", "fixed_total_minor": "int", "goal_commitments_incl_proposed_minor": "int", "caps_total_minor": "int"}}},
 "sentinel_validate_goal_change": {
  "params": {"operation": "CREATE|UPDATE|SET_STATUS|SET_MONTH_OVERRIDE|ADD_FUNDS|RELEASE_FUNDS|RESTORE", "goal_id": "str?", "name": "str?", "target_minor": "int?", "monthly_add_minor": "int?", "deadline": "date?", "priority_tier": "HIGH|MEDIUM|LOW?", "status": "ACTIVE|PAUSED?", "period": "YYYY-MM?", "amount_minor": "int?"},
  "data": {"verdict": "PASS|REJECTED", "rule_codes": ["code"]}},
 "sentinel_check_available_balance": {
  "params": {"amount_minor": "int≥1"},
  "data": {"verdict": "OK|INSUFFICIENT", "spendable_balance_signed_minor": "int|null", "earmarked_total_minor": "int", "available_signed_minor": "int|null", "balance_as_of": "date-time|null", "stale": "bool"}},
 "sentinel_forecast_bill_outlays": {
  "params": {"lookback_months": "3..12", "horizon_days": "1..90"},
  "data": {"outlays": [{"source": "DETECTED|DECLARED", "merchant_id": "str?", "merchant_name": "str?", "bill_id": "str?", "label": "str", "category_id": "str?", "amount_minor": "int", "due_date": "date", "confidence": "Confidence", "variance_band": {"low_minor": "int", "high_minor": "int"}}], "total_minor": "int"}},
 "sentinel_flag_cashflow_risk": {
  "params": {"horizon_days": "1..60", "outlays": "ResultRef? (fact)"},
  "data": {"next_income_date": "date|null", "spendable_balance_signed_minor": "int", "flags": [{"severity": "HIGH|MEDIUM|LOW", "gap_minor": "int", "first_shortfall_date": "date", "lead_time_days": "int"}]}},
 "sentinel_compute_health_score": {
  "params": {},
  "data": {"period": "YYYY-MM", "score": "0..100", "grade": "EXCELLENT|GOOD|FAIR|NEEDS_WORK",
           "components": {"saving_behavior": "0..25", "budget_discipline": "0..25", "spending_control": "0..25", "future_planning": "0..25"},
           "metrics": {"savings_rate_bp": "int", "outflow_ratio_bp": "int", "capped_count": "int", "within_cap_count": "int", "funded_goals_count": "int"}}},
 "sentinel_project_sip": {
  "params": {"monthly_amount_minor": "10000..100000000", "annual_rate_bp": "0..3000", "months": "1..600", "annual_step_up_bp": "0..5000"},
  "data": {"future_value_minor": "int", "total_invested_minor": "int", "estimated_gain_minor": "int", "yearly_schedule": [{"year": "int", "invested_minor": "int", "value_minor": "int"}], "illustrative": true, "rate_source": "USER_SUPPLIED"}}
}
```
The shorthand above (`"int"`, `"str≤40"`) is expanded to full JSON Schema in the schema files; contract tests enforce equality with this table.

**Fact parameters** (`fact: true`, must be ResultRef or omitted): `outlays` in `sentinel_flag_cashflow_risk`. Every other fact (balances, saved amounts, days, caps, goals, income) is read from the snapshot and is not a parameter at all (fixes X-17).

### C.4 Parameter registry
One JSON file per `model_version` (semver). Keys (starting values; tuned after baseline, O-3): `tier.warning_bp=8000`, `tier.exceeded_bp=10000`, `velocity.under_bp=9000`, `velocity.buffer_bp={HIGH:0,MEDIUM:1000,LOW:2000}`, `income.cv_high=0.15`, `income.cv_medium=0.35`, `income.uncertain_credit_bp=2000`, `confidence.min_coverage_for_high_bp`, `confidence.min_coverage_for_medium_bp` (set from baseline), `balance.stale_after_hours=48`, `simulation.baseline_months=3`, `simulation.band_months=6`, `anomaly.dup_window_days=0`, `anomaly.spike_k=3`, `anomaly.creep_bp=500`, `bills.cadence_tolerance_days=5`, `bills.merge_window_days=5`, `bills.merge_amount_bp=1000`, `cashflow.high_bp=2500`, `cashflow.medium_bp=1000`, `goal.trailing_months=3`, `goal.max_active=20`, `ledger.top_merchants=5`, `health.savings_benchmark_bp=2000`, `health.no_caps_discipline_score=12`, `health.control_span_bp=4000`, `health.points_per_funded_goal=8`, `sip.max_rate_bp=3000`. A changed value creates a new `model_version`; previous versions stay loadable for replay.

### C.5 Missing, stale and conflicting data
| Situation | Behaviour |
| --- | --- |
| Snapshot missing/expired | `SNAPSHOT_NOT_FOUND` |
| Unknown goal/category | `UNKNOWN_ENTITY` |
| Not enough history | `INSUFFICIENT_HISTORY` or `LOW` per function |
| Import in progress / pipeline pending | Not an error: `data_quality.complete = false`, confidence ≤ `MEDIUM`, code `IMPORT_IN_PROGRESS` |
| Balance stale | Code `STALE_BALANCE`, confidence ≤ `MEDIUM` |
| Uncategorized / provisional amounts | Always reported (uncategorized bucket, `spent_provisional_minor`, `PROVISIONAL_DATA`) |
| Contradictory inputs (a cap on a leaf that is FIXED — prevented by the `UPDATE_PROFILE` validator but possible transiently after a taxonomy migration) | The FIXED rule wins: cap coverage excludes FIXED leaves (SC §5.7), so that cap covers no spend; the cap is reported with `covered_category_ids: []` so the Nova workspace can prompt its removal |

---

## D. Processing logic
Sentinel has no reasoning loop. Each call executes one function once. Observable "decisions" are verdicts (`PASS/REJECTED`, `FITS/TIGHT/SHORTFALL`, `risk_level`, `tier`, `pacing`) produced by the formulas above. Output distinguishes kinds explicitly so callers can label findings (SC §9.5):

| Output kind | Examples |
| --- | --- |
| FACT | `spent_total_minor`, `saved_minor`, balances, ledger totals |
| CALCULATION | `utilization_bp`, `remaining_signed_minor`, surplus, headroom, health score, SIP value |
| ESTIMATE | monthly averages, observed income median, trailing contribution |
| PREDICTION | velocity projection, simulation balances, bill forecast, cash-flow flags, goal dates |
| VERDICT | validator verdicts, feasibility verdict, tier, risk level |

Limits: one function per call; no internal call fan-out other than the documented reuse (cash-flow → forecast, simulation → velocity); deadline per SC §15.3.

---

## E. Communication and integration
- Callers and allowlist: SC §10.4 (enforced by the gateway, not by Sentinel). Sentinel also checks that `caller` is in its own copy of the allowlist and rejects otherwise (`FORBIDDEN`), as defence in depth.
- Synchronous in-process call `sentinel.run(functionName, params, ctx)`; `ctx.signal` aborts long computations (simulation, forecast) at the deadline → `TIMEOUT`.
- Results return to the gateway, which stores them by `tool_result_id` and returns them to the caller. Sentinel never contacts John or a specialist.
- Concurrency: stateless; safe to run in parallel for different calls.
- Rule library interface for the Action Service: `rules.validateGoalChange(state, op)`, `rules.validateCapChange(state, change)`, `rules.validateRebalance(state, transfers)`, `rules.checkAvailableBalance(state, amount)`, `rules.validateProfile(state, profile)` where `state` is loaded by the Action Service from current versions; returns `{verdict, rule_codes, warnings}` identical to the tool results.

---

## F. Tools and permissions
- DB role `sentinel_ro`: SELECT on the `categorized_as_of` view and on history tables through Snapshot Service helpers; **no write permission** (tested).
- No network egress; no LLM client.
- Sentinel exposes no write operation and no tool that changes state.
- Identity: only from the gateway context. A parameter named `user_id`, `tenant_id`, `snapshot_id` or `customer_ref` → `INVALID_INPUT`.

---

## G. State, memory and persistence
- Stateless between calls. Optional result cache `(snapshot_id, function, params_hash)` in Sentinel's own schema, TTL 24 h; snapshots are immutable so the cache never needs invalidation.
- No conversational memory; no copies of plan or ledger data beyond the request.
- Restart: nothing to recover.
- Registry files are versioned in the repository; the active `model_version` is configuration.

---

## H. Security and financial correctness
- Integer paise in and out; `decimal.js` for divisions, medians, percentiles, compounding; half-even rounding at the end (SC §4.2). Floating-point money arithmetic is a defect (lint rule bans `Number` arithmetic on `_minor` fields in Sentinel code).
- `merchant_name` leaves Sentinel only sanitized and ≤ 40 chars; no descriptions, VPAs or counterparty names ever leave Sentinel.
- Uncertainty always disclosed: `confidence`, `variance_band`, conservative values.
- Validators are the same code in Sentinel and the Action Service, so "validated" and "executed" cannot disagree.
- Sentinel never states advice; SIP results always carry `illustrative: true`.

---

## I. Errors and recovery
| Category | Condition | Status returned | Caller handling | Retryable |
| --- | --- | --- | --- | --- |
| Invalid input | Schema violation, identity param, literal fact | `INVALID_INPUT` | Caller fixes params; specialists report `ERROR` if repeated | No |
| Missing data | No snapshot / unknown entity / not enough history | `SNAPSHOT_NOT_FOUND` / `UNKNOWN_ENTITY` / `INSUFFICIENT_HISTORY` | New snapshot / ask user / qualitative answer | Snapshot only |
| Stale data | Snapshot older than 24 h | `DATA_STALE` | New snapshot | Yes |
| Unsupported | Period not current for rebalance; > limits | `INVALID_INPUT` with detail `UNSUPPORTED_PARAM` | — | No |
| Timeout | Deadline exceeded | `TIMEOUT` | One retry by the gateway caller | Yes, once |
| Internal failure | Bug, DB read error | `INTERNAL_ERROR` | One retry; then `ERROR` upstream | Once |
| Authorization | Caller not allowed | `FORBIDDEN` (gateway) | Security event | No |
| Cancellation | AbortSignal | `TIMEOUT` with detail `CANCELLED` | Discarded | No |
Persistence failure and partial completion do not apply (Sentinel writes nothing; each function returns a whole result or an error).

---

## J. Testing
| Type | Tests |
| --- | --- |
| Unit | Each formula in B.6 with golden numbers; percentile and median helpers; rounding; tier boundaries (7999/8000/10000/10001 bp); cap 0; days at month start/end; leap February; IST midnight boundaries |
| Contract | Every function's params/data validated against schema files; `SentinelResult@1` envelope; `DataQuality@1` equality with Categorizer status |
| Edge | Zero income; declared income 0; all-uncategorized month; negative category spend after refunds; goal at target; paused goals; month override expiry; protected + FIXED donors excluded; parent cap with a capped leaf; stale balance; no balance |
| Negative | Identity param; literal for `outlays`; unknown function; caller not on allowlist; params out of range |
| Security | Static import check (no LLM); write attempt with `sentinel_ro` fails; cross-user snapshot access returns `SNAPSHOT_NOT_FOUND`/404 |
| Determinism | Replay 1,000 random requests twice; byte-identical `data` |
| Backtest | Bill forecast, simulation bands, velocity projection on held-out months; error thresholds recorded per `model_version` |
| Integration | Categorizer correction → new snapshot → utilization changes; Action Service and Sentinel validators agree (SEN-AC-06) |
| Performance | Load test at 24 months × 300 rows/user, p95 per B.8 |

---

## K. Implementation handoff
### K.1 Modules (`backend/src/engines/sentinel/`)
| Module | Responsibility |
| --- | --- |
| `index.js` | `run(functionName, params, ctx)` dispatcher, envelope, confidence capping |
| `inputs/load.js` | Reads snapshot inputs via Snapshot Service helpers |
| `ledger/spend.js` | Spend definition (wraps `shared/finance/movement.js`), cap coverage, buckets |
| `functions/*.js` | One file per function in B.6 |
| `stats/*.js` | Median, percentile, CV, cadence detection, empirical bands |
| `rules/goal.js`, `rules/cap.js`, `rules/rebalance.js`, `rules/balance.js`, `rules/profile.js` | Rule library (also imported by Action Service) |
| `registry/<model_version>.json`, `registry/index.js` | Parameter registry |
| `schemas/*.json` | Function schemas |

### K.2 Public interface
```js
/** @param {string} fn @param {object} params @param {{snapshot:Snapshot, caller:string, requestId:string, traceId:string, signal:AbortSignal}} ctx
 *  @returns {Promise<SentinelResult>} */
async function run(fn, params, ctx) {}
module.exports.rules = { validateGoalChange, validateCapChange, validateRebalance, checkAvailableBalance, validateProfile };
```

### K.3 Configuration
`SENTINEL_MODEL_VERSION` (active registry), `SENTINEL_CACHE_ENABLED` (default true), deadlines from `runtime.*` (SC §15.3).

### K.4 Definition of done
SEN-AC-01…20 pass; registry v1 committed; method notes for anomaly, cadence, simulation bands and income committed under `engines/sentinel/METHODS.md` (method, assumptions, parameters, minimum history, seasonality and irregular-income handling, uncertainty expression); Workspace API views for the Sentinel workspace render from these functions only.

### K.5 Must be complete before integration
Snapshot Service read helpers; Categorizer `categorized_as_of` view; shared `movement.js` and `coverage.js`; gateway allowlist table (SC §10.4).
