/**
 * Sentinel v5.0 — Deterministic Financial Observer, Predictor, and Rule Library
 * Implements all 17 functions in SC §10.4 & Sentinel §B.6 with integer paise (`_minor`),
 * basis points (`_bp`), empirical variance bands, and `SentinelResult@1` envelopes.
 */

const { newId, toCanonicalUserId } = require('../../shared/ids');
const {
  halfEvenRoundBigInt,
  multiplyMinorByBp,
  ratioToBp,
} = require('../../shared/money');
const {
  isActiveRow,
  isSpendDebit,
  isSpendOffsetCredit,
  isSettledStatus,
  computeCategorySpend,
} = require('../../shared/finance/movement');
const { capConfidenceByDataQuality } = require('../../shared/finance/coverage');
const { getTransactionsAsOf, getStatus } = require('../categorizer');
const {
  CATEGORIES,
  getCategoryDisplayName,
  isFixedCategory,
} = require('../categorizer/taxonomy');
const {
  getCanonicalProfile,
  getGoalsForUser,
  getCapsForUser,
} = require('../../platform/profile');
const { getSnapshot, createSnapshot } = require('../../platform/snapshot');
const { MODEL_VERSION, SENTINEL_PARAMS } = require('./params');
const rules = require('./rules');
const {
  makeConstraint,
  validateGoalChange,
  validateCapChange,
  validateRebalance,
  checkAvailableBalance,
  validateProfile,
} = rules;

function getMonthDays(periodStr) {
  const [y, m] = String(periodStr || '2026-10').split('-').map(Number);
  return new Date(y || 2026, m || 10, 0).getDate();
}

function getPreviousMonths(currentMonthStr, count = 3) {
  const [y, m] = String(currentMonthStr || '2026-10').split('-').map(Number);
  const result = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    result.push(d.toISOString().slice(0, 7));
  }
  return result;
}

