/**
 * 5. `sentinel_run_category_utilization` (Sentinel §B.6.5, §C.3, SC §5.7, §K.1, SEN-AC-14, SEN-AC-16)
 */

const { halfEvenRoundBigInt, ratioToBp } = require('../../../shared/money');
const { getCapsForUser } = require('../../../platform/profile');
const { CATEGORIES, getCategoryDisplayName, isValidCategoryId } = require('../../categorizer/taxonomy');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getPreviousMonths, getMonthDays } = require('../inputs/load');
const {
  getEffectiveCapMap,
  getCoveredLeafIds,
  computeSpendForCategories,
  isFixedCategory,
} = require('../ledger/spend');
const { makeConstraint } = require('../rules/goal');
const { buildEnvelope } = require('./envelope');

function computeTierFromUtilization(utilizationBp, capMinor, spentMinor, registry = SENTINEL_PARAMS) {
  if (capMinor === null || capMinor === undefined) return null;
  if (capMinor === 0) {
    return spentMinor > 0 ? 'EXCEEDED' : 'HEALTHY';
  }
  const warningBp = (registry.tier && registry.tier.warning_bp) || 8000;
  const exceededBp = (registry.tier && registry.tier.exceeded_bp) || 10000;
  if (utilizationBp > exceededBp) return 'EXCEEDED';
  if (utilizationBp >= warningBp) return 'WARNING';
  return 'HEALTHY';
}

function computeLegacyTier(utilizationBp, registry = SENTINEL_PARAMS) {
  const severeBp = (registry.tier && registry.tier.severe_bp) || registry.severe_tier_bp || 11000;
  const breachBp = (registry.tier && registry.tier.exceeded_bp) || registry.breach_tier_bp || 10000;
  const watchBp = (registry.tier && registry.tier.watch_bp) || registry.watch_tier_bp || 8500;
  if (utilizationBp >= severeBp) return 'SEVERE';
  if (utilizationBp >= breachBp) return 'BREACH';
  if (utilizationBp >= watchBp) return 'WATCH';
  return 'NORMAL';
}

