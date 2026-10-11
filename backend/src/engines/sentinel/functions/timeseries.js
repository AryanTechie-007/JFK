/**
 * 3. `sentinel_get_spending_timeseries` (Sentinel §B.6.3, §C.3, §K.1, SEN-AC-14)
 */

const { computeCategorySpend, isActiveRow } = require('../../../shared/finance/movement');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getPreviousMonths, addMonthsToYearMonth } = require('../inputs/load');
const { getSignedCategorySpendDelta, isCountablePostedRow } = require('../ledger/spend');
const { buildEnvelope } = require('./envelope');

function getIsoWeekBucket(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function buildPeriodsRange(fromPeriod, toPeriod, currentMonthIst, monthsFallback = 6) {
  if (fromPeriod && toPeriod) {
    const list = [];
    let cur = fromPeriod;
    let safety = 0;
    while (cur <= toPeriod && safety < 36) {
      list.push(cur);
      cur = addMonthsToYearMonth(cur, 1);
      safety++;
    }
    return list;
  }
  return [
    ...getPreviousMonths(currentMonthIst, Math.max(0, monthsFallback - 1)),
    currentMonthIst,
  ];
}

function sentinel_get_spending_timeseries(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const granularity = String(args.granularity || 'MONTH').toUpperCase();
  const monthsCount = Number(args.months) || 6;
  const categoryId = args.category_id || null;
  const categoryScope = Array.isArray(args.category_scope)
    ? args.category_scope
    : categoryId
    ? [categoryId]
    : null;

  const monthsList = buildPeriodsRange(
    args.from_period,
    args.to_period,
    state.current_month_ist,
    monthsCount
  );
  const periodSet = new Set(monthsList);

  // Build canonical §C.3 buckets (`{ bucket, category_id, spend_signed_minor }`)
  const bucketTotals = new Map();
  const bucketByCat = new Map();

  if (granularity === 'MONTH') {
    for (const m of monthsList) {
      bucketTotals.set(m, 0);
    }
  }

  for (const tx of state.all_txns) {
    if (!isCountablePostedRow(tx)) continue;
    const txDate = String(tx.txn_date).slice(0, 10);
    const txMonth = txDate.slice(0, 7);
    if (!periodSet.has(txMonth)) continue;

    if (categoryScope) {
      const inScope = categoryScope.some(
        (sc) => tx.category_id === sc || (tx.category_id && tx.category_id.startsWith(`${sc}.`))
      );
      if (!inScope) continue;
    }

    const delta = getSignedCategorySpendDelta(tx);
    if (delta === 0) continue;

    const bucketKey =
      granularity === 'DAY'
        ? txDate
        : granularity === 'WEEK'
        ? getIsoWeekBucket(txDate)
        : txMonth;

    bucketTotals.set(bucketKey, (bucketTotals.get(bucketKey) || 0) + delta);
    const catKey = `${bucketKey}::${tx.category_id}`;
    bucketByCat.set(catKey, (bucketByCat.get(catKey) || 0) + delta);
  }

  const buckets = [];
  for (const [bKey, totalSigned] of Array.from(bucketTotals.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    buckets.push({
      bucket: bKey,
      category_id: categoryId || null,
      spend_signed_minor: totalSigned,
    });
  }
  for (const [catKey, signedAmt] of Array.from(bucketByCat.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const [bKey, cId] = catKey.split('::');
    if (!categoryId || cId !== categoryId) {
      buckets.push({
        bucket: bKey,
        category_id: cId,
        spend_signed_minor: signedAmt,
      });
    }
  }

  // Also build legacy `series` for existing frontend/routes
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

  return buildEnvelope(
    state,
    'sentinel_get_spending_timeseries',
    {
      // Canonical §C.3 fields
      granularity,
      from_period: monthsList[0] || state.current_month_ist,
      to_period: monthsList[monthsList.length - 1] || state.current_month_ist,
      buckets,
      // Legacy compatibility fields
      category_id: categoryId,
      months: monthsList.length,
      series,
    },
    'HIGH',
    [],
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_get_spending_timeseries,
};