function addMonthsToYearMonth(yearMonthStr, monthsToAdd) {
  const [y, m] = String(yearMonthStr || '2026-10').split('-').map(Number);
  const d = new Date(Date.UTC(y, (m - 1) + monthsToAdd, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Loads pinned state for a snapshot
 */
function loadSnapshotState(snapshotOrId, userIdFallback = null) {
  let snap =
    typeof snapshotOrId === 'object' && snapshotOrId?.snapshot_id
      ? snapshotOrId
      : getSnapshot(snapshotOrId);

  if (!snap) {
    const uid = toCanonicalUserId(userIdFallback || 'usr_00000000000000000000000001');
    snap = createSnapshot(uid);
  }

  const userId = snap.user_id;
  const profile = getCanonicalProfile(userId);
  const goals = getGoalsForUser(userId, true, snap.current_month_ist);
  const activeOrPausedGoals = goals.filter((g) => g.status !== 'ARCHIVED');
  const caps = getCapsForUser(userId, snap.current_month_ist);
  const allTxns = getTransactionsAsOf(userId, snap.ledger_version);
  const currentMonthTxns = allTxns.filter((t) =>
    String(t.txn_date).startsWith(snap.current_month_ist)
  );
  const dataQuality = getStatus(userId, snap.ledger_version);

  // Compute spend by category for current month
  const spendByCategory = {};
  for (const cat of CATEGORIES) {
    const s = computeCategorySpend(currentMonthTxns, cat.category_id);
    if (s.total_spend_minor > 0) {
      spendByCategory[cat.category_id] = s;
    }
  }
  // Also compute for any parent or custom category in caps
  for (const cap of caps) {
    if (!spendByCategory[cap.category_id]) {
      spendByCategory[cap.category_id] = computeCategorySpend(currentMonthTxns, cap.category_id);
    }
  }

  // Compute income_minor & income_source (SC §6.4)
  let incomeMinor = Number(profile.declared_income_minor) || 0;
  let incomeSource = 'DECLARED';
  const prevMonths = getPreviousMonths(snap.current_month_ist, 3);
  const observedMonthlyIncomes = prevMonths.map((pm) => {
    return allTxns
      .filter(
        (t) =>
          isActiveRow(t) &&
          String(t.txn_date).startsWith(pm) &&
          t.direction === 'CREDIT' &&
          t.movement_type === 'INCOME' &&
          isSettledStatus(t.classification_status)
      )
      .reduce((sum, t) => sum + (Number(t.amount_minor) || 0), 0);
  });
  const nonZeroObservedIncomes = observedMonthlyIncomes.filter((v) => v > 0);

  if (incomeMinor <= 0 && nonZeroObservedIncomes.length > 0) {
    const sorted = [...nonZeroObservedIncomes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    incomeMinor =
      sorted.length % 2 !== 0
        ? sorted[mid]
        : halfEvenRoundBigInt(sorted[mid - 1] + sorted[mid], 2);
    incomeSource = 'OBSERVED_CREDITS';
  }

  // Fixed commitments (SC §6.4): user-declared fixed_expense_lines
  const fixedCommitmentsMinor = (profile.fixed_expense_lines || []).reduce(
    (sum, l) => sum + (Number(l.monthly_amount_minor) || 0),
    0
  );

  // Active goal commitments
  const goalCommitmentsMinor = activeOrPausedGoals
    .filter((g) => g.status === 'ACTIVE')
    .reduce((sum, g) => sum + (Number(g.effective_monthly_add_minor) || 0), 0);

  return {
    snapshot: snap,
    user_id: userId,
    current_date_ist: snap.current_date_ist,
    current_month_ist: snap.current_month_ist,
    profile,
    preferences: profile.preferences,
    accounts: profile.accounts,
    declared_bills: profile.declared_bills,
    goals: activeOrPausedGoals,
    all_goals_including_archived: goals,
    caps,
    all_txns: allTxns,
    current_month_txns: currentMonthTxns,
    spendByCategory,
    data_quality: dataQuality,
    income_minor: incomeMinor,
    income_source: incomeSource,
    observed_income_months_count: nonZeroObservedIncomes.length,
    fixed_commitments_minor: fixedCommitmentsMinor,
    goal_commitments_minor: goalCommitmentsMinor,
  };
}

function buildEnvelope(state, functionName, data, intrinsicConfidence = 'HIGH', extraConstraints = [], status = 'OK', error = null) {
  const dq = state.data_quality;
  const constraints = [...extraConstraints];

  if (dq.coverage_bp < SENTINEL_PARAMS.medium_coverage_floor_bp) {
    if (!constraints.some((c) => c.code === 'LOW_CATEGORIZATION_COVERAGE')) {
      constraints.push(
        makeConstraint('LOW_CATEGORIZATION_COVERAGE', { coverage_bp: dq.coverage_bp }, 'WARNING')
      );
    }
  }
  if (dq.provisional_share_bp > SENTINEL_PARAMS.medium_provisional_ceiling_bp) {
    if (!constraints.some((c) => c.code === 'PROVISIONAL_DATA_DOMINANT')) {
      constraints.push(
        makeConstraint(
          'PROVISIONAL_DATA_DOMINANT',
          { provisional_share_bp: dq.provisional_share_bp },
          'WARNING'
        )
      );
    }
  }
  if (!dq.complete) {
    if (!constraints.some((c) => c.code === 'IMPORT_IN_PROGRESS')) {
      constraints.push(makeConstraint('IMPORT_IN_PROGRESS', {}, 'WARNING'));
    }
  }

  const finalConfidence = capConfidenceByDataQuality(
    intrinsicConfidence,
    dq.coverage_bp,
    dq.provisional_share_bp,
    dq.complete
  );

  return {
    schema: 'SentinelResult@1',
    tool_result_id: newId('trs'),
    function: functionName,
    function_name: functionName,
    snapshot_id: state.snapshot.snapshot_id,
    categorization_version: state.snapshot.ledger_version || 1,
    ledger_version: state.snapshot.ledger_version,
    plan_version: state.snapshot.plan_version,
    model_version: MODEL_VERSION,
    params_hash: SENTINEL_PARAMS.params_hash,
    status,
    confidence: finalConfidence,
    data_quality: {
      coverage_bp: dq.coverage_bp,
      provisional_share_bp: dq.provisional_share_bp,
      needs_review_count: dq.needs_review_count,
      uncategorized_amount_minor: dq.uncategorized_amount_minor,
      complete: dq.complete,
    },
    constraints_triggered: constraints,
    warnings: constraints,
    computed_at: new Date().toISOString(),
    data,
    value: data,
    error,
  };
}

// ============================================================================
// 1. sentinel_get_surplus_baseline
// ============================================================================
function sentinel_get_surplus_baseline(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const lookbackMonths = Number(args.lookback_months) || 3;
  const prevMonths = getPreviousMonths(state.current_month_ist, lookbackMonths);

  const fixedCategoryIds = new Set(
    (state.profile.fixed_expense_lines || []).map((l) => l.category_id)
  );

  // Discretionary spend in each lookback month (excluding fixed expense line categories)
  const monthlyDiscretionaryTotals = prevMonths.map((pm) => {
    const mTxns = state.all_txns.filter(
      (t) =>
        String(t.txn_date).startsWith(pm) &&
        (!t.category_id || !fixedCategoryIds.has(t.category_id))
    );
    return computeCategorySpend(mTxns, null).total_spend_minor;
  });

  const nonZeroMonths = monthlyDiscretionaryTotals.filter((v) => v > 0);
  // Also include current month if lookback has no history
  const currentMonthDiscTxns = state.current_month_txns.filter(
    (t) => !t.category_id || !fixedCategoryIds.has(t.category_id)
  );
  const currentMonthDiscSpend = computeCategorySpend(currentMonthDiscTxns, null).total_spend_minor;

  const sample = nonZeroMonths.length > 0 ? nonZeroMonths : [currentMonthDiscSpend];
  const avgDiscretionaryMinor = halfEvenRoundBigInt(
    sample.reduce((s, v) => s + v, 0),
    sample.length
  );
  const p80DiscretionaryMinor =
    sample.length >= 2
      ? Math.max(...sample)
      : multiplyMinorByBp(avgDiscretionaryMinor, 10000 + SENTINEL_PARAMS.default_band_factor_bp);

  const constraints = [];
  let intrinsicConf = sample.length >= 3 ? 'HIGH' : sample.length >= 1 ? 'MEDIUM' : 'LOW';
  if (state.income_source === 'OBSERVED_CREDITS' && state.observed_income_months_count < 2) {
    constraints.push(makeConstraint('INCOME_BASIS_UNCERTAIN', {}, 'WARNING'));
    intrinsicConf = 'LOW';
  }

  const expectedSurplusMinor =
    state.income_minor -
    state.fixed_commitments_minor -
    avgDiscretionaryMinor -
    state.goal_commitments_minor;

  const conservativeIncomeMinor =
    state.income_source === 'OBSERVED_CREDITS'
      ? multiplyMinorByBp(state.income_minor, 9000)
      : state.income_minor;

  const conservativeSurplusMinor =
    conservativeIncomeMinor -
    state.fixed_commitments_minor -
    p80DiscretionaryMinor -
    state.goal_commitments_minor;

  const bufferFloorMinor = Math.max(
    multiplyMinorByBp(state.income_minor, SENTINEL_PARAMS.buffer_floor_income_bp),
    SENTINEL_PARAMS.buffer_floor_min_minor
  );

  return buildEnvelope(
    state,
    'sentinel_get_surplus_baseline',
    {
      income_minor: state.income_minor,
      declared_income_minor: state.income_minor,
      income_source: state.income_source,
      fixed_commitments_minor: state.fixed_commitments_minor,
      fixed_outflows_minor: state.fixed_commitments_minor,
      discretionary_baseline_minor: avgDiscretionaryMinor,
      discretionary_p80_minor: p80DiscretionaryMinor,
      goal_commitments_minor: state.goal_commitments_minor,
      expected_surplus_signed_minor: expectedSurplusMinor,
      conservative_surplus_signed_minor: conservativeSurplusMinor,
      feasible_surplus_minor: Math.max(0, expectedSurplusMinor),
      conservative_surplus_minor: Math.max(0, conservativeSurplusMinor),
      buffer_floor_minor: bufferFloorMinor,
      sample_months: nonZeroMonths.length,
    },
    intrinsicConf,
    constraints
  );
}

// ============================================================================
// 2. sentinel_get_ledger_summary
// ============================================================================
function sentinel_get_ledger_summary(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const timeframeMonths = Number(args.timeframe_months) || 1;
  const categoryScope = Array.isArray(args.category_scope) && args.category_scope.length > 0
    ? args.category_scope
    : null;

  const targetMonths =
    timeframeMonths === 1
      ? [state.current_month_ist]
      : [state.current_month_ist, ...getPreviousMonths(state.current_month_ist, timeframeMonths - 1)];

  const windowTxns = state.all_txns.filter((t) =>
    targetMonths.some((m) => String(t.txn_date).startsWith(m))
  );

  const categoryTotalsMap = {};
  const merchantTotalsMap = {};
  let uncategorizedSpendMinor = 0;

  for (const t of windowTxns) {
    if (!isActiveRow(t)) continue;
    if (!isSpendDebit(t) && !isSpendOffsetCredit(t)) continue;

    if (categoryScope) {
      const inScope = categoryScope.some(
        (sc) => t.category_id === sc || (t.category_id && t.category_id.startsWith(`${sc}.`))
      );
      if (!inScope) continue;
    }

    const catId = t.category_id || 'UNCATEGORIZED';
    if (catId === 'UNCATEGORIZED') {
      if (isSpendDebit(t)) uncategorizedSpendMinor += Number(t.amount_minor) || 0;
    }

    if (!categoryTotalsMap[catId]) {
      categoryTotalsMap[catId] = {
        category_id: catId,
        display_name: getCategoryDisplayName(catId),
        txns: [],
        count: 0,
      };
    }
    categoryTotalsMap[catId].txns.push(t);
    if (isSpendDebit(t)) categoryTotalsMap[catId].count += 1;

    // Top merchants only from settled rows with resolved merchant_display_name
    if (isSpendDebit(t) && isSettledStatus(t.classification_status) && t.merchant_display_name) {
      const mKey = t.merchant_id || t.merchant_display_name;
      if (!merchantTotalsMap[mKey]) {
        merchantTotalsMap[mKey] = {
          merchant_id: t.merchant_id || mKey,
          merchant_display_name: t.merchant_display_name,
          category_id: catId,
          spend_minor: 0,
          txn_count: 0,
        };
      }
      merchantTotalsMap[mKey].spend_minor += Number(t.amount_minor) || 0;
      merchantTotalsMap[mKey].txn_count += 1;
    }
  }

  const grandSpend = computeCategorySpend(windowTxns, null);
  const categories = Object.values(categoryTotalsMap)
    .map((entry) => {
      const s = computeCategorySpend(entry.txns, entry.category_id === 'UNCATEGORIZED' ? null : entry.category_id);
      const monthlyAvgMinor = halfEvenRoundBigInt(s.total_spend_minor, timeframeMonths);
      return {
        category_id: entry.category_id,
        display_name: entry.display_name,
        settled_spend_minor: s.settled_spend_minor,
        provisional_spend_minor: s.provisional_spend_minor,
        total_spend_minor: s.total_spend_minor,
        monthly_avg_minor: monthlyAvgMinor,
        monthly_average_minor: monthlyAvgMinor,
        share_bp: ratioToBp(s.total_spend_minor, grandSpend.total_spend_minor),
        txn_count: entry.count,
      };
    })
    .sort((a, b) => b.total_spend_minor - a.total_spend_minor);

  const topMerchants = Object.values(merchantTotalsMap)
    .sort((a, b) => b.spend_minor - a.spend_minor)
    .slice(0, 10);

  return buildEnvelope(state, 'sentinel_get_ledger_summary', {
    timeframe_months: timeframeMonths,
    months_included: targetMonths,
    total_settled_spend_minor: grandSpend.settled_spend_minor,
    total_provisional_spend_minor: grandSpend.provisional_spend_minor,
    total_spend_minor: grandSpend.total_spend_minor,
    uncategorized_spend_minor: uncategorizedSpendMinor,
    categories,
    top_merchants: topMerchants,
  });
}

// ============================================================================
// 3. sentinel_get_spending_timeseries
// ============================================================================
function sentinel_get_spending_timeseries(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const monthsCount = Number(args.months) || 6;
  const categoryId = args.category_id || null;

  const monthsList = [
    ...getPreviousMonths(state.current_month_ist, monthsCount - 1).reverse(),
    state.current_month_ist,
  ];

  const series = monthsList.map((m) => {
    const mTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(m));
    const s = computeCategorySpend(mTxns, categoryId);
    const incomeMinor = mTxns
      .filter((t) => isActiveRow(t) && t.direction === 'CREDIT' && t.movement_type === 'INCOME')
      .reduce((acc, t) => acc + (Number(t.amount_minor) || 0), 0);
    return {
      period: m,
      settled_spend_minor: s.settled_spend_minor,
      provisional_spend_minor: s.provisional_spend_minor,
      total_spend_minor: s.total_spend_minor,
      observed_income_minor: incomeMinor,
    };
  });

  return buildEnvelope(state, 'sentinel_get_spending_timeseries', {
    category_id: categoryId,
    months: monthsCount,
    series,
  });
}

// ============================================================================
// 5. sentinel_run_category_utilization
// ============================================================================
function sentinel_run_category_utilization(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const period = args.period || state.current_month_ist;
  const targetCategory = args.category_id || null;

  const periodTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(period));
  const caps = getCapsForUser(state.user_id, period);

  const daysInMonth = getMonthDays(period);
  const currentDateStr = state.current_date_ist || new Date().toISOString().slice(0, 10);
  const currentDay =
    period === state.current_month_ist
      ? Math.max(1, parseInt(currentDateStr.slice(8, 10), 10) || 1)
      : daysInMonth;
  const daysRemaining = Math.max(0, daysInMonth - currentDay);

  // Check recurring overspend in last 3 completed months
  const prev3Months = getPreviousMonths(period, 3);

  const rows = caps
    .filter((c) => !targetCategory || c.category_id === targetCategory)
    .map((cap) => {
      const spend = computeCategorySpend(periodTxns, cap.category_id);
      const capMinor = Number(cap.effective_amount_minor) || 0;
      const utilizationBp = capMinor > 0 ? ratioToBp(spend.total_spend_minor, capMinor) : 0;
      const settledUtilizationBp = capMinor > 0 ? ratioToBp(spend.settled_spend_minor, capMinor) : 0;
      const remainingMinor = capMinor - spend.total_spend_minor;
      const safeDailyMinor =
        daysRemaining > 0 && remainingMinor > 0
          ? halfEvenRoundBigInt(remainingMinor, daysRemaining)
          : 0;

      let tier = 'NORMAL';
      if (utilizationBp >= SENTINEL_PARAMS.severe_tier_bp) tier = 'SEVERE';
      else if (utilizationBp >= SENTINEL_PARAMS.breach_tier_bp) tier = 'BREACH';
      else if (utilizationBp >= SENTINEL_PARAMS.watch_tier_bp) tier = 'WATCH';

      // Count prior breaches in last 3 months
      let priorBreachMonths = 0;
      for (const pm of prev3Months) {
        const pmTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(pm));
        const pmSpend = computeCategorySpend(pmTxns, cap.category_id).total_spend_minor;
        if (capMinor > 0 && pmSpend > capMinor) priorBreachMonths++;
      }

      return {
        cap_id: cap.cap_id,
        category_id: cap.category_id,
        display_name: cap.category_display_name,
        cap_minor: capMinor,
        standing_cap_minor: cap.standing_amount_minor,
        has_month_override: cap.has_month_override,
        settled_spend_minor: spend.settled_spend_minor,
        provisional_spend_minor: spend.provisional_spend_minor,
        total_spend_minor: spend.total_spend_minor,
        remaining_signed_minor: remainingMinor,
        excess_minor: Math.max(0, spend.total_spend_minor - capMinor),
        utilization_bp: utilizationBp,
        settled_utilization_bp: settledUtilizationBp,
        tier,
        watching: Boolean(cap.watching),
        safe_daily_minor: safeDailyMinor,
        prior_breach_months_in_3m: priorBreachMonths,
        recurring_overspend: priorBreachMonths >= 2,
      };
    });

  // Also include uncapped categories that have spend in the period
  const uncappedCategories = [];
  if (!targetCategory) {
    for (const cat of CATEGORIES) {
      if (caps.some((c) => c.category_id === cat.category_id)) continue;
      const spend = computeCategorySpend(periodTxns, cat.category_id);
      if (spend.total_spend_minor > 0) {
        uncappedCategories.push({
          category_id: cat.category_id,
          display_name: cat.display_name,
          settled_spend_minor: spend.settled_spend_minor,
          provisional_spend_minor: spend.provisional_spend_minor,
          total_spend_minor: spend.total_spend_minor,
        });
      }
    }
  }

  const constraints = [];
  if (rows.some((r) => r.recurring_overspend)) {
    constraints.push(makeConstraint('RECURRING_OVERSPEND_PATTERN', {}, 'WARNING'));
  }

  const totalCapMinor = rows.reduce((s, r) => s + r.cap_minor, 0);
  const totalCappedSpendMinor = rows.reduce((s, r) => s + r.total_spend_minor, 0);
  const totalRemainingMinor = Math.max(0, totalCapMinor - totalCappedSpendMinor);
  const overallSafeDailyMinor =
    daysRemaining > 0 ? halfEvenRoundBigInt(totalRemainingMinor, daysRemaining) : 0;

  return buildEnvelope(
    state,
    'sentinel_run_category_utilization',
    {
      period,
      days_elapsed: currentDay,
      days_in_month: daysInMonth,
      days_remaining: daysRemaining,
      total_cap_minor: totalCapMinor,
      total_capped_spend_minor: totalCappedSpendMinor,
      overall_safe_daily_minor: overallSafeDailyMinor,
      categories: rows,
      uncapped_categories: uncappedCategories,
    },
    'HIGH',
    constraints
  );
}

// ============================================================================
// 6. sentinel_run_velocity_projection
// ============================================================================
function sentinel_run_velocity_projection(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const period = args.period || state.current_month_ist;
  const targetCategory = args.category_id || null;

  const utilRes = sentinel_run_category_utilization(state, { period, category_id: targetCategory });
  const daysElapsed = Math.max(1, utilRes.data.days_elapsed);
  const daysInMonth = utilRes.data.days_in_month;

  const projections = utilRes.data.categories.map((cat) => {
    const dailyVelocityMinor = halfEvenRoundBigInt(cat.total_spend_minor, daysElapsed);
    const projectedMonthEndMinor = dailyVelocityMinor * daysInMonth;
    const projectedConservativeMinor = multiplyMinorByBp(
      projectedMonthEndMinor,
      10000 + SENTINEL_PARAMS.default_band_factor_bp
    );
    const projectedUtilizationBp =
      cat.cap_minor > 0 ? ratioToBp(projectedMonthEndMinor, cat.cap_minor) : 0;

    let exhaustionDays = null;
    if (dailyVelocityMinor > 0 && cat.remaining_signed_minor > 0) {
      exhaustionDays = Math.floor(cat.remaining_signed_minor / dailyVelocityMinor);
    } else if (cat.remaining_signed_minor <= 0) {
      exhaustionDays = 0;
    }

    return {
      category_id: cat.category_id,
      display_name: cat.display_name,
      cap_minor: cat.cap_minor,
      spend_to_date_minor: cat.total_spend_minor,
      daily_velocity_minor: dailyVelocityMinor,
      projected_month_end_minor: projectedMonthEndMinor,
      projected_conservative_minor: projectedConservativeMinor,
      projected_utilization_bp: projectedUtilizationBp,
      projected_breach: cat.cap_minor > 0 && projectedMonthEndMinor > cat.cap_minor,
      days_to_exhaustion: exhaustionDays,
    };
  });

  const intrinsicConf = daysElapsed >= 10 ? 'HIGH' : daysElapsed >= 4 ? 'MEDIUM' : 'LOW';
  return buildEnvelope(
    state,
    'sentinel_run_velocity_projection',
    {
      period,
      days_elapsed: daysElapsed,
      days_in_month: daysInMonth,
      projections,
    },
    intrinsicConf
  );
}

// ============================================================================
// 7. sentinel_detect_anomalies
// ============================================================================
function sentinel_detect_anomalies(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const lookbackDays = Number(args.lookback_days) || 90;
  const cutoffDate = new Date(
    new Date(state.current_date_ist).getTime() - lookbackDays * 86400000
  )
    .toISOString()
    .slice(0, 10);

  const windowTxns = state.all_txns.filter(
    (t) => isActiveRow(t) && isSpendDebit(t) && t.txn_date >= cutoffDate
  );

  // Group by category for median & MAD calculation
  const byCat = {};
  for (const t of windowTxns) {
    const cid = t.category_id || 'UNCATEGORIZED';
    if (!byCat[cid]) byCat[cid] = [];
    byCat[cid].push(t);
  }

  const anomalies = [];
  for (const [cid, txns] of Object.entries(byCat)) {
    if (cid === 'UNCATEGORIZED' || isFixedCategory(cid)) continue;
    const amounts = txns.map((t) => Number(t.amount_minor) || 0).sort((a, b) => a - b);
    if (amounts.length < 3) continue;

    const mid = Math.floor(amounts.length / 2);
    const medianMinor =
      amounts.length % 2 !== 0
        ? amounts[mid]
        : halfEvenRoundBigInt(amounts[mid - 1] + amounts[mid], 2);

    const deviations = amounts
      .map((a) => Math.abs(a - medianMinor))
      .sort((a, b) => a - b);
    const madMinor =
      deviations.length % 2 !== 0
        ? deviations[mid]
        : halfEvenRoundBigInt(deviations[mid - 1] + deviations[mid], 2);

    const thresholdMinor =
      medianMinor +
      Math.max(
        multiplyMinorByBp(madMinor, SENTINEL_PARAMS.spike_mad_multiplier_bp),
        SENTINEL_PARAMS.spike_min_excess_minor
      );

    for (const t of txns) {
      const amt = Number(t.amount_minor) || 0;
      if (amt > thresholdMinor && amt >= medianMinor * 2) {
        anomalies.push({
          kind: 'SINGLE_TXN_SPIKE',
          txn_id: t.txn_id,
          category_id: cid,
          display_name: getCategoryDisplayName(cid),
          merchant_display_name: t.merchant_display_name || t.raw_description,
          txn_date: t.txn_date,
          amount_minor: amt,
          baseline_median_minor: medianMinor,
          excess_minor: amt - medianMinor,
          provisional: !isSettledStatus(t.classification_status),
        });
      }
    }
  }

  anomalies.sort((a, b) => b.excess_minor - a.excess_minor);

  return buildEnvelope(
    state,
    'sentinel_detect_anomalies',
    {
      lookback_days: lookbackDays,
      anomalies: anomalies.slice(0, 10),
    },
    windowTxns.length >= 10 ? 'HIGH' : 'MEDIUM'
  );
}

// ============================================================================
// 8. sentinel_run_rebalance_simulation
// ============================================================================
function sentinel_run_rebalance_simulation(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const period = args.period || state.current_month_ist;
  const targetCategoryId = args.target_category_id;
  const utilRes = sentinel_run_category_utilization(state, { period });
  const velRes = sentinel_run_velocity_projection(state, { period });

  const targetRow = utilRes.data.categories.find((c) => c.category_id === targetCategoryId);
  if (!targetRow) {
    return buildEnvelope(
      state,
      'sentinel_run_rebalance_simulation',
      null,
      'LOW',
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Cap for category ${targetCategoryId} not found.` }
    );
  }

  const neededMinor =
    args.needed_minor != null
      ? Number(args.needed_minor)
      : Math.max(targetRow.excess_minor, SENTINEL_PARAMS.min_cap_floor_minor);

  const protectedSet = new Set(state.preferences?.protected_categories || []);

  // Donor eligibility (Sentinel §B.6 #8):
  // - discretionary (not FIXED)
  // - not protected
  // - utilization_bp < 7000
  // - positive headroom above projected month-end spend
  const eligibleDonors = [];
  for (const cat of utilRes.data.categories) {
    if (cat.category_id === targetCategoryId) continue;
    if (isFixedCategory(cat.category_id)) continue;
    const isProt = [...protectedSet].some(
      (p) => p === cat.category_id || cat.category_id.startsWith(`${p}.`)
    );
    if (isProt) continue;
    if (cat.utilization_bp >= SENTINEL_PARAMS.donor_max_utilization_bp) continue;

    const vel = velRes.data.projections.find((p) => p.category_id === cat.category_id);
    const projectedSpendMinor = vel ? vel.projected_month_end_minor : cat.total_spend_minor;
    const safeHeadroomMinor = Math.max(0, cat.cap_minor - Math.max(cat.total_spend_minor, projectedSpendMinor));
    const maxTransferMinor = multiplyMinorByBp(
      safeHeadroomMinor,
      SENTINEL_PARAMS.donor_max_share_bp
    );

    if (maxTransferMinor >= SENTINEL_PARAMS.min_donor_transfer_minor) {
      eligibleDonors.push({
        category_id: cat.category_id,
        display_name: cat.display_name,
        current_cap_minor: cat.cap_minor,
        spend_to_date_minor: cat.total_spend_minor,
        max_transfer_minor: maxTransferMinor,
      });
    }
  }

  eligibleDonors.sort((a, b) => b.max_transfer_minor - a.max_transfer_minor);

  const constraints = [];
  if (eligibleDonors.length === 0) {
    constraints.push(makeConstraint('NO_ELIGIBLE_DONOR', { target_category_id: targetCategoryId }));
    return buildEnvelope(
      state,
      'sentinel_run_rebalance_simulation',
      {
        period,
        target_category_id: targetCategoryId,
        needed_minor: neededMinor,
        covered_minor: 0,
        unmet_minor: neededMinor,
        fully_covered: false,
        transfers: [],
      },
      'HIGH',
      constraints
    );
  }

  let remainingNeed = neededMinor;
  const transfers = [];
  for (const donor of eligibleDonors.slice(0, SENTINEL_PARAMS.max_donors)) {
    if (remainingNeed <= 0) break;
    const transferAmt = Math.min(remainingNeed, donor.max_transfer_minor);
    if (transferAmt < SENTINEL_PARAMS.min_donor_transfer_minor) continue;
    transfers.push({
      from_category_id: donor.category_id,
      from_display_name: donor.display_name,
      to_category_id: targetCategoryId,
      to_display_name: targetRow.display_name,
      amount_minor: transferAmt,
      donor_cap_before_minor: donor.current_cap_minor,
      donor_cap_after_minor: donor.current_cap_minor - transferAmt,
    });
    remainingNeed -= transferAmt;
  }

  const coveredMinor = neededMinor - remainingNeed;
  const fullyCovered = remainingNeed === 0;
  if (!fullyCovered) {
    constraints.push(
      makeConstraint(
        'REBALANCE_NOT_COVERED',
        { covered_minor: coveredMinor, unmet_minor: remainingNeed },
        'WARNING'
      )
    );
  }

  return buildEnvelope(
    state,
    'sentinel_run_rebalance_simulation',
    {
      period,
      target_category_id: targetCategoryId,
      target_cap_before_minor: targetRow.cap_minor,
      target_cap_after_minor: targetRow.cap_minor + coveredMinor,
      needed_minor: neededMinor,
      covered_minor: coveredMinor,
      unmet_minor: remainingNeed,
      fully_covered: fullyCovered,
      transfers,
    },
    'HIGH',
    constraints
  );
}

// ============================================================================
// 9. sentinel_validate_cap_change
// ============================================================================
function sentinel_validate_cap_change(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const res = validateCapChange(state, args);
  return buildEnvelope(
    state,
    'sentinel_validate_cap_change',
    {
      verdict: res.verdict,
      category_id: res.category_id,
      new_cap_minor: res.new_cap_minor,
      previous_cap_minor: res.previous_cap_minor,
      floor_minor: res.floor_minor,
      scope: res.scope,
      period: res.period,
    },
    'HIGH',
    res.constraints
  );
}

// ============================================================================
// 10. sentinel_run_goal_progress
// ============================================================================
function sentinel_run_goal_progress(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const goalId = args.goal_id;
  const goal = state.all_goals_including_archived.find((g) => g.goal_id === goalId);

  if (!goal) {
    return buildEnvelope(
      state,
      'sentinel_run_goal_progress',
      null,
      'LOW',
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Goal ${goalId} not found.` }
    );
  }

  const targetMinor = Number(goal.target_minor) || 0;
  const savedMinor = Number(goal.saved_minor) || 0;
  const remainingMinor = Math.max(0, targetMinor - savedMinor);
  const progressBp = targetMinor > 0 ? Math.min(10000, ratioToBp(savedMinor, targetMinor)) : 0;
  const monthlyAddMinor = Number(goal.effective_monthly_add_minor ?? goal.monthly_add_minor) || 0;

  let monthsToTarget = null;
  let projectedDate = null;
  let conservativeDate = null;

  if (remainingMinor === 0) {
    monthsToTarget = 0;
    projectedDate = `${state.current_month_ist}-01`;
    conservativeDate = `${state.current_month_ist}-01`;
  } else if (monthlyAddMinor > 0) {
    monthsToTarget = Math.ceil(remainingMinor / monthlyAddMinor);
    const projYm = addMonthsToYearMonth(state.current_month_ist, monthsToTarget);
    projectedDate = `${projYm}-01`;

    // Conservative rate assumes 80% effective realization when confidence != HIGH
    const conservativeAddMinor = Math.max(1, multiplyMinorByBp(monthlyAddMinor, 8000));
    const conservativeMonths = Math.ceil(remainingMinor / conservativeAddMinor);
    const consYm = addMonthsToYearMonth(state.current_month_ist, conservativeMonths);
    conservativeDate = `${consYm}-01`;
  }

  // Required monthly add if deadline is specified
  let requiredMonthlyAddForDeadlineMinor = monthlyAddMinor;
  let trajectory = goal.status === 'PAUSED' ? 'PAUSED' : 'ON_TRACK';
  if (goal.deadline && remainingMinor > 0) {
    const [dy, dm] = String(goal.deadline).slice(0, 7).split('-').map(Number);
    const [cy, cm] = state.current_month_ist.split('-').map(Number);
    const monthsUntilDeadline = Math.max(1, (dy - cy) * 12 + (dm - cm));
    requiredMonthlyAddForDeadlineMinor = Math.ceil(remainingMinor / monthsUntilDeadline);
    if (monthlyAddMinor < requiredMonthlyAddForDeadlineMinor) {
      trajectory = 'AT_RISK';
    }
  } else if (remainingMinor > 0 && monthlyAddMinor === 0 && goal.status === 'ACTIVE') {
    trajectory = 'AT_RISK';
  }

  return buildEnvelope(state, 'sentinel_run_goal_progress', {
    goal_id: goal.goal_id,
    name: goal.name,
    status: goal.status,
    priority_tier: goal.priority_tier,
    target_minor: targetMinor,
    saved_minor: savedMinor,
    remaining_minor: remainingMinor,
    progress_bp: progressBp,
    standing_monthly_add_minor: goal.standing_monthly_add_minor,
    monthly_add_minor: monthlyAddMinor,
    has_month_override: goal.has_month_override,
    deadline: goal.deadline,
    months_to_target: monthsToTarget,
    projected_date: projectedDate,
    conservative_date: conservativeDate,
    required_monthly_add_for_deadline_minor: requiredMonthlyAddForDeadlineMinor,
    trajectory,
  });
}

