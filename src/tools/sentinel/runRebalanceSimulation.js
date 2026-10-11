/**
 * sentinel_run_rebalance_simulation — Section 6 Sentinel Function #5
 *
 * Purpose: Zero-sum transfer that clears a deficit, excluding protected categories (read from preferences).
 * Inputs: deficit_category (optional), snapshot_id, preferences
 * Returns: Transfers, updated balances, net savings impact, shortfall, excluded_protected_categories, tool_result_id
 *
 * V4 Guardrails (Section 7 Pattern C & Section 9):
 * - Protected categories are owned by user preferences.
 * - Sentinel excludes them from donor candidates; Nova also states the exclusion.
 * - If no donor category clears the deficit without breaching protected categories,
 *   the rebalance result shows a `shortfall` so Nova can return a `GOAL_FUNDING_PRESSURE` hint.
 */

const SnapshotManager = require('./SnapshotManager');
const TaxonomyRegistry = require('../tally/TaxonomyRegistry');
const { sentinel_run_category_utilization } = require('./runCategoryUtilization');

let rebSeq = 1;

function normalizeProtectedSet(userPersonaOrPrefs = {}) {
  const rawList =
    userPersonaOrPrefs.protected_categories ||
    (typeof userPersonaOrPrefs.priority_categories === 'string'
      ? JSON.parse(userPersonaOrPrefs.priority_categories || '[]')
      : userPersonaOrPrefs.priority_categories) ||
    ['Housing', 'Healthcare', 'Bills & Utilities'];

  const set = new Set();
  const displayNames = new Set();

  for (const item of rawList) {
    set.add(item);
    const resolved = TaxonomyRegistry.resolve(item);
    if (resolved) {
      set.add(resolved.category_id);
      set.add(resolved.name);
      displayNames.add(resolved.name);
    } else {
      displayNames.add(item);
    }
  }
  return { set, displayNames: Array.from(displayNames) };
}

