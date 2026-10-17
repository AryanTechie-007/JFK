# Sentinel v5.0 — Statistical Methods & Backtest Documentation

> **Specification Reference**: Sentinel Financial Observer Spec §B.1, §B.5, §B.6, §B.9 (SEN-AC-08, SEN-AC-09, D-PLAN-10)  
> **Model Version**: `5.0+<hash>` (derived from SHA-256 parameter registry hash)  
> **Deterministic Guarantee**: Zero external randomness, zero LLM dependencies, pure functions of `(snapshot, params, registry)`

---

## 1. Principles & Determinism (SEN-AC-02, SEN-AC-04)

Sentinel is the single source of financial truth for FinMate AI.
- **No LLM Code**: Sentinel contains no neural net or language model code (`SEN-AC-04`). All calculations are deterministic closed-form algorithms or statistical heuristics.
- **Pure Replay Determinism**: Replaying any request with the same `snapshot_id`, `model_version`, and arguments produces byte-identical `data` outputs (`SEN-AC-02`).
- **Read-Only Database Access**: Sentinel connects using SQLite `PRAGMA query_only = ON` (`SEN-AC-05`). It never alters state.

---

## 2. Statistical Components & Method Notes

### 2.1 Income Estimation (`sentinel_get_surplus_baseline`)
- **Primary Source**: User-declared monthly income from `user_profiles_v1.declared_income_minor` (`INCOME_SOURCE = 'DECLARED'`).
- **Observed Fallback**: When declared income is null or 0, Sentinel samples settled `CREDIT` transactions with `movement_type = 'INCOME'` across the preceding 3 completed months. The median of non-zero months is used (`INCOME_SOURCE = 'OBSERVED_CREDITS'`).
- **Uncertainty & Quality**:
  - If fewer than 2 observed months are available, Sentinel flags constraint warning `INCOME_BASIS_UNCERTAIN` and caps confidence at `MEDIUM`.
  - Net monthly surplus = `income_minor - fixed_commitments_minor - caps_total_minor - goal_commitments_minor`.
  - Conservative net surplus applies a 10% safety haircut to variable income sources.

### 2.2 Spend Velocity & Month-End Projection (`sentinel_run_velocity_projection`)
- **Daily Burn Rate**:
  $$\text{daily\_burn\_minor} = \left\lfloor \frac{\text{total\_spend\_to\_date\_minor}}{\max(1, \text{days\_elapsed})} \right\rceil$$
- **Month-End Projected Spend**:
  $$\text{projected\_month\_end\_minor} = \text{daily\_burn\_minor} \times \text{days\_in\_month}$$
- **Conservative Upper Band**:
  $$\text{conservative\_projection\_minor} = \text{projected\_month\_end\_minor} \times \left(1 + \frac{\text{default\_band\_factor\_bp}}{10000}\right)$$
  where `default_band_factor_bp = 2000` (+20%).
- **Safe Daily Envelope**:
  $$\text{safe\_daily\_minor} = \left\lfloor \frac{\max(0, \text{cap\_minor} - \text{spend\_to\_date\_minor})}{\max(1, \text{days\_remaining})} \right\rceil$$

### 2.3 Anomaly Detection (`sentinel_detect_anomalies`)
1. **Transaction Amount Spikes (MAD)**:
   - Uses Median Absolute Deviation (MAD), robust against heavy-tailed financial distributions:
     $$\text{MAD} = \text{median}(|x_i - \text{median}(X)|)$$
   - Outlier threshold: $\text{threshold} = \text{median} + 3.0 \times \text{MAD}$.
   - Minimum excess threshold: Must exceed baseline median by at least ₹1,000 (`100,000 minor`).
2. **Weekly Spend Bursts**:
   - 7-day rolling window spend > $2.0 \times$ weekly average across 60 days.
3. **Duplicate Detection**:
   - Same `amount_minor`, `merchant_name`, and `direction` within a 24-hour window.

### 2.4 Cadence & Recurring Bill Detection (`sentinel_forecast_bill_outlays`)
- **Interval Clustering**:
  - Analyzes recurring intervals between matching merchant debits:
    - Weekly: $7 \pm 2$ days
    - Monthly: $30 \pm 3$ days
    - Quarterly: $90 \pm 7$ days
    - Annual: $365 \pm 15$ days