// ============================================================================
// 11. sentinel_run_goal_feasibility
// ============================================================================
function sentinel_run_goal_feasibility(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const { goal_id = null, proposed_monthly_add_minor = 0, target_minor = null, deadline = null } = args;

  const baselineRes = sentinel_get_surplus_baseline(state);
  const b = baselineRes.data;

  // Existing goal commitments excluding `goal_id` (if updating an existing goal)
  const otherGoalsMinor = state.goals
    .filter((g) => g.status === 'ACTIVE' && g.goal_id !== goal_id)
    .reduce((sum, g) => sum + (Number(g.effective_monthly_add_minor) || 0), 0);

  const proposedMinor = Number(proposed_monthly_add_minor) || 0;
  const availableSurplusBeforeGoalMinor =
    b.income_minor - b.fixed_commitments_minor - b.discretionary_baseline_minor - otherGoalsMinor;
  const remainingSurplusAfterGoalMinor = availableSurplusBeforeGoalMinor - proposedMinor;

  const constraints = [...baselineRes.constraints_triggered];
  let verdict = 'FEASIBLE';

  if (proposedMinor > 0 && remainingSurplusAfterGoalMinor < 0) {
    verdict = 'SHORTFALL';
    constraints.push(
      makeConstraint('SURPLUS_SHORTFALL', {
        available_surplus_minor: Math.max(0, availableSurplusBeforeGoalMinor),
        proposed_monthly_add_minor: proposedMinor,
      })
    );
  } else if (remainingSurplusAfterGoalMinor < b.buffer_floor_minor) {
    verdict = 'TIGHT';
    constraints.push(
      makeConstraint(
        'FEASIBILITY_TIGHT',
        { remaining_buffer_minor: Math.max(0, remainingSurplusAfterGoalMinor) },
        'WARNING'
      )
    );
  }

  let requiredMonthlyAddForDeadlineMinor = proposedMinor;
  if (target_minor != null && deadline) {
    const existingGoal = goal_id ? state.goals.find((g) => g.goal_id === goal_id) : null;
    const saved = existingGoal ? Number(existingGoal.saved_minor) || 0 : 0;
    const rem = Math.max(0, Number(target_minor) - saved);
    const [dy, dm] = String(deadline).slice(0, 7).split('-').map(Number);
    const [cy, cm] = state.current_month_ist.split('-').map(Number);
    const mLeft = Math.max(1, (dy - cy) * 12 + (dm - cm));
    requiredMonthlyAddForDeadlineMinor = Math.ceil(rem / mLeft);
  }

  return buildEnvelope(
    state,
    'sentinel_run_goal_feasibility',
    {
      goal_id,
      verdict,
      proposed_monthly_add_minor: proposedMinor,
      other_goals_commitments_minor: otherGoalsMinor,
      available_surplus_minor: Math.max(0, availableSurplusBeforeGoalMinor),
      headroom_vs_surplus_signed_minor: remainingSurplusAfterGoalMinor,
      buffer_floor_minor: b.buffer_floor_minor,
      required_monthly_add_for_deadline_minor: requiredMonthlyAddForDeadlineMinor,
    },
    baselineRes.confidence,
    constraints
  );
}