function computeRebalanceFromCategories(categoryEvaluations = [], userPersonaOrPrefs = {}, options = {}) {
  const { set: protectedSet, displayNames: excludedProtectedNames } = normalizeProtectedSet(userPersonaOrPrefs);

  const flexibleRaw =
    userPersonaOrPrefs.flexible_categories ||
    (typeof userPersonaOrPrefs.flexible_categories === 'string'
      ? JSON.parse(userPersonaOrPrefs.flexible_categories || '[]')
      : ['Shopping & Lifestyle', 'Food & Dining']);

  const flexibleSet = new Set();
  for (const f of Array.isArray(flexibleRaw) ? flexibleRaw : []) {
    flexibleSet.add(f);
    const res = TaxonomyRegistry.resolve(f);
    if (res) {
      flexibleSet.add(res.category_id);
      flexibleSet.add(res.name);
    }
  }

  const targetDeficitFilter = options.deficit_category
    ? TaxonomyRegistry.resolve(options.deficit_category)?.name || options.deficit_category
    : null;

  // Identify Deficit Categories (where remaining < 0, or if targetDeficitFilter is in warning/breach)
  let deficitCategories = categoryEvaluations
    .filter(c => c.is_capped && c.remaining < 0)
    .filter(c => !targetDeficitFilter || c.category === targetDeficitFilter || c.category_id === options.deficit_category)
    .map(c => ({
      category_id: c.category_id || c.category,
      category: c.category,
      deficit: Math.abs(c.remaining),
      monthly_cap: c.monthly_cap,
      spent: c.spent_total ?? c.spent
    }));

  // Pattern A support: if a specific category in warning tier (>=80%) is passed for rebalance simulation
  // and has not yet exceeded 100%, allow simulating a buffer top-up if requested
  if (deficitCategories.length === 0 && targetDeficitFilter) {
    const targetCat = categoryEvaluations.find(
      c => c.is_capped && (c.category === targetDeficitFilter || c.category_id === options.deficit_category)
    );
    if (targetCat && (targetCat.used_pct >= 80 || targetCat.utilization_pct >= 80)) {
      const bufferNeeded = Math.max(500, Math.round(targetCat.monthly_cap * 0.15));
      deficitCategories = [{
        category_id: targetCat.category_id || targetCat.category,
        category: targetCat.category,
        deficit: bufferNeeded,
        monthly_cap: targetCat.monthly_cap,
        spent: targetCat.spent_total ?? targetCat.spent
      }];
    }
  }

  // Identify Donor Categories (healthy categories with > 500 surplus, strictly excluding protected categories)
  const donorCategories = categoryEvaluations
    .filter(c => {
      if (!c.is_capped || c.remaining <= 500) return false;
      if (protectedSet.has(c.category) || protectedSet.has(c.category_id)) return false;
      if (deficitCategories.some(d => d.category === c.category)) return false;
      return true;
    })
    .map(c => ({
      category_id: c.category_id || c.category,
      category: c.category,
      available_surplus: c.remaining - 200, // keep a small buffer above current spend
      raw_remaining: c.remaining,
      monthly_cap: c.monthly_cap,
      spent: c.spent_total ?? c.spent,
      is_flexible: flexibleSet.has(c.category) || flexibleSet.has(c.category_id)
    }))
    .filter(d => d.available_surplus > 0)
    .sort((a, b) => b.available_surplus - a.available_surplus);

  const rebalanceMoves = [];
  const totalDeficit = deficitCategories.reduce((sum, d) => sum + d.deficit, 0);
  let totalResolved = 0;

  for (const def of deficitCategories) {
    let needed = def.deficit;

    for (const donor of donorCategories) {
      if (needed <= 0) break;
      if (donor.available_surplus <= 0) continue;

      const transferAmount = Math.min(needed, donor.available_surplus);
      if (transferAmount > 0) {
        const move = {
          from_category_id: donor.category_id,
          from_category: donor.category,
          to_category_id: def.category_id,
          to_category: def.category,
          amount: transferAmount,
          donor_old_cap: donor.monthly_cap,
          donor_new_cap: donor.monthly_cap - transferAmount,
          recipient_old_cap: def.monthly_cap,
          recipient_new_cap: def.monthly_cap + transferAmount,
          reasoning: `Transfer ₹${transferAmount.toLocaleString()} surplus buffer from "${donor.category}" to cover "${def.category}" (excluding protected categories: ${excludedProtectedNames.join(', ')}).`
        };
        rebalanceMoves.push(move);

        donor.available_surplus -= transferAmount;
        donor.monthly_cap -= transferAmount;
        def.monthly_cap += transferAmount;
        needed -= transferAmount;
        totalResolved += transferAmount;
      }
    }
  }

  const shortfall = Math.max(0, totalDeficit - totalResolved);
  const isFullyResolvable = totalDeficit > 0 && shortfall === 0;

  const updatedBalances = categoryEvaluations
    .filter(c => c.is_capped)
    .map(c => {
      const matchingDonorMoves = rebalanceMoves.filter(m => m.from_category === c.category);
      const matchingRecipMoves = rebalanceMoves.filter(m => m.to_category === c.category);
      const delta =
        matchingRecipMoves.reduce((s, m) => s + m.amount, 0) -
        matchingDonorMoves.reduce((s, m) => s + m.amount, 0);
      const newCap = c.monthly_cap + delta;
      const spent = c.spent_total ?? c.spent;
      return {
        category_id: c.category_id || c.category,
        category: c.category,
        old_cap: c.monthly_cap,
        new_cap: newCap,
        spent,
        new_remaining: newCap - spent
      };
    });

  return {
    tool_result_id: options.tool_result_id || `res_reb_${rebSeq++}`,
    has_proposals: rebalanceMoves.length > 0,
    total_deficit_amount: totalDeficit,
    total_resolved_amount: totalResolved,
    shortfall,
    is_fully_resolvable: isFullyResolvable,
    net_savings_impact: 0, // Zero-sum transfer leaves net savings unchanged
    excluded_protected_categories: excludedProtectedNames,
    transfers: rebalanceMoves,
    moves: rebalanceMoves,
    updated_balances: updatedBalances,
    summary_text: rebalanceMoves.length > 0
      ? `Nova Rebalance Engine generated ${rebalanceMoves.length} zero-sum adjustments resolving ₹${totalResolved.toLocaleString()} of category deficits${shortfall > 0 ? ` (shortfall: ₹${shortfall.toLocaleString()})` : ''} while excluding protected categories (${excludedProtectedNames.join(', ')}).`
      : totalDeficit > 0
        ? `No donor category can clear the ₹${totalDeficit.toLocaleString()} deficit without breaching protected categories (${excludedProtectedNames.join(', ')}). Shortfall: ₹${shortfall.toLocaleString()}.`
        : 'All category caps are currently balanced or no flexible surplus is available for transfer.'
  };
}

function sentinel_run_rebalance_simulation({
  snapshot_id = null,
  deficit_category = null,
  preferences = null,
  category_evaluations = null
} = {}) {
  if (snapshot_id) {
    const snapshot = SnapshotManager.getSnapshot(snapshot_id);
    if (!snapshot) {
      const err = new Error(`Sentinel snapshot "${snapshot_id}" not found.`);
      err.code = 'SNAPSHOT_NOT_FOUND';
      throw err;
    }
    if (snapshot.simulate_timeout) {
      const err = new Error('Sentinel timeout while running rebalance simulation.');
      err.code = 'SENTINEL_TIMEOUT';
      throw err;
    }

    const util = sentinel_run_category_utilization({ snapshot_id });
    const prefsToUse = preferences || snapshot.user_persona || {};
    const toolResultId = `res_reb_${snapshot.snapshot_id}_${rebSeq++}`;
    return computeRebalanceFromCategories(util.categories, prefsToUse, {
      deficit_category,
      tool_result_id: toolResultId
    });
  }

  return computeRebalanceFromCategories(category_evaluations || [], preferences || {}, {
    deficit_category
  });
}

class RebalanceEngine {
  static computeRebalancePlan(categoryEvaluations, userPersona = {}, options = {}) {
    return computeRebalanceFromCategories(categoryEvaluations, userPersona, options);
  }
}

module.exports = {
  sentinel_run_rebalance_simulation,
  RebalanceEngine
};
