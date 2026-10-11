# Sentinel v5.0 — Mathematical & Statistical Methods (`METHODS.md`)

**Component:** Sentinel — Financial Observer, Predictor & Rule Library (`backend/src/engines/sentinel/`)  
**Model Version:** `5.0.0` (semver, parameter registry at `registry/5.0.0.json`)  
**Specification Reference:** `docs/specifications/sentinel-financial-observer-spec.md` (§B, §C, §H, §K.4) & `docs/specifications/system-contracts.md` (§4, §5, §6, §8, §10, §12)

---

## 1. Numeric Precision & Rounding Invariants (§H)

1. **Integer Minor Units (`_minor`)**: Every monetary input, intermediate accumulator, and output is represented in integer paise ($\text{INR} \times 100$). No IEEE-754 floating-point arithmetic is used on `_minor` money fields.
2. **Integer Basis Points (`_bp`)**: Every ratio, utilization percentage, interest rate, step-up rate, and confidence threshold is represented in integer basis points ($10{,}000\text{ bp} = 100.00\%$).
3. **Banker's Rounding (`ROUND_HALF_EVEN`)**: All divisions, basis-point multiplications, quantile interpolations, and compound interest steps use exact half-to-even rounding via `BigInt` (`halfEvenRoundBigInt`) and `decimal.js` (`Decimal.ROUND_HALF_EVEN`, precision 36).

---

## 2. Single-Truth Spend Definition & Exclusive Cap Partition (§B.4, SC §5.7, §6.2)

### 2.1 Spend Definition (`ledger/spend.js`)
For any category set $C$ and calendar period $P$ (`YYYY-MM` in `Asia/Kolkata`):
- Only rows with `status != 'PENDING'`, `is_duplicate == false`, and `superseded_by == null` are countable (`SEN-AC-13`).
- Spend debits (`EXPENSE`, `FEE`, `LOAN_REPAYMENT` with `direction = 'DEBIT'`) add $+a_i$ to `spent_signed_minor`.
- Spend offset credits (`REFUND`, `REVERSAL`, `CHARGEBACK` with `direction = 'CREDIT'`) subtract $-a_i$ from `spent_signed_minor`.
- Own-account transfers (`TRANSFER_INTERNAL`, `TRANSFER_EXTERNAL`), credit-card bill settlements (`CARD_PAYMENT`), ATM cash withdrawals (`CASH_WITHDRAWAL`), and income/interest credits contribute $0$ to category spend.
- $\text{spent\_total\_minor}(C, P) = \max(0, \text{spent\_signed\_minor}(C, P))$.
- Identical spend totals are guaranteed across `sentinel_run_category_utilization`, `sentinel_get_ledger_summary`, `sentinel_get_spending_timeseries`, and `sentinel_compute_health_score` (`SEN-AC-14`).

### 2.2 Exclusive Cap Coverage Partition (`getCoveredLeafIds`, `SEN-AC-16`)
- `FIXED` and `SAVING`/`INCOME` leaves have `covered_category_ids = []` under cap coverage (a contradictory cap on a `FIXED` leaf covers no discretionary spend, §C.5).
- A cap on a discretionary leaf $c$ covers $[c]$.
- A cap on a parent category $P$ covers all discretionary leaves $c \in \text{leaves}(P)$ that do **not** have their own cap in period $P$.
- Consequently, every discretionary transaction belongs to at most one cap, and:
  $$\sum_{k \in \text{Caps}} \text{spent\_total\_minor}(k) + \sum_{u \in \text{Uncapped}} \text{spent\_total\_minor}(u) = \text{Total Discretionary Category Spend}$$

---

## 3. Statistical Estimators & Uncertainty Bands (`stats/`)

1. **Median & MAD (`stats/math.js`)**:
   - Sample median uses exact half-even tie-breaking on even sample sizes.
   - Median Absolute Deviation: $\text{MAD}(X) = \text{median}(|x_i - \text{median}(X)|)$.
2. **Empirical Quantiles (`p20Minor`, `p80Minor`)**:
   - Order-statistic linear interpolation in `Decimal` with half-even rounding.
   - Used for observed income conservative estimate ($P_{25}$), spending simulation conservative outflow ($P_{80}$ over trailing 6 months), and recurring bill variance bands ($[P_{20}, P_{80}]$).
3. **Recurring Cadence Detection (`stats/cadence.js`)**:
   - Groups settled `EXPENSE` debits by resolved `merchant_id` (collapsing same-day swipes).
   - Matches median inter-arrival gap against `WEEKLY` ($7 \pm 2\text{d}$), `MONTHLY` ($30 \pm 5\text{d}$), `QUARTERLY` ($91 \pm 10\text{d}$), and `YEARLY` ($365 \pm 10\text{d}$).
   - Merges detected bills within $\pm 5\text{ days}$ and $\pm 10\%$ (`1000 bp`) of an active user-declared bill in favour of the declared bill (§B.6.13).
4. **Anomaly Detection (`functions/anomalies.js`)**:
   - `DUPLICATE_SWIPE`: Identical merchant, identical `amount_minor`, same `txn_date` (`dup_window_days = 0`), both `POSTED`.
   - `SPIKE`: Single transaction exceeding trailing category baseline by $\max(3 \times \text{MAD}, \text{spike\_min\_minor})$ (or $\mu + 3\sigma$ when $n \ge 10$).
   - `PRICE_CREEP`: Recurring monthly merchant whose latest charge exceeds the prior cycle's charge by $> 500\text{ bp}$ ($5\%$).
5. **SIP Compounding (`functions/sip.js`, `SEN-AC-20`)**:
   - Annuity-due month-by-month compounding with annual step-up applied every 12 months:
     $$I_m = \begin{cases} I_1 & m = 1 \\ I_{m-1} + \text{round\_half\_even}(I_{m-1} \times \text{step\_up\_bp} / 10000) & m > 1 \land (m - 1) \bmod 12 = 0 \\ I_{m-1} & \text{otherwise} \end{cases}$$
     $$V_m = (V_{m-1} + I_m) + \text{round\_half\_even}\left(\frac{(V_{m-1} + I_m) \times \text{annual\_rate\_bp}}{120000}\right)$$
