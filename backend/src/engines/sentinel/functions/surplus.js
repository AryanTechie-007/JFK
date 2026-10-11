/**
 * 1. `sentinel_get_surplus_baseline` (Sentinel §B.6.1, §C.3, §K.1)
 */

const { halfEvenRoundBigInt, multiplyMinorByBp } = require('../../../shared/money');
const { computeCategorySpend, isActiveRow, isSettledStatus } = require('../../../shared/finance/movement');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getPreviousMonths } = require('../inputs/load');
const { isFixedCategory, getEffectiveCapMap, getTxClassificationStatus } = require('../ledger/spend');
const { medianMinor, percentileMinor, coefficientOfVariationBp, p80Minor } = require('../stats/math');
const { makeConstraint } = require('../rules/goal');
const { buildEnvelope } = require('./envelope');

function sentinel_get_surplus_baseline(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const timeframeMonths = Math.min(
    12,
    Math.max(1, Number(args.timeframe_months ?? args.lookback_months) || 3)
  );
  const prevMonths = getPreviousMonths(state.current_month_ist, timeframeMonths);

  const fixedCategoryIds = new Set(
    (state.profile.fixed_expense_lines || []).map((l) => l.category_id)
  );

  // Observed monthly income series over prevMonths
  const incomeMonthlySeries = prevMonths.map((pm) => {
    const inc = state.all_txns
      .filter(
        (t) =>
          isActiveRow(t) &&
          t.status !== 'PENDING' &&
          String(t.txn_date).startsWith(pm) &&
          t.direction === 'CREDIT' &&
          t.movement_type === 'INCOME' &&
          isSettledStatus(getTxClassificationStatus(t))
      )
      .reduce((sum, t) => sum + (Number(t.amount_minor) || 0), 0);
    return { period: pm, income_minor: inc };
  });

  const nonZeroIncomes = incomeMonthlySeries.map((x) => x.income_minor).filter((v) => v > 0);
  const incomeBasis = state.income_basis; // 'DECLARED' | 'OBSERVED'
  const incomeMinor = state.income_minor;
  const conservativeIncomeMinor =
    incomeBasis === 'DECLARED'
      ? incomeMinor
      : nonZeroIncomes.length >= 2
      ? percentileMinor(nonZeroIncomes, 25)
      : multiplyMinorByBp(incomeMinor, 9000);

  // Discretionary spend in each lookback month (excluding fixed expense line categories)
  const monthlyDiscretionaryTotals = prevMonths.map((pm) => {
    const mTxns = state.all_txns.filter(
      (t) =>
        String(t.txn_date).startsWith(pm) &&
        (!t.category_id || (!fixedCategoryIds.has(t.category_id) && !isFixedCategory(t.category_id, state)))
    );
    return computeCategorySpend(mTxns, null).total_spend_minor;
  });

  const nonZeroMonths = monthlyDiscretionaryTotals.filter((v) => v > 0);
  const currentMonthDiscTxns = state.current_month_txns.filter(
    (t) =>
      !t.category_id ||
      (!fixedCategoryIds.has(t.category_id) && !isFixedCategory(t.category_id, state))
  );
  const currentMonthDiscSpend = computeCategorySpend(currentMonthDiscTxns, null).total_spend_minor;

  const sample = nonZeroMonths.length > 0 ? nonZeroMonths : [currentMonthDiscSpend];
  const avgDiscretionaryMinor = halfEvenRoundBigInt(
    sample.reduce((s, v) => s + v, 0),
    sample.length
  );
  const p80DiscretionaryMinor =
    sample.length >= 2
      ? p80Minor(sample)
      : multiplyMinorByBp(avgDiscretionaryMinor, 10000 + (registry.default_band_factor_bp || 2000));

  // Base confidence (§B.6.1)
  const constraints = [];
  let intrinsicConf = 'HIGH';
  if (incomeBasis === 'OBSERVED') {
    const cvBp = coefficientOfVariationBp(nonZeroIncomes);
    const cvHighBp = (registry.income && registry.income.cv_high_bp) || 1500;
    const cvMedBp = (registry.income && registry.income.cv_medium_bp) || 3500;
    if (nonZeroIncomes.length >= 3 && cvBp <= cvHighBp) {
      intrinsicConf = 'HIGH';
    } else if (nonZeroIncomes.length >= 2 || (nonZeroIncomes.length >= 1 && cvBp <= cvMedBp)) {
      intrinsicConf = 'MEDIUM';
    } else {
      intrinsicConf = 'LOW';
    }
    if (intrinsicConf !== 'HIGH' || state.observed_income_months_count < 2) {
      constraints.push(makeConstraint('INCOME_BASIS_UNCERTAIN', {}, 'WARNING'));
      if (state.observed_income_months_count < 2) intrinsicConf = 'LOW';
    }
  } else {
    intrinsicConf = sample.length >= 3 ? 'HIGH' : sample.length >= 1 ? 'MEDIUM' : 'LOW';
  }

  // Check for uncertain/ambiguous large credit in window (§B.6.1)
  const uncertainThresholdMinor = multiplyMinorByBp(
    Math.max(1, incomeMinor),
    (registry.income && registry.income.uncertain_credit_bp) || 2000
  );
  const hasAmbiguousCredit = state.all_txns.some(
    (t) =>
      isActiveRow(t) &&
      t.direction === 'CREDIT' &&
      (t.movement_type === 'UNKNOWN' || getTxClassificationStatus(t) === 'NEEDS_REVIEW') &&
      Number(t.amount_minor) >= uncertainThresholdMinor
  );
  if (hasAmbiguousCredit && !constraints.some((c) => c.code === 'INCOME_BASIS_UNCERTAIN')) {
    constraints.push(makeConstraint('INCOME_BASIS_UNCERTAIN', {}, 'WARNING'));
  }

  const fixedTotalMinor = state.fixed_commitments_minor;
  const fixedLines = state.fixed_lines || [];
  const netSurplusSignedMinor = incomeMinor - fixedTotalMinor;
  const conservativeNetSurplusSignedMinor = conservativeIncomeMinor - fixedTotalMinor;
  const goalCommitmentsMinor = state.goal_commitments_minor;

  const capMap = getEffectiveCapMap(state, state.current_month_ist);
  let capsTotalMinor = 0;
  for (const [catId, amt] of capMap.entries()) {
    if (!isFixedCategory(catId, state)) {
      capsTotalMinor += amt;
    }
  }

  const unallocatedSurplusSignedMinor =
    netSurplusSignedMinor - goalCommitmentsMinor - capsTotalMinor;

  const expectedSurplusMinor =
    incomeMinor - fixedTotalMinor - avgDiscretionaryMinor - goalCommitmentsMinor;
  const conservativeSurplusMinor =
    conservativeIncomeMinor - fixedTotalMinor - p80DiscretionaryMinor - goalCommitmentsMinor;

  const bufferFloorMinor = Math.max(
    multiplyMinorByBp(incomeMinor, registry.buffer_floor_income_bp || 500),
    registry.buffer_floor_min_minor || 200000
  );

  return buildEnvelope(
    state,
    'sentinel_get_surplus_baseline',
    {
      // Canonical §C.3 fields
      period: state.current_month_ist,
      income_minor: incomeMinor,
      conservative_income_minor: conservativeIncomeMinor,
      income_basis: incomeBasis,
      income_monthly_series: incomeMonthlySeries,
      fixed_total_minor: fixedTotalMinor,
      fixed_lines: fixedLines,
      net_surplus_signed_minor: netSurplusSignedMinor,
      conservative_net_surplus_signed_minor: conservativeNetSurplusSignedMinor,
      goal_commitments_minor: goalCommitmentsMinor,
      caps_total_minor: capsTotalMinor,
      unallocated_surplus_signed_minor: unallocatedSurplusSignedMinor,
      // Backward-compatible legacy aliases
      declared_income_minor: incomeMinor,
      income_source: state.income_source,
      fixed_commitments_minor: fixedTotalMinor,
      fixed_outflows_minor: fixedTotalMinor,
      discretionary_baseline_minor: avgDiscretionaryMinor,
      discretionary_p80_minor: p80DiscretionaryMinor,
      expected_surplus_signed_minor: expectedSurplusMinor,
      conservative_surplus_signed_minor: conservativeSurplusMinor,
      feasible_surplus_minor: Math.max(0, expectedSurplusMinor),
      conservative_surplus_minor: Math.max(0, conservativeSurplusMinor),
      buffer_floor_minor: bufferFloorMinor,
      sample_months: nonZeroMonths.length,
    },
    intrinsicConf,
    constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_get_surplus_baseline,
};
