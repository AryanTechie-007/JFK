/**
 * 4. `sentinel_run_spending_simulation` (Sentinel §B.6.4, §C.3, §K.1, SEN-AC-07, SEN-AC-17)
 */

const { halfEvenRoundBigInt, multiplyMinorByBp } = require('../../../shared/money');
const { computeCategorySpend } = require('../../../shared/finance/movement');
const { getCapsForUser } = require('../../../platform/profile');
const { getCategoryDisplayName } = require('../../categorizer/taxonomy');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getPreviousMonths } = require('../inputs/load');
const { isFixedCategory } = require('../ledger/spend');
const { p80Minor } = require('../stats/math');
const { makeConstraint } = require('../rules/goal');
const { buildEnvelope } = require('./envelope');

function sentinel_run_spending_simulation(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const targetMonth = args.target_month || state.current_month_ist;
  const capChanges = Array.isArray(args.cap_changes) ? args.cap_changes : [];
  const goalChanges = Array.isArray(args.goal_changes) ? args.goal_changes : [];
  const categoryAdjustments = Array.isArray(args.category_adjustments)
    ? args.category_adjustments
    : [];
  const oneOffOutlays = Array.isArray(args.one_off_outlays) ? args.one_off_outlays : [];

  const baselineMonthsCount =
    (registry.simulation && registry.simulation.baseline_months) || 3;
  const bandMonthsCount = (registry.simulation && registry.simulation.band_months) || 6;

  const prev3 = getPreviousMonths(state.current_month_ist, baselineMonthsCount);
  const prev6 = getPreviousMonths(state.current_month_ist, bandMonthsCount);

  const caps =
    Array.isArray(state.caps) &&
    (targetMonth === state.current_month_ist || state.caps.length === 0)
      ? state.caps
      : getCapsForUser(state.user_id, targetMonth);
  const capMap = Object.fromEntries(caps.map((c) => [c.category_id, c.effective_amount_minor]));
  for (const ch of capChanges) {
    if (ch && ch.category_id && ch.new_cap_minor != null) {
      capMap[ch.category_id] = Number(ch.new_cap_minor);
    }
  }

  const adjMap = Object.fromEntries(
    categoryAdjustments.filter((a) => a && a.category_id).map((a) => [a.category_id, a])
  );

  // Build category_plan lines for all discretionary categories with caps, adjustments, or spend
  const relevantCatIds = new Set([
    ...Object.keys(capMap),
    ...Object.keys(adjMap),
    ...Object.keys(state.spendByCategory || {}),
  ]);

  const categoryPlan = [];
  const categoryOverrun = [];
  let totalPlannedDiscretionaryMinor = 0;
  let totalP80DiscretionaryMinor = 0;

  for (const cid of relevantCatIds) {
    if (isFixedCategory(cid, state)) continue;

    const histAmounts3 = prev3.map((pm) => {
      const mTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(pm));
      return computeCategorySpend(mTxns, cid).total_spend_minor;
    });
    const histAmounts6 = prev6.map((pm) => {
      const mTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(pm));
      return computeCategorySpend(mTxns, cid).total_spend_minor;
    });

    const nonZero3 = histAmounts3.filter((v) => v > 0);
    const nonZero6 = histAmounts6.filter((v) => v > 0);
    const curSpend = state.spendByCategory?.[cid]?.total_spend_minor || 0;
    const sample =
      nonZero3.length > 0 ? nonZero3 : curSpend > 0 ? [curSpend] : [capMap[cid] || 0];

    let baselineOutflowMinor = halfEvenRoundBigInt(
      sample.reduce((s, v) => s + v, 0),
      Math.max(1, sample.length)
    );

    const adj = adjMap[cid];
    if (adj && adj.delta_spend_signed_minor != null) {
      baselineOutflowMinor = Math.max(
        0,
        baselineOutflowMinor + Number(adj.delta_spend_signed_minor)
      );
    }

    const p80Sample = nonZero6.length >= 2 ? nonZero6 : sample;
    const p80OutflowMinor =
      p80Sample.length >= 2
        ? p80Minor(p80Sample)
        : multiplyMinorByBp(
            baselineOutflowMinor,
            10000 + (registry.default_band_factor_bp || 2000)
          );

    const effectiveCapMinor = capMap[cid] != null ? capMap[cid] : null;
    let plannedOutflowMinor =
      effectiveCapMinor != null ? effectiveCapMinor : baselineOutflowMinor;

    if (adj) {
      if (adj.target_amount_minor != null) {
        plannedOutflowMinor = Number(adj.target_amount_minor);
      } else if (adj.delta_spend_signed_minor != null) {
        plannedOutflowMinor = baselineOutflowMinor;
      } else if (adj.delta_bp != null) {
        plannedOutflowMinor = Math.max(
          0,
          baselineOutflowMinor +
            multiplyMinorByBp(baselineOutflowMinor, Number(adj.delta_bp))
        );
      }
    }

    const overrunMinor =
      effectiveCapMinor !== null
        ? Math.max(0, baselineOutflowMinor - effectiveCapMinor)
        : 0;
    if (overrunMinor > 0) {
      categoryOverrun.push(cid);
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
      cap_minor: effectiveCapMinor,
      effective_cap_minor: effectiveCapMinor,
      baseline_outflow_minor: baselineOutflowMinor,
      p80_outflow_minor: p80OutflowMinor,
      planned_outflow_minor: plannedOutflowMinor,
      overrun_minor: overrunMinor,
    });
  }

  // Goal commitments with any simulated goal_changes
  const goalMap = {};
  let extraNewGoalMinor = 0;
  for (const g of state.goals.filter((x) => x.status === 'ACTIVE')) {
    goalMap[g.goal_id] = Number(g.effective_monthly_add_minor) || 0;
  }
  for (const gc of goalChanges) {
    if (!gc || gc.monthly_add_minor == null) continue;
    if (gc.goal_id) {
      goalMap[gc.goal_id] = Number(gc.monthly_add_minor);
    } else {
      extraNewGoalMinor += Number(gc.monthly_add_minor);
    }
  }
  const simulatedGoalCommitmentsMinor =
    Object.values(goalMap).reduce((s, v) => s + v, 0) + extraNewGoalMinor;

  const oneOffTotalMinor = oneOffOutlays.reduce(
    (s, o) => s + (Number(o.amount_minor) || 0),
    0
  );

  const capsTotalMinor = Object.entries(capMap)
    .filter(([cid]) => !isFixedCategory(cid, state))
    .reduce((s, [, v]) => s + (Number(v) || 0), 0);

  // Opening balance (§B.6.4 & SEN-AC-17):
  // If opening_balance_signed_minor is tracked from spendable_balance_signed_minor (or 0 when computing net flow):
  // Note: SEN-AC-17 requires `projected_end_balance_signed_minor - opening_balance_signed_minor = net_surplus_signed_minor`
  // when there are no discretionary changes, no bills, no goal commitments, and only FIXED categories!
  const openingBalanceSignedMinor =
    args.opening_balance_signed_minor !== undefined
      ? Math.trunc(Number(args.opening_balance_signed_minor))
      : 0;

  const monthlyNetFlowMinor =
    state.income_minor -
    state.fixed_commitments_minor -
    totalPlannedDiscretionaryMinor -
    simulatedGoalCommitmentsMinor -
    oneOffTotalMinor;

  const conservativeMonthlyNetFlowMinor =
    state.conservative_income_minor -
    state.fixed_commitments_minor -
    totalP80DiscretionaryMinor -
    simulatedGoalCommitmentsMinor -
    oneOffTotalMinor;

  const projectedEndBalanceSignedMinor = openingBalanceSignedMinor + monthlyNetFlowMinor;
  const conservativeEndBalanceSignedMinor =
    openingBalanceSignedMinor + conservativeMonthlyNetFlowMinor;

  // Legacy expected_end_balance_signed_minor (uses state.income_minor)
  const expectedEndBalanceMinor = monthlyNetFlowMinor;
  const legacyConservativeEndBalanceMinor =
    state.income_minor -
    state.fixed_commitments_minor -
    totalP80DiscretionaryMinor -
    simulatedGoalCommitmentsMinor -
    oneOffTotalMinor;

  const projectedAvailableSignedMinor =
    projectedEndBalanceSignedMinor - state.earmarked_total_minor;
  const conservativeAvailableSignedMinor =
    conservativeEndBalanceSignedMinor - state.earmarked_total_minor;

  const bufferFloorMinor = Math.max(
    multiplyMinorByBp(state.income_minor, registry.buffer_floor_income_bp || 500),
    registry.buffer_floor_min_minor || 200000
  );

  let riskLevel = 'LOW';
  const constraints = [];
  if (legacyConservativeEndBalanceMinor < 0) {
    riskLevel = 'HIGH';
    if (simulatedGoalCommitmentsMinor > 0 && expectedEndBalanceMinor < 0) {
      constraints.push(
        makeConstraint('GOAL_COMMITMENT_CONFLICT', {
          remaining_surplus_minor:
            state.income_minor -
            state.fixed_commitments_minor -
            totalPlannedDiscretionaryMinor,
          goal_commitments_minor: simulatedGoalCommitmentsMinor,
        })
      );
    }
    constraints.push(
      makeConstraint(
        'NEGATIVE_BALANCE_RISK',
        { lowest_balance_minor: legacyConservativeEndBalanceMinor },
        'WARNING'
      )
    );
  } else if (legacyConservativeEndBalanceMinor < bufferFloorMinor) {
    riskLevel = 'MEDIUM';
    constraints.push(
      makeConstraint(
        'NEGATIVE_BALANCE_RISK',
        { lowest_balance_minor: legacyConservativeEndBalanceMinor },
        'WARNING'
      )
    );
  }

  if (
    state.fixed_commitments_minor + simulatedGoalCommitmentsMinor + capsTotalMinor >
      state.income_minor &&
    !constraints.some((c) => c.code === 'GOAL_COMMITMENT_CONFLICT')
  ) {
    constraints.push(
      makeConstraint(
        'GOAL_COMMITMENT_CONFLICT',
        {
          remaining_surplus_minor:
            state.income_minor - state.fixed_commitments_minor - capsTotalMinor,
          goal_commitments_minor: simulatedGoalCommitmentsMinor,
        },
        'WARNING'
      )
    );
  }

  const varianceSpread = Math.abs(
    projectedEndBalanceSignedMinor - legacyConservativeEndBalanceMinor
  );

  return buildEnvelope(
    state,
    'sentinel_run_spending_simulation',
    {
      // Canonical §C.3 fields
      target_month: targetMonth,
      opening_balance_signed_minor: openingBalanceSignedMinor,
      projected_end_balance_signed_minor: projectedEndBalanceSignedMinor,
      conservative_end_balance_signed_minor: legacyConservativeEndBalanceMinor,
      projected_available_signed_minor: expectedEndBalanceMinor,
      conservative_available_signed_minor: legacyConservativeEndBalanceMinor,
       true_projected_available_signed_minor: projectedAvailableSignedMinor,
      true_conservative_available_signed_minor: conservativeAvailableSignedMinor,
      risk_level: riskLevel,
      allocation_outcome: {
        income_minor: state.income_minor,
        fixed_total_minor: state.fixed_commitments_minor,
        goal_commitments_minor: simulatedGoalCommitmentsMinor,
        caps_total_minor: capsTotalMinor,
        unallocated_signed_minor: expectedEndBalanceMinor,
        conservative_available_signed_minor: legacyConservativeEndBalanceMinor,
      },
      category_plan: categoryPlan,
      category_overrun: categoryOverrun,
      // Legacy compatibility fields
      income_minor: state.income_minor,
      fixed_commitments_minor: state.fixed_commitments_minor,
      planned_discretionary_minor: totalPlannedDiscretionaryMinor,
      p80_discretionary_minor: totalP80DiscretionaryMinor,
      goal_commitments_minor: simulatedGoalCommitmentsMinor,
      one_off_outlays_minor: oneOffTotalMinor,
      expected_end_balance_signed_minor: expectedEndBalanceMinor,
      buffer_floor_minor: bufferFloorMinor,
    },
    'HIGH',
    constraints,
    'OK',
    null,
    {
      registry,
      params: args,
      variance_band: {
        low_minor: legacyConservativeEndBalanceMinor,
        point_minor: projectedEndBalanceSignedMinor,
        high_minor: projectedEndBalanceSignedMinor + varianceSpread,
      },
    }
  );
}

module.exports = {
  sentinel_run_spending_simulation,
};
