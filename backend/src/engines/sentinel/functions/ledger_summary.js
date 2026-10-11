/**
 * 2. `sentinel_get_ledger_summary` (Sentinel §B.6.2, §C.3, §K.1)
 */

const { halfEvenRoundBigInt, ratioToBp } = require('../../../shared/money');
const {
  computeCategorySpend,
  isActiveRow,
  isSpendDebit,
  isSpendOffsetCredit,
  isSettledStatus,
} = require('../../../shared/finance/movement');
const { getCategoryDisplayName } = require('../../categorizer/taxonomy');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getPreviousMonths } = require('../inputs/load');
const {
  getSignedCategorySpendDelta,
  computeSpecialLedgerBuckets,
  isCountablePostedRow,
  getTxClassificationStatus,
} = require('../ledger/spend');
const { detectRecurringSchedule } = require('../stats/cadence');
const { buildEnvelope } = require('./envelope');

function sentinel_get_ledger_summary(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const timeframeMonths = Math.min(12, Math.max(1, Number(args.timeframe_months) || 1));
  const categoryScope =
    Array.isArray(args.category_scope) && args.category_scope.length > 0
      ? args.category_scope
      : null;

  const targetMonths =
    timeframeMonths === 1
      ? [state.current_month_ist]
      : [
          ...getPreviousMonths(state.current_month_ist, timeframeMonths - 1),
          state.current_month_ist,
        ];
  const periodSet = new Set(targetMonths);

  const windowTxns = state.all_txns.filter((t) =>
    targetMonths.some((m) => String(t.txn_date).startsWith(m))
  );

  const topMerchantsLimit = (registry.ledger && registry.ledger.top_merchants) || 5;
  const categoryTotalsMap = {};
  const globalMerchantTotalsMap = {};

  for (const t of windowTxns) {
    if (!isCountablePostedRow(t)) continue;
    if (!isSpendDebit(t) && !isSpendOffsetCredit(t)) continue;

    if (categoryScope) {
      const inScope = categoryScope.some(
        (sc) => t.category_id === sc || (t.category_id && t.category_id.startsWith(`${sc}.`))
      );
      if (!inScope) continue;
    }

    const catId = t.category_id || 'UNCATEGORIZED';
    if (!categoryTotalsMap[catId]) {
      categoryTotalsMap[catId] = {
        category_id: catId,
        display_name: getCategoryDisplayName(catId),
        txns: [],
        signed_minor: 0,
        count: 0,
        merchants: {},
      };
    }
    categoryTotalsMap[catId].txns.push(t);
    categoryTotalsMap[catId].signed_minor += getSignedCategorySpendDelta(t);
    if (isSpendDebit(t)) categoryTotalsMap[catId].count += 1;

    // §B.6.2: Top merchants from settled rows with resolved merchant_id/merchant_display_name only
    const classStatus = getTxClassificationStatus(t);
    const merchantName = t.merchant_display_name || t.merchant_name || null;
    const merchantId = t.merchant_id || merchantName;
    if (isSpendDebit(t) && isSettledStatus(classStatus) && merchantId && merchantName) {
      if (!categoryTotalsMap[catId].merchants[merchantId]) {
        categoryTotalsMap[catId].merchants[merchantId] = {
          merchant_id: String(merchantId),
          merchant_name: String(merchantName).slice(0, 40),
          merchant_display_name: String(merchantName).slice(0, 40),
          total_minor: 0,
          spend_minor: 0,
          count: 0,
          txn_count: 0,
        };
      }
      const mEntry = categoryTotalsMap[catId].merchants[merchantId];
      const amt = Math.trunc(Number(t.amount_minor) || 0);
      mEntry.total_minor += amt;
      mEntry.spend_minor += amt;
      mEntry.count += 1;
      mEntry.txn_count += 1;

      if (!globalMerchantTotalsMap[merchantId]) {
        globalMerchantTotalsMap[merchantId] = {
          merchant_id: String(merchantId),
          merchant_name: String(merchantName).slice(0, 40),
          merchant_display_name: String(merchantName).slice(0, 40),
          category_id: catId,
          total_minor: 0,
          spend_minor: 0,
          count: 0,
          txn_count: 0,
        };
      }
      globalMerchantTotalsMap[merchantId].total_minor += amt;
      globalMerchantTotalsMap[merchantId].spend_minor += amt;
      globalMerchantTotalsMap[merchantId].count += 1;
      globalMerchantTotalsMap[merchantId].txn_count += 1;
    }
  }

  const grandSpend = computeCategorySpend(windowTxns, null);
  const specialBuckets = computeSpecialLedgerBuckets(windowTxns, periodSet);

  const categories = Object.values(categoryTotalsMap)
    .map((entry) => {
      const s = computeCategorySpend(
        entry.txns,
        entry.category_id === 'UNCATEGORIZED' ? null : entry.category_id
      );
      const signedMinor =
        entry.category_id === 'UNCATEGORIZED' ? s.total_spend_minor : entry.signed_minor;
      const monthlyAvgMinor = halfEvenRoundBigInt(s.total_spend_minor, timeframeMonths);
      const catTopMerchants = Object.values(entry.merchants)
        .sort((a, b) => b.total_minor - a.total_minor || a.merchant_id.localeCompare(b.merchant_id))
        .slice(0, topMerchantsLimit);

      return {
        category_id: entry.category_id,
        display_name: entry.display_name,
        // Canonical §C.3 fields
        total_signed_minor: signedMinor,
        monthly_average_minor: monthlyAvgMinor,
        settled_minor: s.settled_spend_minor,
        provisional_minor: s.provisional_spend_minor,
        top_merchants: catTopMerchants,
        // Backward-compatible legacy aliases
        settled_spend_minor: s.settled_spend_minor,
        provisional_spend_minor: s.provisional_spend_minor,
        total_spend_minor: s.total_spend_minor,
        monthly_avg_minor: monthlyAvgMinor,
        share_bp: ratioToBp(s.total_spend_minor, grandSpend.total_spend_minor),
        txn_count: entry.count,
      };
    })
    .sort((a, b) => b.total_spend_minor - a.total_spend_minor);

  const topMerchants = Object.values(globalMerchantTotalsMap)
    .sort((a, b) => b.spend_minor - a.spend_minor)
    .slice(0, 10);

  // Recurring cadence schedule (§B.6.2 & §B.6.13)
  const recurringTxns = state.all_txns.map((t) => ({
    ...t,
    merchant_name: t.merchant_display_name || t.merchant_name || t.normalized_description,
    is_duplicate: Boolean(t.is_duplicate_of || t.is_duplicate),
  }));
  const recurringSchedule = detectRecurringSchedule(
    recurringTxns,
    state.current_date_ist,
    registry
  );

  const intrinsicConf = timeframeMonths >= 3 ? 'HIGH' : 'MEDIUM';

  return buildEnvelope(
    state,
    'sentinel_get_ledger_summary',
    {
      // Canonical §C.3 fields
      periods: targetMonths,
      categories,
      uncategorized_minor: specialBuckets.uncategorized_minor,
      card_payment_unmatched_minor: specialBuckets.card_payment_unmatched_minor,
      unclassified_movement_minor: specialBuckets.unclassified_movement_minor,
      unmatched_credits_minor: specialBuckets.unmatched_credits_minor,
      recurring_schedule: recurringSchedule,
      // Backward-compatible legacy aliases
      timeframe_months: timeframeMonths,
      months_included: targetMonths,
      total_settled_spend_minor: grandSpend.settled_spend_minor,
      total_provisional_spend_minor: grandSpend.provisional_spend_minor,
      total_spend_minor: grandSpend.total_spend_minor,
      uncategorized_spend_minor: specialBuckets.uncategorized_minor,
      top_merchants: topMerchants,
    },
    intrinsicConf,
    [],
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_get_ledger_summary,
};
