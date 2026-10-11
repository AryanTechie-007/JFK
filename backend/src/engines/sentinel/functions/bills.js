/**
 * 13. `sentinel_forecast_bill_outlays` (Sentinel §B.6.13, §C.3, §K.1, SEN-AC-07)
 */

const { getCategoryDisplayName } = require('../../categorizer/taxonomy');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, addMonthsToYearMonth } = require('../inputs/load');
const { ratioBpHalfEven } = require('../stats/math');
const { detectRecurringSchedule, diffDaysStr } = require('../stats/cadence');
const { buildEnvelope } = require('./envelope');

function sentinel_forecast_bill_outlays(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const lookbackMonths = Math.min(12, Math.max(3, Number(args.lookback_months) || 6));
  const horizonDays = Math.min(90, Math.max(1, Number(args.horizon_days) || 30));
  const startDate = state.current_date_ist;
  const endDate = new Date(new Date(startDate).getTime() + horizonDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const outlays = [];

  // 1. User-declared bills (`declared_bills_v1`)
  for (const bill of state.declared_bills || []) {
    if (!bill.active) continue;
    let dueDate = bill.next_due_date;
    if (dueDate < startDate && bill.cadence === 'MONTHLY') {
      const dayStr = String(Math.min(28, Math.max(1, bill.due_day || 1))).padStart(2, '0');
      const candidateThisMonth = `${state.current_month_ist}-${dayStr}`;
      dueDate =
        candidateThisMonth >= startDate
          ? candidateThisMonth
          : `${addMonthsToYearMonth(state.current_month_ist, 1)}-${dayStr}`;
    }
    if (dueDate >= startDate && dueDate <= endDate) {
      const amt = Math.trunc(Number(bill.amount_minor) || 0);
      outlays.push({
        source: 'DECLARED',
        bill_id: bill.bill_id,
        merchant_id: null,
        merchant_name: bill.label,
        label: bill.label,
        category_id: bill.category_id,
        display_name: getCategoryDisplayName(bill.category_id),
        amount_minor: amt,
        due_date: dueDate,
        cadence: bill.cadence,
        confidence: 'HIGH',
        variance_band: { low_minor: amt, high_minor: amt },
      });
    }
  }

  // 2. Fixed expense lines not already represented in outlays
  for (const line of state.profile.fixed_expense_lines || []) {
    const alreadyCovered = outlays.some((o) => o.category_id === line.category_id);
    if (alreadyCovered) continue;
    const dueCandidate = `${addMonthsToYearMonth(state.current_month_ist, 1)}-05`;
    if (dueCandidate >= startDate && dueCandidate <= endDate) {
      const amt = Math.trunc(Number(line.monthly_amount_minor) || 0);
      outlays.push({
        source: 'DECLARED',
        legacy_source: 'DECLARED_FIXED_LINE',
        bill_id: line.line_id,
        merchant_id: null,
        merchant_name: line.label,
        label: line.label,
        category_id: line.category_id,
        display_name: getCategoryDisplayName(line.category_id),
        amount_minor: amt,
        due_date: dueCandidate,
        cadence: 'MONTHLY',
        confidence: 'HIGH',
        variance_band: { low_minor: amt, high_minor: amt },
      });
    }
  }

  // 3. Detected recurring bills (§B.6.13) merged against declared bills within ±5 days and ±10%
  const mergeWindowDays = (registry.bills && registry.bills.merge_window_days) || 5;
  const mergeAmountBp = (registry.bills && registry.bills.merge_amount_bp) || 1000;
  const recurringTxns = state.all_txns.map((t) => ({
    ...t,
    merchant_name: t.merchant_display_name || t.merchant_name || t.normalized_description,
    is_duplicate: Boolean(t.is_duplicate_of || t.is_duplicate),
  }));
  const detectedSchedule = detectRecurringSchedule(
    recurringTxns,
    state.current_date_ist,
    registry
  );

  for (const det of detectedSchedule) {
    if (det.occurrences < 3) continue;
    if (det.next_expected_date < startDate || det.next_expected_date > endDate) continue;

    // Check if merged with a declared bill
    const isMerged = outlays.some((decl) => {
      const dayDiff = Math.abs(diffDaysStr(decl.due_date, det.next_expected_date));
      if (dayDiff > mergeWindowDays) return false;
      const amtDiffBp = ratioBpHalfEven(
        Math.abs(decl.amount_minor - det.typical_amount_minor),
        Math.max(1, decl.amount_minor)
      );
      if (amtDiffBp > mergeAmountBp) return false;
      return (
        decl.category_id === det.category_id ||
        String(decl.label).toLowerCase().includes(String(det.merchant_name).toLowerCase())
      );
    });
    if (isMerged) continue;

    outlays.push({
      source: 'DETECTED',
      bill_id: `det_${det.merchant_id}`,
      merchant_id: det.merchant_id,
      merchant_name: det.merchant_name,
      label: det.merchant_name,
      category_id: det.category_id,
      display_name: getCategoryDisplayName(det.category_id),
      amount_minor: det.typical_amount_minor,
      due_date: det.next_expected_date,
      cadence: det.cadence,
      confidence: det.confidence,
      variance_band: det.variance_band,
    });
  }

  outlays.sort((a, b) => a.due_date.localeCompare(b.due_date));
  const totalOutlaysMinor = outlays.reduce((sum, o) => sum + o.amount_minor, 0);
  const lowMinor = outlays.reduce(
    (sum, o) => sum + (o.variance_band ? o.variance_band.low_minor : o.amount_minor),
    0
  );
  const highMinor = outlays.reduce(
    (sum, o) => sum + (o.variance_band ? o.variance_band.high_minor : o.amount_minor),
    0
  );

  return buildEnvelope(
    state,
    'sentinel_forecast_bill_outlays',
    {
      // Canonical §C.3 fields
      outlays,
      total_minor: totalOutlaysMinor,
      // Legacy compatibility fields
      lookback_months: lookbackMonths,
      horizon_days: horizonDays,
      start_date: startDate,
      end_date: endDate,
      total_outlays_minor: totalOutlaysMinor,
      outlay_count: outlays.length,
    },
    'HIGH',
    [],
    'OK',
    null,
    {
      registry,
      params: args,
      variance_band: {
        low_minor: lowMinor,
        point_minor: totalOutlaysMinor,
        high_minor: highMinor,
      },
    }
  );
}

module.exports = {
  sentinel_forecast_bill_outlays,
};