function sentinel_run_category_utilization(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const period = args.period || state.current_month_ist;
  const targetCategory = args.category_id || null;

  if (targetCategory && targetCategory !== 'UNCATEGORIZED' && !isValidCategoryId(targetCategory, true)) {
    return buildEnvelope(
      state,
      'sentinel_run_category_utilization',
      null,
      'LOW',
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Unknown category_id: ${targetCategory}` },
      { registry, params: args }
    );
  }

  const periodTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(period));
  const caps = getCapsForUser(state.user_id, period);
  const capMap = getEffectiveCapMap({ ...state, caps }, period);

  const daysInMonth = getMonthDays(period);
  const currentDay =
    period === state.current_month_ist
      ? Math.max(1, parseInt(state.current_date_ist.slice(8, 10), 10) || 1)
      : daysInMonth;
  const daysRemaining = Math.max(0, daysInMonth - currentDay);
  const prev3Months = getPreviousMonths(period, 3);

  function buildCategoryRow(catId, capObj = null) {
    const hasCap = capObj !== null && capObj !== undefined;
    const capMinor = hasCap ? Math.trunc(Number(capObj.effective_amount_minor ?? capObj.amount_minor) || 0) : null;
    // Exclusive cap coverage partition (SC §5.7, §C.5, SEN-AC-16)
    const coveredIds = getCoveredLeafIds(catId, state, period, capMap);
    const spend = computeSpendForCategories(periodTxns, coveredIds, period, null, catId);

    const utilizationBp =
      capMinor !== null
        ? capMinor > 0
          ? ratioToBp(spend.spent_total_minor, capMinor)
          : spend.spent_total_minor > 0
          ? 10001
          : 0
        : null;
    const settledUtilizationBp =
      capMinor !== null
        ? capMinor > 0
          ? ratioToBp(spend.spent_settled_minor, capMinor)
          : spend.spent_settled_minor > 0
          ? 10001
          : 0
        : null;

    const remainingSignedMinor = capMinor !== null ? capMinor - spend.spent_total_minor : null;
    const safeDailyMinor =
      remainingSignedMinor !== null && daysRemaining > 0 && remainingSignedMinor > 0
        ? halfEvenRoundBigInt(remainingSignedMinor, daysRemaining)
        : 0;

    const canonicalTier = computeTierFromUtilization(
      utilizationBp,
      capMinor,
      spend.spent_total_minor,
      registry
    );
    const settledCanonicalTier = computeTierFromUtilization(
      settledUtilizationBp,
      capMinor,
      spend.spent_settled_minor,
      registry
    );
    const tierIsProvisional = Boolean(
      canonicalTier !== null && canonicalTier !== settledCanonicalTier
    );
    const legacyTier = utilizationBp !== null ? computeLegacyTier(utilizationBp, registry) : 'NORMAL';

    let priorBreachMonths = 0;
    if (capMinor !== null && capMinor > 0) {
      for (const pm of prev3Months) {
        const pmTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(pm));
        const pmSpend = computeSpendForCategories(pmTxns, coveredIds, pm, null, catId).spent_total_minor;
        if (pmSpend > capMinor) priorBreachMonths++;
      }
    }

    return {
      cap_id: capObj ? capObj.cap_id : null,
      category_id: catId,
      period,
      display_name: capObj ? capObj.category_display_name : getCategoryDisplayName(catId),
      cap_minor: capMinor,
      standing_cap_minor: capObj ? capObj.standing_amount_minor : null,
      has_month_override: capObj ? Boolean(capObj.has_month_override) : false,
      covered_category_ids: coveredIds,
      spent_signed_minor: spend.spent_signed_minor,
      spent_total_minor: spend.spent_total_minor,
      spent_settled_minor: spend.spent_settled_minor,
      spent_provisional_minor: spend.spent_provisional_minor,
      // Legacy spend aliases
      settled_spend_minor: spend.spent_settled_minor,
      provisional_spend_minor: spend.spent_provisional_minor,
      total_spend_minor: spend.spent_total_minor,
      remaining_signed_minor: remainingSignedMinor,
      excess_minor: capMinor !== null ? Math.max(0, spend.spent_total_minor - capMinor) : 0,
      utilization_bp: utilizationBp,
      settled_utilization_bp: settledUtilizationBp,
      tier: legacyTier,
      canonical_tier: canonicalTier,
      tier_is_provisional: tierIsProvisional,
      watching: capObj ? Boolean(capObj.watching) : false,
      safe_daily_minor: safeDailyMinor,
      prior_breach_months_in_3m: priorBreachMonths,
      recurring_overspend: priorBreachMonths >= 2,
    };
  }

  const rows = caps
    .filter((c) => !targetCategory || c.category_id === targetCategory)
    .map((cap) => buildCategoryRow(cap.category_id, cap));

  // If a specific targetCategory was requested and has no cap, still build its canonical utilization record
  let primaryRow = rows[0] || null;
  if (targetCategory && !primaryRow) {
    primaryRow = buildCategoryRow(targetCategory, null);
  }

  // Uncapped categories that have spend in the period (and are not already covered by a parent cap!)
  const allCoveredByCaps = new Set();
  for (const cap of caps) {
    for (const leafId of getCoveredLeafIds(cap.category_id, state, period, capMap)) {
      allCoveredByCaps.add(leafId);
    }
  }

  const uncappedCategories = [];
  if (!targetCategory) {
    for (const cat of CATEGORIES) {
      if (caps.some((c) => c.category_id === cat.category_id)) continue;
      if (allCoveredByCaps.has(cat.category_id)) continue;
      const spend = computeSpendForCategories(periodTxns, [cat.category_id], period);
      if (spend.spent_total_minor > 0 || spend.spent_signed_minor !== 0) {
        uncappedCategories.push({
          category_id: cat.category_id,
          display_name: cat.display_name,
          covered_category_ids: isFixedCategory(cat.category_id, state) ? [] : [cat.category_id],
          spent_signed_minor: spend.spent_signed_minor,
          spent_total_minor: spend.spent_total_minor,
          spent_settled_minor: spend.spent_settled_minor,
          spent_provisional_minor: spend.spent_provisional_minor,
          settled_spend_minor: spend.spent_settled_minor,
          provisional_spend_minor: spend.spent_provisional_minor,
          total_spend_minor: spend.spent_total_minor,
        });
      }
    }
  }

  const constraints = [];
  if (rows.some((r) => r.recurring_overspend)) {
    constraints.push(makeConstraint('RECURRING_OVERSPEND_PATTERN', {}, 'WARNING'));
  }
  const anyProvisionalTier =
    rows.some((r) => r.tier_is_provisional) || Boolean(primaryRow && primaryRow.tier_is_provisional);
  if (anyProvisionalTier) {
    constraints.push(makeConstraint('PROVISIONAL_DATA', {}, 'WARNING'));
  }

  const totalCapMinor = rows.reduce((s, r) => s + (r.cap_minor || 0), 0);
  const totalCappedSpendMinor = rows.reduce((s, r) => s + r.total_spend_minor, 0);
  const totalRemainingMinor = Math.max(0, totalCapMinor - totalCappedSpendMinor);
  const overallSafeDailyMinor =
    daysRemaining > 0 ? halfEvenRoundBigInt(totalRemainingMinor, daysRemaining) : 0;

  const singleRowFields = primaryRow
    ? {
        category_id: primaryRow.category_id,
        cap_minor: primaryRow.cap_minor,
        covered_category_ids: primaryRow.covered_category_ids,
        spent_signed_minor: primaryRow.spent_signed_minor,
        spent_total_minor: primaryRow.spent_total_minor,
        spent_settled_minor: primaryRow.spent_settled_minor,
        spent_provisional_minor: primaryRow.spent_provisional_minor,
        utilization_bp: primaryRow.utilization_bp,
        remaining_signed_minor: primaryRow.remaining_signed_minor,
        tier: primaryRow.canonical_tier,
        legacy_tier: primaryRow.tier,
        tier_is_provisional: primaryRow.tier_is_provisional,
      }
    : {
        category_id: targetCategory || 'ALL',
        cap_minor: totalCapMinor,
        covered_category_ids: Array.from(allCoveredByCaps),
        spent_signed_minor: totalCappedSpendMinor,
        spent_total_minor: totalCappedSpendMinor,
        spent_settled_minor: rows.reduce((s, r) => s + r.spent_settled_minor, 0),
        spent_provisional_minor: rows.reduce((s, r) => s + r.spent_provisional_minor, 0),
        utilization_bp: totalCapMinor > 0 ? ratioToBp(totalCappedSpendMinor, totalCapMinor) : null,
        remaining_signed_minor: totalCapMinor - totalCappedSpendMinor,
        tier: computeTierFromUtilization(
          totalCapMinor > 0 ? ratioToBp(totalCappedSpendMinor, totalCapMinor) : null,
          totalCapMinor,
          totalCappedSpendMinor,
          registry
        ),
        tier_is_provisional: anyProvisionalTier,
      };

  const baseConfidence = anyProvisionalTier ? 'MEDIUM' : 'HIGH';

  return buildEnvelope(
    state,
    'sentinel_run_category_utilization',
    {
      ...singleRowFields,
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
    baseConfidence,
    constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  computeTierFromUtilization,
  sentinel_run_category_utilization,
};