// ============================================================================
// 12. sentinel_validate_goal_change
// ============================================================================
function sentinel_validate_goal_change(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const res = validateGoalChange(state, args);
  if (res.error_code === 'UNKNOWN_ENTITY') {
    return buildEnvelope(
      state,
      'sentinel_validate_goal_change',
      null,
      'LOW',
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Goal ${args.goal_id} not found.` }
    );
  }
  return buildEnvelope(
    state,
    'sentinel_validate_goal_change',
    {
      verdict: res.verdict,
      operation: res.operation,
      goal_id: res.goal_id,
      period: res.period,
    },
    'HIGH',
    res.constraints
  );
}

// ============================================================================
// 13. sentinel_forecast_bill_outlays
// ============================================================================
function sentinel_forecast_bill_outlays(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const horizonDays = Math.min(60, Math.max(1, Number(args.horizon_days) || 30));
  const startDate = state.current_date_ist;
  const endDate = new Date(new Date(startDate).getTime() + horizonDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const outlays = [];

  // 1. User-declared bills (`declared_bills_v1`)
  for (const bill of state.declared_bills || []) {
    if (!bill.active) continue;
    let dueDate = bill.next_due_date;
    // If next_due_date is slightly in the past, project to current/next month
    if (dueDate < startDate && bill.cadence === 'MONTHLY') {
      const dayStr = String(Math.min(28, Math.max(1, bill.due_day || 1))).padStart(2, '0');
      const candidateThisMonth = `${state.current_month_ist}-${dayStr}`;
      dueDate =
        candidateThisMonth >= startDate
          ? candidateThisMonth
          : `${addMonthsToYearMonth(state.current_month_ist, 1)}-${dayStr}`;
    }
    if (dueDate >= startDate && dueDate <= endDate) {
      outlays.push({
        bill_id: bill.bill_id,
        label: bill.label,
        category_id: bill.category_id,
        display_name: getCategoryDisplayName(bill.category_id),
        amount_minor: Number(bill.amount_minor) || 0,
        due_date: dueDate,
        cadence: bill.cadence,
        source: 'DECLARED',
        confidence: 'HIGH',
      });
    }
  }

  // 2. Fixed expense lines not already represented in outlays
  for (const line of state.profile.fixed_expense_lines || []) {
    const alreadyCovered = outlays.some((o) => o.category_id === line.category_id);
    if (alreadyCovered) continue;
    const dueCandidate = `${addMonthsToYearMonth(state.current_month_ist, 1)}-05`;
    if (dueCandidate >= startDate && dueCandidate <= endDate) {
      outlays.push({
        bill_id: line.line_id,
        label: line.label,
        category_id: line.category_id,
        display_name: getCategoryDisplayName(line.category_id),
        amount_minor: Number(line.monthly_amount_minor) || 0,
        due_date: dueCandidate,
        cadence: 'MONTHLY',
        source: 'DECLARED_FIXED_LINE',
        confidence: 'HIGH',
      });
    }
  }

  outlays.sort((a, b) => a.due_date.localeCompare(b.due_date));
  const totalOutlaysMinor = outlays.reduce((sum, o) => sum + o.amount_minor, 0);

  return buildEnvelope(state, 'sentinel_forecast_bill_outlays', {
    horizon_days: horizonDays,
    start_date: startDate,
    end_date: endDate,
    total_outlays_minor: totalOutlaysMinor,
    outlay_count: outlays.length,
    outlays,
  });
}

// ============================================================================
// 14. sentinel_flag_cashflow_risk
// ============================================================================
function sentinel_flag_cashflow_risk(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const horizonDays = Math.min(60, Math.max(1, Number(args.horizon_days) || 30));

  const outlays = Array.isArray(args.outlays)
    ? args.outlays
    : sentinel_forecast_bill_outlays(state, { horizon_days: horizonDays }).data.outlays;

  const balRes = checkAvailableBalance(state, { amount_minor: 0 });
  const startingAvailableMinor =
    balRes.verdict === 'BALANCE_UNKNOWN'
      ? Math.max(0, state.income_minor - state.fixed_commitments_minor)
      : balRes.available_minor;

  const totalOutlaysMinor = outlays.reduce((sum, o) => sum + (Number(o.amount_minor) || 0), 0);
  const projectedLowestBalanceMinor = startingAvailableMinor - totalOutlaysMinor;

  const bufferFloorMinor = Math.max(
    multiplyMinorByBp(state.income_minor, SENTINEL_PARAMS.buffer_floor_income_bp),
    SENTINEL_PARAMS.buffer_floor_min_minor
  );

  let riskLevel = 'LOW';
  const constraints = [];
  if (projectedLowestBalanceMinor < 0) {
    riskLevel = 'HIGH';
    constraints.push(
      makeConstraint(
        'CASHFLOW_RISK_HIGH',
        { lowest_balance_minor: projectedLowestBalanceMinor },
        'WARNING'
      )
    );
  } else if (projectedLowestBalanceMinor < bufferFloorMinor) {
    riskLevel = 'MEDIUM';
    constraints.push(
      makeConstraint(
        'CASHFLOW_RISK_HIGH',
        { lowest_balance_minor: projectedLowestBalanceMinor },
        'WARNING'
      )
    );
  }

  return buildEnvelope(
    state,
    'sentinel_flag_cashflow_risk',
    {
      horizon_days: horizonDays,
      risk_level: riskLevel,
      starting_available_minor: startingAvailableMinor,
      total_upcoming_outlays_minor: totalOutlaysMinor,
      projected_lowest_balance_signed_minor: projectedLowestBalanceMinor,
      buffer_floor_minor: bufferFloorMinor,
      shortfall_minor: Math.max(0, -projectedLowestBalanceMinor),
    },
    'HIGH',
    constraints
  );
}

// ============================================================================
// 4. sentinel_run_spending_simulation
// ============================================================================
function sentinel_run_spending_simulation(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const targetMonth = args.target_month || state.current_month_ist;
  const capChanges = Array.isArray(args.cap_changes) ? args.cap_changes : [];
  const goalChanges = Array.isArray(args.goal_changes) ? args.goal_changes : [];
  const categoryAdjustments = Array.isArray(args.category_adjustments) ? args.category_adjustments : [];
  const oneOffOutlays = Array.isArray(args.one_off_outlays) ? args.one_off_outlays : [];

  const prev3 = getPreviousMonths(state.current_month_ist, 3);
  const caps = getCapsForUser(state.user_id, targetMonth);
  const capMap = Object.fromEntries(caps.map((c) => [c.category_id, c.effective_amount_minor]));
  for (const ch of capChanges) {
    if (ch.category_id && ch.new_cap_minor != null) {
      capMap[ch.category_id] = Number(ch.new_cap_minor);
    }
  }

  const adjMap = Object.fromEntries(
    categoryAdjustments.map((a) => [a.category_id, a])
  );

  // Build category_plan lines for all discretionary categories with caps or historical spend
  const relevantCatIds = new Set([
    ...Object.keys(capMap),
    ...Object.keys(state.spendByCategory || {}),
  ]);

  const categoryPlan = [];
  let totalPlannedDiscretionaryMinor = 0;
  let totalP80DiscretionaryMinor = 0;

  for (const cid of relevantCatIds) {
    if (isFixedCategory(cid)) continue;
    const histAmounts = prev3.map((pm) => {
      const mTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(pm));
      return computeCategorySpend(mTxns, cid).total_spend_minor;
    });
    const nonZero = histAmounts.filter((v) => v > 0);
    const curSpend = state.spendByCategory?.[cid]?.total_spend_minor || 0;
    const sample = nonZero.length > 0 ? nonZero : curSpend > 0 ? [curSpend] : [capMap[cid] || 0];

    const baselineOutflowMinor = halfEvenRoundBigInt(
      sample.reduce((s, v) => s + v, 0),
      Math.max(1, sample.length)
    );
    const p80OutflowMinor =
      sample.length >= 2
        ? Math.max(...sample)
        : multiplyMinorByBp(baselineOutflowMinor, 10000 + SENTINEL_PARAMS.default_band_factor_bp);

    let plannedOutflowMinor = capMap[cid] != null ? capMap[cid] : baselineOutflowMinor;
    const adj = adjMap[cid];
    if (adj) {
      if (adj.target_amount_minor != null) {
        plannedOutflowMinor = Number(adj.target_amount_minor);
      } else if (adj.delta_bp != null) {
        plannedOutflowMinor = Math.max(
          0,
          baselineOutflowMinor + multiplyMinorByBp(baselineOutflowMinor, Number(adj.delta_bp))
        );
      }
    }

    const lineP80 = Math.max(
      plannedOutflowMinor,
      adj ? multiplyMinorByBp(plannedOutflowMinor, 11500) : p80OutflowMinor
    );

    totalPlannedDiscretionaryMinor += plannedOutflowMinor;
    totalP80DiscretionaryMinor += lineP80;

    categoryPlan.push({
      category_id: cid,
      display_name: getCategoryDisplayName(cid),
      cap_minor: capMap[cid] ?? null,
      baseline_outflow_minor: baselineOutflowMinor,
      p80_outflow_minor: p80OutflowMinor,
      planned_outflow_minor: plannedOutflowMinor,
    });
  }

  // Goal commitments with any simulated goal_changes
  const goalMap = {};
  for (const g of state.goals.filter((x) => x.status === 'ACTIVE')) {
    goalMap[g.goal_id] = Number(g.effective_monthly_add_minor) || 0;
  }
  for (const gc of goalChanges) {
    if (gc.goal_id && gc.monthly_add_minor != null) {
      goalMap[gc.goal_id] = Number(gc.monthly_add_minor);
    }
  }
  const simulatedGoalCommitmentsMinor = Object.values(goalMap).reduce((s, v) => s + v, 0);

  const oneOffTotalMinor = oneOffOutlays.reduce(
    (s, o) => s + (Number(o.amount_minor) || 0),
    0
  );

  const expectedEndBalanceMinor =
    state.income_minor -
    state.fixed_commitments_minor -
    totalPlannedDiscretionaryMinor -
    simulatedGoalCommitmentsMinor -
    oneOffTotalMinor;

  const conservativeEndBalanceMinor =
    state.income_minor -
    state.fixed_commitments_minor -
    totalP80DiscretionaryMinor -
    simulatedGoalCommitmentsMinor -
    oneOffTotalMinor;

  const bufferFloorMinor = Math.max(
    multiplyMinorByBp(state.income_minor, SENTINEL_PARAMS.buffer_floor_income_bp),
    SENTINEL_PARAMS.buffer_floor_min_minor
  );

  let riskLevel = 'LOW';
  const constraints = [];
  if (conservativeEndBalanceMinor < 0) {
    riskLevel = 'HIGH';
    if (simulatedGoalCommitmentsMinor > 0 && expectedEndBalanceMinor < 0) {
      constraints.push(
        makeConstraint('GOAL_COMMITMENT_CONFLICT', {
          remaining_surplus_minor:
            state.income_minor - state.fixed_commitments_minor - totalPlannedDiscretionaryMinor,
          goal_commitments_minor: simulatedGoalCommitmentsMinor,
        })
      );
    }
  } else if (conservativeEndBalanceMinor < bufferFloorMinor) {
    riskLevel = 'MEDIUM';
  }

  return buildEnvelope(
    state,
    'sentinel_run_spending_simulation',
    {
      target_month: targetMonth,
      income_minor: state.income_minor,
      fixed_commitments_minor: state.fixed_commitments_minor,
      planned_discretionary_minor: totalPlannedDiscretionaryMinor,
      p80_discretionary_minor: totalP80DiscretionaryMinor,
      goal_commitments_minor: simulatedGoalCommitmentsMinor,
      one_off_outlays_minor: oneOffTotalMinor,
      expected_end_balance_signed_minor: expectedEndBalanceMinor,
      conservative_end_balance_signed_minor: conservativeEndBalanceMinor,
      buffer_floor_minor: bufferFloorMinor,
      risk_level: riskLevel,
      allocation_outcome: {
        unallocated_signed_minor: expectedEndBalanceMinor,
        conservative_available_signed_minor: conservativeEndBalanceMinor,
      },
      category_plan: categoryPlan,
    },
    'HIGH',
    constraints
  );
}

// ============================================================================
// 15. sentinel_check_available_balance
// ============================================================================
function sentinel_check_available_balance(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const res = checkAvailableBalance(state, args);
  return buildEnvelope(
    state,
    'sentinel_check_available_balance',
    {
      verdict: res.verdict,
      total_liquid_minor: res.total_liquid_minor,
      earmarked_minor: res.earmarked_minor,
      available_minor: res.available_minor,
      requested_minor: res.requested_minor,
    },
    'HIGH',
    res.constraints
  );
}

// ============================================================================
// 16. sentinel_compute_health_score
// ============================================================================
function sentinel_compute_health_score(stateInput, args = {}) {
  const state = stateInput.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const utilRes = sentinel_run_category_utilization(state);
  const spendTotalMinor = computeCategorySpend(state.current_month_txns, null).total_spend_minor;

  const incomeMinor = state.income_minor;
  const goalCommitmentsMinor = state.goal_commitments_minor;

  // 1. Saving behaviour (0-25): savings_rate_bp vs 2000 bp (20%) target
  const savingsRateBp = incomeMinor > 0 ? ratioToBp(goalCommitmentsMinor, incomeMinor) : 0;
  const savingScore = Math.min(
    25,
    Math.max(0, halfEvenRoundBigInt(savingsRateBp * 25, SENTINEL_PARAMS.savings_target_bp))
  );

  // 2. Budget discipline (0-25): share of capped categories within limit
  const cappedCats = utilRes.data.categories;
  const withinCapCount = cappedCats.filter((c) => c.utilization_bp <= 10000).length;
  const disciplineScore =
    cappedCats.length > 0
      ? halfEvenRoundBigInt(withinCapCount * 25, cappedCats.length)
      : 15;

  // 3. Spending control (0-25): total outflow vs income
  const totalOutflowMinor = spendTotalMinor + state.fixed_commitments_minor;
  const outflowRatioBp = incomeMinor > 0 ? ratioToBp(totalOutflowMinor, incomeMinor) : 10000;
  const controlScore =
    incomeMinor > 0
      ? Math.min(25, Math.max(0, halfEvenRoundBigInt((10000 - outflowRatioBp) * 25, 4000)))
      : 10;

  // 4. Future planning (0-25): funded active goals
  const fundedGoalsCount = state.goals.filter(
    (g) => g.status === 'ACTIVE' && (Number(g.effective_monthly_add_minor) || 0) > 0
  ).length;
  const planningScore = Math.min(25, fundedGoalsCount * 9 + (state.goals.length > 0 ? 7 : 0));

  const totalScore = savingScore + disciplineScore + controlScore + planningScore;
  const grade =
    totalScore >= 80
      ? 'EXCELLENT'
      : totalScore >= 60
      ? 'GOOD'
      : totalScore >= 40
      ? 'FAIR'
      : 'NEEDS_WORK';

  return buildEnvelope(state, 'sentinel_compute_health_score', {
    score: totalScore,
    max_score: 100,
    grade,
    sub_scores: {
      saving_behaviour: savingScore,
      budget_discipline: disciplineScore,
      spending_control: controlScore,
      future_planning: planningScore,
    },
    metrics: {
      savings_rate_bp: savingsRateBp,
      outflow_ratio_bp: outflowRatioBp,
      caps_within_limit_count: withinCapCount,
      caps_total_count: cappedCats.length,
      funded_goals_count: fundedGoalsCount,
    },
  });
}

// ============================================================================
// 17. sentinel_project_sip
// ============================================================================
function sentinel_project_sip(stateInput, args = {}) {
  const state = stateInput?.snapshot
    ? stateInput
    : loadSnapshotState(stateInput, args?.user_id);

  const monthlyAmountMinor = Math.max(0, Math.trunc(Number(args.monthly_amount_minor) || 0));
  const annualRateBp = Math.min(3000, Math.max(0, Math.trunc(Number(args.annual_rate_bp) || 0)));
  const months = Math.min(600, Math.max(1, Math.trunc(Number(args.months) || 12)));
  const annualStepUpBp = Math.min(5000, Math.max(0, Math.trunc(Number(args.annual_step_up_bp) || 0)));

  let totalContributedMinor = 0;
  let corpusMinor = 0;
  let currentMonthlyMinor = monthlyAmountMinor;
  const yearlySchedule = [];

  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0 && annualStepUpBp > 0) {
      currentMonthlyMinor += multiplyMinorByBp(currentMonthlyMinor, annualStepUpBp);
    }
    totalContributedMinor += currentMonthlyMinor;
    corpusMinor += currentMonthlyMinor;
    // Monthly compounding: corpus * (1 + annual_rate_bp / (12 * 10000))
    const monthlyInterestMinor = halfEvenRoundBigInt(
      BigInt(corpusMinor) * BigInt(annualRateBp),
      120000n
    );
    corpusMinor += monthlyInterestMinor;

    if (m % 12 === 0 || m === months) {
      yearlySchedule.push({
        month: m,
        year: Math.ceil(m / 12),
        monthly_installment_minor: currentMonthlyMinor,
        total_contributed_minor: totalContributedMinor,
        projected_corpus_minor: corpusMinor,
        projected_gain_minor: Math.max(0, corpusMinor - totalContributedMinor),
      });
    }
  }

  return buildEnvelope(state, 'sentinel_project_sip', {
    illustrative_only: true,
    monthly_amount_minor: monthlyAmountMinor,
    annual_rate_bp: annualRateBp,
    months,
    annual_step_up_bp: annualStepUpBp,
    total_contributed_minor: totalContributedMinor,
    projected_corpus_minor: corpusMinor,
    projected_gain_minor: Math.max(0, corpusMinor - totalContributedMinor),
    schedule: yearlySchedule,
  });
}

const SENTINEL_FUNCTIONS = Object.freeze({
  sentinel_get_surplus_baseline,
  sentinel_get_ledger_summary,
  sentinel_get_spending_timeseries,
  sentinel_run_spending_simulation,
  sentinel_run_category_utilization,
  sentinel_run_velocity_projection,
  sentinel_detect_anomalies,
  sentinel_run_rebalance_simulation,
  sentinel_validate_cap_change,
  sentinel_run_goal_progress,
  sentinel_run_goal_feasibility,
  sentinel_validate_goal_change,
  sentinel_forecast_bill_outlays,
  sentinel_flag_cashflow_risk,
  sentinel_check_available_balance,
  sentinel_compute_health_score,
  sentinel_project_sip,
});

function callSentinel(fnName, userId, snapshot, args = {}) {
  const fn = SENTINEL_FUNCTIONS[fnName];
  if (!fn) throw new Error(`Unknown Sentinel function: ${fnName}`);

  // SEN-AC-03: Reject identity parameters passed into tool args
  if (args && (args.user_id !== undefined || args.tenant_id !== undefined)) {
    throw new Error('Identity parameters (user_id, tenant_id) are prohibited in Sentinel tool arguments');
  }

  const snapId = typeof snapshot === 'object' ? snapshot.snapshot_id : snapshot;
  const state = loadSnapshotState(snapId, userId);
  return fn(state, args);
}

module.exports = {
  MODEL_VERSION,
  SENTINEL_PARAMS,
  loadSnapshotState,
  callSentinel,
  SENTINEL_FUNCTIONS,
  ...SENTINEL_FUNCTIONS,
  rules,
};
