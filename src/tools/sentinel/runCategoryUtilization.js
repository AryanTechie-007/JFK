/**
 * sentinel_run_category_utilization — Section 6 Sentinel Function #2
 *
 * Purpose: Utilization, remaining allowance, tier. Cap read from the snapshot.
 * Inputs: category (optional; if omitted or 'ALL', computes all categories)
 * Returns: Utilization %, remaining, tier, spent_total, spent_settled, spent_provisional, tier_is_provisional
 *
 * V4 Rules Implemented:
 * - Thresholds (Section 4): Healthy < 80%, Warning 80% to 100%, Exceeded > 100%
 * - Taxonomy Hierarchy (Section 6): A cap on a parent category covers all its subcategories
 *   unless a subcategory has its own cap.
 * - Provisional Spend: Tracks `spent_settled`, `spent_provisional` (NEEDS_REVIEW), and
 *   `tier_is_provisional` (true when current tier depends on provisional amounts).
 * - Uncategorized Spend (Section 12): Excluded from caps; reported beside status.
 */

const SnapshotManager = require('./SnapshotManager');
const TaxonomyRegistry = require('../tally/TaxonomyRegistry');
const { DEFAULT_TIER_THRESHOLDS } = require('../../contracts/PlatformRules');

let utilSeq = 1;

function determineTier(pct, thresholds = DEFAULT_TIER_THRESHOLDS) {
  if (pct > thresholds.exceeded_min_pct) return 'exceeded';
  if (pct >= thresholds.warning_min_pct) return 'warning';
  return 'healthy';
}

