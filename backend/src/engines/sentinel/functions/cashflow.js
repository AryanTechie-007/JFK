/**
 * 14 & 15. `sentinel_flag_cashflow_risk` & `sentinel_check_available_balance` (Sentinel §B.6.14, §B.6.15, §C.3, §K.1, SEN-AC-07)
 */

const { multiplyMinorByBp, ratioToBp } = require('../../../shared/money');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, addMonthsToYearMonth } = require('../inputs/load');
const { makeConstraint } = require('../rules/goal');
const { checkAvailableBalance } = require('../rules/balance');
const { diffDaysStr } = require('../stats/cadence');
const { sentinel_forecast_bill_outlays } = require('./bills');
const { buildEnvelope } = require('./envelope');

function sentinel_flag_cashflow_risk(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const horizonDays = Math.min(60, Math.max(1, Number(args.horizon_days) || 30));

  let outlays = [];
  if (Array.isArray(args.outlays)) {
    outlays = args.outlays;
  } else if (args.outlays && Array.isArray(args.outlays.items)) {
    outlays = args.outlays.items;
  } else {
    outlays = sentinel_forecast_bill_outlays(state, { horizon_days: horizonDays }, registry).data
      .outlays;
  }

  const balRes = checkAvailableBalance(state, { amount_minor: 0 }, registry);
  const startingAvailableMinor =
    balRes.legacy_verdict === 'BALANCE_UNKNOWN'
      ? Math.max(0, state.income_minor - state.fixed_commitments_minor)
      : balRes.available_minor;
  const spendableBalanceSignedMinor =
    balRes.spendable_balance_signed_minor !== null
      ? balRes.spendable_balance_signed_minor
      : startingAvailableMinor;

  const totalOutlaysMinor = outlays.reduce((sum, o) => sum + (Number(o.amount_minor) || 0), 0);
  const projectedLowestBalanceMinor = startingAvailableMinor - totalOutlaysMinor;

  const bufferFloorMinor = Math.max(
    multiplyMinorByBp(state.income_minor, registry.buffer_floor_income_bp || 500),
    registry.buffer_floor_min_minor || 200000
  );

  // Estimate next income date (1st of next month or horizon end)
  const nextMonthFirst = `${addMonthsToYearMonth(state.current_month_ist, 1)}-01`;
  const nextIncomeDate = nextMonthFirst;

  // Walk scheduled outlays to find first shortfall date
  let runningOutflow = 0;
  let firstShortfallDate = null;
  const sortedOutlays = [...outlays].sort((a, b) =>
    String(a.due_date || '').localeCompare(String(b.due_date || ''))
  );
  for (const o of sortedOutlays) {
    runningOutflow += Number(o.amount_minor) || 0;
    if (firstShortfallDate === null && startingAvailableMinor - runningOutflow < bufferFloorMinor) {
      firstShortfallDate = o.due_date || state.current_date_ist;
    }
  }

  let riskLevel = 'LOW';
  const constraints = [];
  const flags = [];

  if (projectedLowestBalanceMinor < 0) {
    riskLevel = 'HIGH';
    const gapMinor = Math.abs(projectedLowestBalanceMinor);
    const highBp = (registry.cashflow && registry.cashflow.high_bp) || 2500;
    const medBp = (registry.cashflow && registry.cashflow.medium_bp) || 1000;
    const gapBp =
      state.income_minor > 0 ? ratioToBp(gapMinor, state.income_minor) : highBp;
    const flagSeverity = gapBp >= highBp ? 'HIGH' : gapBp >= medBp ? 'MEDIUM' : 'HIGH';
    const sfDate = firstShortfallDate || nextIncomeDate;
    flags.push({
      severity: flagSeverity,
      gap_minor: gapMinor,
      first_shortfall_date: sfDate,
      lead_time_days: Math.max(0, diffDaysStr(state.current_date_ist, sfDate)),
    });
    constraints.push(
      makeConstraint(
        'CASHFLOW_RISK_HIGH',
        { lowest_balance_minor: projectedLowestBalanceMinor },
        'WARNING'
      )
    );
    constraints.push(
      makeConstraint(
        'NEGATIVE_BALANCE_RISK',
        { lowest_balance_minor: projectedLowestBalanceMinor },
        'WARNING'
      )
    );
  } else if (projectedLowestBalanceMinor < bufferFloorMinor) {
    riskLevel = 'MEDIUM';
    const gapMinor = bufferFloorMinor - projectedLowestBalanceMinor;
    const sfDate = firstShortfallDate || nextIncomeDate;
    flags.push({
      severity: 'MEDIUM',
      gap_minor: gapMinor,
      first_shortfall_date: sfDate,
      lead_time_days: Math.max(0, diffDaysStr(state.current_date_ist, sfDate)),
    });
    constraints.push(
      makeConstraint(
        'CASHFLOW_RISK_HIGH',
        { lowest_balance_minor: projectedLowestBalanceMinor },
        'WARNING'
      )
    );
    constraints.push(
      makeConstraint(
        'NEGATIVE_BALANCE_RISK',
        { lowest_balance_minor: projectedLowestBalanceMinor },
        'WARNING'
      )
    );
  }

  return buildEnvelope(
    state,
    'sentinel_flag_cashflow_risk',
    {
      // Canonical §C.3 fields
      next_income_date: nextIncomeDate,
      spendable_balance_signed_minor: spendableBalanceSignedMinor,
      flags,
      // Legacy compatibility fields
      horizon_days: horizonDays,
      risk_level: riskLevel,
      starting_available_minor: startingAvailableMinor,
      total_upcoming_outlays_minor: totalOutlaysMinor,
      projected_lowest_balance_signed_minor: projectedLowestBalanceMinor,
      buffer_floor_minor: bufferFloorMinor,
      shortfall_minor: Math.max(0, -projectedLowestBalanceMinor),
    },
    'HIGH',
    constraints,
    'OK',
    null,
    {
      registry,
      params: args,
      dependsOnBalance: true,
      variance_band: {
        low_minor: projectedLowestBalanceMinor - multiplyMinorByBp(totalOutlaysMinor, 1000),
        point_minor: projectedLowestBalanceMinor,
        high_minor: projectedLowestBalanceMinor + multiplyMinorByBp(totalOutlaysMinor, 1000),
      },
    }
  );
}

function sentinel_check_available_balance(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const res = checkAvailableBalance(state, args, registry);
  return buildEnvelope(
    state,
    'sentinel_check_available_balance',
    {
      // Return legacy_verdict ('OK' | 'INSUFFICIENT_BALANCE' | 'BALANCE_UNKNOWN') in verdict for backward compatibility,
      // and canonical_verdict ('OK' | 'INSUFFICIENT') alongside all §C.3 fields
      verdict: res.legacy_verdict,
      canonical_verdict: res.verdict,
      spendable_balance_signed_minor: res.spendable_balance_signed_minor,
      earmarked_total_minor: res.earmarked_total_minor,
      available_signed_minor: res.available_signed_minor,
      balance_as_of: res.balance_as_of,
      stale: res.stale,
      // Legacy compatibility fields
      total_liquid_minor: res.total_liquid_minor,
      earmarked_minor: res.earmarked_minor,
      available_minor: res.available_minor,
      requested_minor: res.requested_minor,
    },
    'HIGH',
    res.constraints,
    'OK',
    null,
    { registry, params: args, dependsOnBalance: true }
  );
}

module.exports = {
  sentinel_flag_cashflow_risk,
  sentinel_check_available_balance,
};