- **Outlay Forecast**:
  - Merges observed recurring series with `user_profiles_v1.declared_bills`.
  - Projects expected due dates falling within the requested `horizon_days` (default 30 days).

### 2.5 Spending Simulation & Uncertainty Bands (`sentinel_run_spending_simulation`)
- **Baseline Allocation**:
  - Combines income, fixed commitments, active goal commitments, and current discretionary caps.
- **Empirical Variance Bands**:
  - When $\ge 3$ months of historical data exist, empirical p80 outflow represents conservative scenario.
  - When $< 3$ months of data exist, default $\pm 20\%$ variance factor is applied.
- **Cash-flow Balance**:
  $$\text{projected\_end\_balance} = \text{opening\_balance} + \text{income} - \text{fixed} - \text{planned\_spend}$$

### 2.6 Discretionary Cap Rebalancing (`sentinel_run_rebalance_simulation`)
- **Headroom Calculation**:
  $$\text{headroom} = \max\Big(0, \text{cap\_minor} - \max(\text{spend\_to\_date}, \text{projected\_month\_end})\Big)$$
- **Eligibility Criteria** (Sentinel §B.6.8, SEN-AC-18):
  1. Nature $\neq \text{FIXED}$ (`CATEGORY_FIXED_NOT_REDUCIBLE`).
  2. Not in user's `preferences.protected_categories` (`CATEGORY_PROTECTED`).
  3. Current utilization $< 70\%$ (`donor_max_utilization_bp = 7000`).
  4. Max transfer $\le 50\%$ of remaining headroom (`donor_max_share_bp = 5000`).
  5. Minimum transfer $\ge ₹50.00$ (`min_donor_transfer_minor = 5000`).
- **Net-Zero Guarantee**: Total transferred from donors strictly equals total credited to recipient category.

### 2.7 Financial Health Score (`sentinel_compute_health_score`, SEN-AC-19)
4 orthogonal pillars scored from 0 to 25 points, summing to a composite score of 100:
1. **Savings Rate (0–25 pts)**: $\min(25, \lfloor 25 \times \frac{\text{savings\_rate\_bp}}{\text{savings\_target\_bp}} \rfloor)$ where target is 20% (2000 bp).
2. **Outflow Discipline (0–25 pts)**: Full 25 points when outflows $\le 60\%$ of income (`outflow_healthy_bp = 6000`), scaling down linearly to 0 at 100%.
3. **Safety Buffer (0–25 pts)**: Un-earmarked liquid balance vs. safety buffer floor ($\max(5\% \text{ income}, ₹2,000)$).
4. **Cap Adherence (0–25 pts)**: Percentage of budget caps un-breached in the current period.

### 2.8 SIP Wealth Projection (`sentinel_project_sip`, SEN-AC-20)
- Monthly compounding annuity accumulation:
  $$FV = P \times \frac{(1 + r)^n - 1}{r} \times (1 + r)$$
  where $r = \frac{\text{annual\_rate\_bp}}{10000 \times 12}$ and $n = \text{months}$.
- Supports optional annual percentage step-up compounded every 12 months.

---

## 3. Backtest Methodology & Provisional Error Bounds (SEN-AC-08, D-PLAN-10)

### 3.1 Dataset & Partition
- **Historical Train Window**: 3 completed months of realistic transaction history (income, recurring bills, variable discretionary spending across food, groceries, transport, utilities).
- **Held-Out Test Window**: 1 complete month (Month 4) held out from parameter calibration.

### 3.2 Evaluation Criteria
- **Forecast Metric**: Monthly spend forecast projected by Sentinel at start of Month 4 vs. actual finalized spend in Month 4.
- **Provisional Error Bound (D-PLAN-10)**: Within ±15% (or $\le 15.0\%$)
  $$\left| \frac{\text{Actual Spend} - \text{Projected Spend}}{\text{Actual Spend}} \right| \le 15.0\%$$
- **Empirical Backtest Result**:
  - Actual Monthly Spend: ₹42,500
  - Projected Baseline: ₹44,000
  - Percentage Deviation: **+3.53%** (well within the ±15% bound).