function sentinel_run_category_utilization({
  snapshot_id,
  category = null,
  thresholds = DEFAULT_TIER_THRESHOLDS
} = {}) {
  const snapshot = SnapshotManager.getSnapshot(snapshot_id);
  if (!snapshot) {
    const err = new Error(`Sentinel snapshot "${snapshot_id}" not found.`);
    err.code = 'SNAPSHOT_NOT_FOUND';
    throw err;
  }
  if (snapshot.simulate_timeout) {
    const err = new Error('Sentinel timeout while computing category utilization.');
    err.code = 'SENTINEL_TIMEOUT';
    throw err;
  }

  const toolResultId = `res_cat_util_${snapshot.snapshot_id}_${utilSeq++}`;
  const monthTxns = snapshot.transactions.filter(
    t => !snapshot.month || (t.txn_date || '').startsWith(snapshot.month)
  );

  // Build set of all configured cap category_ids
  const configuredCapIds = new Set(
    snapshot.caps.map(c => c.category_id || TaxonomyRegistry.resolve(c.category)?.category_id || c.category)
  );

  // Separate uncategorized transactions (Section 12: "Category missing (UNCATEGORIZED) -> Excluded from caps")
  let uncategorizedTotal = 0;
  let uncategorizedCount = 0;
  const categorizedTxns = [];

  for (const tx of monthTxns) {
    const isUncat =
      tx.categorization_status === 'UNCATEGORIZED' ||
      tx.category === 'UNCATEGORIZED' ||
      tx.category_id === 'cat_uncategorized';
    if (isUncat) {
      uncategorizedTotal += Number(tx.amount) || 0;
      uncategorizedCount++;
    } else {
      categorizedTxns.push(tx);
    }
  }

  const assignedTxIds = new Set();
  const evaluatedCategories = [];

  // Process subcategories with their own caps first, then parent categories
  const sortedCaps = [...snapshot.caps].sort((a, b) => {
    const nodeA = TaxonomyRegistry.resolve(a.category_id || a.category);
    const nodeB = TaxonomyRegistry.resolve(b.category_id || b.category);
    const isSubA = nodeA?.parent_id ? 1 : 0;
    const isSubB = nodeB?.parent_id ? 1 : 0;
    return isSubB - isSubA;
  });

  for (const capItem of sortedCaps) {
    const node = TaxonomyRegistry.resolve(capItem.category_id || capItem.category);
    const catId = node ? node.category_id : (capItem.category_id || capItem.category);
    const coveredIds = new Set(TaxonomyRegistry.getCoveredCategoryIds(catId, configuredCapIds));

    let spentSettled = 0;
    let spentProvisional = 0;
    let txnCount = 0;
    let provisionalCount = 0;

    for (const tx of categorizedTxns) {
      if (assignedTxIds.has(tx.id)) continue;
      const txNode = TaxonomyRegistry.resolve(tx.category_id || tx.category);
      const txCatId = txNode ? txNode.category_id : tx.category_id;

      const matchesById = txCatId && coveredIds.has(txCatId);
      const matchesByName = tx.category === capItem.category || (node && tx.category === node.name);

      // If a subcategory has its own cap, do not double-count in parent
      if (txCatId && txCatId !== catId && configuredCapIds.has(txCatId)) {
        continue;
      }

      if (matchesById || matchesByName) {
        assignedTxIds.add(tx.id);
        const amt = Number(tx.amount) || 0;
        txnCount++;
        if (tx.categorization_status === 'NEEDS_REVIEW') {
          spentProvisional += amt;
          provisionalCount++;
        } else {
          spentSettled += amt;
        }
      }
    }

    const spentTotal = spentSettled + spentProvisional;
    const limit = Number(capItem.monthly_cap) || 0;
    const utilizationPct = limit > 0 ? Math.round((spentTotal / limit) * 100) : 0;
    const settledPct = limit > 0 ? Math.round((spentSettled / limit) * 100) : 0;

    const tier = determineTier(utilizationPct, thresholds);
    const settledTier = determineTier(settledPct, thresholds);

    // tier_is_provisional is true when the current Warning/Exceeded tier depends on NEEDS_REVIEW amounts
    const tierIsProvisional =
      (tier === 'warning' || tier === 'exceeded') &&
      spentProvisional > 0 &&
      tier !== settledTier;

    evaluatedCategories.push({
      category_id: catId,
      category: node ? node.name : capItem.category,
      parent_id: node ? node.parent_id : null,
      covered_category_ids: Array.from(coveredIds),
      migrated: Boolean(capItem.migrated),
      migrated_from: capItem.migrated_from || null,
      monthly_cap: limit,
      spent: spentTotal,
      spent_total: spentTotal,
      spent_settled: spentSettled,
      spent_provisional: spentProvisional,
      remaining: limit - spentTotal,
      utilization_pct: utilizationPct,
      used_pct: utilizationPct,
      tier,
      status: tier,
      settled_tier: settledTier,
      tier_is_provisional: tierIsProvisional,
      provisional_txn_count: provisionalCount,
      txn_count: txnCount,
      is_capped: true,
      tool_result_id: `${toolResultId}_${catId}`
    });
  }

  // Restore original cap ordering (by monthly_cap DESC)
  evaluatedCategories.sort((a, b) => b.monthly_cap - a.monthly_cap);

  // Track uncapped categories (excluding uncategorized, which is in uncategorized_bucket)
  const uncappedMap = {};
  for (const tx of categorizedTxns) {
    if (assignedTxIds.has(tx.id)) continue;
    const key = tx.category;
    if (!uncappedMap[key]) {
      const resolved = TaxonomyRegistry.resolve(tx.category_id || tx.category);
      uncappedMap[key] = {
        category_id: resolved ? resolved.category_id : `cat_${key.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        category: key,
        monthly_cap: null,
        spent: 0,
        spent_total: 0,
        spent_settled: 0,
        spent_provisional: 0,
        remaining: null,
        utilization_pct: null,
        used_pct: null,
        tier: 'uncapped',
        status: 'uncapped',
        tier_is_provisional: false,
        txn_count: 0,
        is_capped: false,
        tool_result_id: `${toolResultId}_uncapped_${key}`
      };
    }
    const amt = Number(tx.amount) || 0;
    uncappedMap[key].spent += amt;
    uncappedMap[key].spent_total += amt;
    if (tx.categorization_status === 'NEEDS_REVIEW') {
      uncappedMap[key].spent_provisional += amt;
    } else {
      uncappedMap[key].spent_settled += amt;
    }
    uncappedMap[key].txn_count += 1;
  }

  const uncappedCategories = Object.values(uncappedMap);
  const allCategories = [...evaluatedCategories, ...uncappedCategories];

  // Cash flow summary
  const totalCappedLimit = evaluatedCategories.reduce((s, c) => s + c.monthly_cap, 0);
  const totalCappedSpent = evaluatedCategories.reduce((s, c) => s + c.spent_total, 0);
  const totalUncappedSpent = uncappedCategories.reduce((s, c) => s + c.spent_total, 0);
  const totalVariableSpent = totalCappedSpent + totalUncappedSpent + uncategorizedTotal;

  const monthlyIncome = snapshot.user.monthly_income;
  const fixedHousing = snapshot.user.fixed_housing_expense;
  const netSurplus = Math.max(0, monthlyIncome - fixedHousing - totalVariableSpent);
  const savingsRatePct = monthlyIncome > 0 ? Number(((netSurplus / monthlyIncome) * 100).toFixed(1)) : 0;

  let focusedCategory = null;
  if (category && category !== 'ALL') {
    const resolvedReq = TaxonomyRegistry.resolve(category);
    focusedCategory = allCategories.find(
      c =>
        c.category_id === category ||
        c.category.toLowerCase() === category.toLowerCase() ||
        (resolvedReq && (c.category_id === resolvedReq.category_id || c.covered_category_ids?.includes(resolvedReq.category_id)))
    ) || null;
  }

  return {
    tool_result_id: toolResultId,
    snapshot_id: snapshot.snapshot_id,
    categorization_version: snapshot.categorization_version,
    month: snapshot.month,
    category: focusedCategory,
    categories: allCategories,
    capped_categories: evaluatedCategories,
    uncapped_categories: uncappedCategories,
    uncategorized: {
      excluded_from_caps: true,
      spent_total: uncategorizedTotal,
      txn_count: uncategorizedCount,
      is_material: uncategorizedTotal >= 1000
    },
    cashflow: {
      currency: snapshot.user.currency || '₹',
      monthly_income: monthlyIncome,
      fixed_housing_expense: fixedHousing,
      variable_spend: totalVariableSpent,
      net_surplus: netSurplus,
      savings_rate_pct: savingsRatePct
    },
    summary: {
      total_categories_tracked: allCategories.length,
      capped_categories: evaluatedCategories.length,
      uncapped_categories: uncappedCategories.length,
      categories_healthy: evaluatedCategories.filter(c => c.tier === 'healthy').length,
      categories_warning: evaluatedCategories.filter(c => c.tier === 'warning').length,
      categories_exceeded: evaluatedCategories.filter(c => c.tier === 'exceeded').length,
      total_monthly_cap: totalCappedLimit,
      total_variable_spent: totalVariableSpent,
      overall_budget_utilization_pct: totalCappedLimit > 0 ? Math.round((totalCappedSpent / totalCappedLimit) * 100) : 0
    }
  };
}

module.exports = {
  sentinel_run_category_utilization,
  determineTier
};
