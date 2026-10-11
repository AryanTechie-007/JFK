/**
 * 6. `sentinel_run_velocity_projection` (Sentinel §B.6.6, §C.3, §K.1)
 */

const { halfEvenRoundBigInt, multiplyMinorByBp, ratioToBp } = require('../../../shared/money');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getMonthDays } = require('../inputs/load');
const { computeSpendForCategories } = require('../ledger/spend');
const { sentinel_run_category_utilization } = require('./utilization');
const { buildEnvelope } = require('./envelope');

function sentinel_run_velocity_projection(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const period = args.period || state.current_month_ist;
  const targetCategory = args.category_id || null;
  const categoryScope =
    Array.isArray(args.category_scope) && args.category_scope.length > 0
      ? new Set(args.category_scope)
      : null;

  const daysInMonth = getMonthDays(period);
  const dayOfMonth =
    period === state.current_month_ist
      ? Math.max(1, parseInt(state.current_date_ist.slice(8, 10), 10) || 1)
      : daysInMonth;

  // §B.4 & §B.6.6: days_elapsed = dayOfMonth - 1; days_remaining = daysInMonth - dayOfMonth + 1
  const specDaysElapsed = dayOfMonth - 1;
  const specDaysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);

  if (args.strict_first_day && specDaysElapsed < 1) {
    return buildEnvelope(
      state,
      'sentinel_run_velocity_projection',
      null,
      'LOW',
      [],
      'INSUFFICIENT_HISTORY',
      { code: 'INSUFFICIENT_HISTORY', message: 'Velocity projection requires days_elapsed >= 1.' },
      { registry, params: args }
    );
  }

  const effectiveDaysElapsed = Math.max(1, dayOfMonth);
  const utilRes = sentinel_run_category_utilization(
    state,
    { period, category_id: targetCategory },
    registry
  );

  const hasProvisional = utilRes.data.categories.some((c) => c.provisional_spend_minor > 0);
  const intrinsicConf =
    effectiveDaysElapsed >= 10 && !hasProvisional
      ? 'HIGH'
      : effectiveDaysElapsed >= 3
      ? 'MEDIUM'
      : 'LOW';

  const bufferBpMap = (registry.velocity && registry.velocity.buffer_bp) || {
    HIGH: 0,
    MEDIUM: 1000,
    LOW: 2000,
  };
  const underBp = (registry.velocity && registry.velocity.under_bp) || 9000;
  const bufferBp = bufferBpMap[intrinsicConf] ?? 1000;

  // Yesterday date for §B.6.6 burn rate
  const [y, m, d] = state.current_date_ist.split('-').map(Number);
  const yesterdayStr =
    d > 1
      ? new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
      : state.current_date_ist;
  const periodTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(period));

  const sourceRows = utilRes.data.categories.filter(
    (c) => !categoryScope || categoryScope.has(c.category_id)
  );

  const projections = sourceRows.map((cat) => {
    const dailyVelocityMinor = halfEvenRoundBigInt(cat.total_spend_minor, effectiveDaysElapsed);
    const projectedMonthEndMinor = dailyVelocityMinor * daysInMonth;
    const projectedConservativeMinor = multiplyMinorByBp(
      projectedMonthEndMinor,
      10000 + (registry.default_band_factor_bp || 2000)
    );
    const projectedUtilizationBp =
      cat.cap_minor > 0 ? ratioToBp(projectedMonthEndMinor, cat.cap_minor) : 0;

    // §B.6.6 pacing & safe/conservative daily envelope
    let pacing = null;
    let safeDailyEnvelopeMinor = null;
    let conservativeDailyEnvelopeMinor = null;
    if (cat.cap_minor !== null && cat.cap_minor !== undefined) {
      if (projectedUtilizationBp <= underBp) pacing = 'UNDER';
      else if (projectedUtilizationBp <= 10000) pacing = 'ON_TRACK';
      else pacing = 'OVER';

      safeDailyEnvelopeMinor = halfEvenRoundBigInt(
        Math.max(0, cat.cap_minor - cat.total_spend_minor),
        specDaysRemaining
      );
      conservativeDailyEnvelopeMinor = multiplyMinorByBp(
        safeDailyEnvelopeMinor,
        10000 - bufferBp
      );
    }

    // Also compute §B.6.6 through-yesterday burn when d > 1
    const throughYesterdaySpend =
      specDaysElapsed >= 1
        ? computeSpendForCategories(
            periodTxns,
            cat.covered_category_ids,
            period,
            yesterdayStr,
            cat.category_id
          ).spent_total_minor
        : cat.total_spend_minor;
    const dailyBurnThroughYesterdayMinor =
      specDaysElapsed >= 1
        ? halfEvenRoundBigInt(throughYesterdaySpend, specDaysElapsed)
        : dailyVelocityMinor;

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
      // Canonical §C.3 fields
      daily_burn_minor: dailyVelocityMinor,
      daily_burn_through_yesterday_minor: dailyBurnThroughYesterdayMinor,
      projected_month_end_minor: projectedMonthEndMinor,
      pacing,
      safe_daily_envelope_minor: safeDailyEnvelopeMinor,
      conservative_daily_envelope_minor: conservativeDailyEnvelopeMinor,
      // Legacy compatibility fields
      daily_velocity_minor: dailyVelocityMinor,
      projected_conservative_minor: projectedConservativeMinor,
      projected_utilization_bp: projectedUtilizationBp,
      projected_breach: cat.cap_minor > 0 && projectedMonthEndMinor > cat.cap_minor,
      days_to_exhaustion: exhaustionDays,
    };
  });

  // Overall variance band for velocity forecast (SEN-AC-07)
  const totalProj = projections.reduce((s, p) => s + p.projected_month_end_minor, 0);
  const totalCons = projections.reduce((s, p) => s + p.projected_conservative_minor, 0);
  const totalSpendSoFar = projections.reduce((s, p) => s + p.spend_to_date_minor, 0);

  return buildEnvelope(
    state,
    'sentinel_run_velocity_projection',
    {
      period,
      days_elapsed: effectiveDaysElapsed,
      spec_days_elapsed: specDaysElapsed,
      days_remaining: specDaysRemaining,
      days_in_month: daysInMonth,
      // Canonical §C.3 array name + legacy `projections` alias
      categories: projections,
      projections,
    },
    intrinsicConf,
    [],
    'OK',
    null,
    {
      registry,
      params: args,
      variance_band: {
        low_minor: totalSpendSoFar,
        point_minor: totalProj,
        high_minor: totalCons,
      },
    }
  );
}

module.exports = {
  sentinel_run_velocity_projection,
};
