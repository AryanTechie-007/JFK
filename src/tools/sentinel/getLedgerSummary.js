/**
 * sentinel_get_ledger_summary — Section 6 Sentinel Function #1
 *
 * Purpose: Category totals, merchant baselines, recurring schedule (aggregates, never raw rows).
 * Inputs: timeframe_months, category_scope?
 * Returns: Aggregates, merchant-level totals, uncategorized bucket, confidence, tool_result_id
 */

const SnapshotManager = require('./SnapshotManager');
const TaxonomyRegistry = require('../tally/TaxonomyRegistry');

let callSeq = 1;

function sentinel_get_ledger_summary({
  snapshot_id,
  timeframe_months = 1,
  category_scope = null
} = {}) {
  const snapshot = SnapshotManager.getSnapshot(snapshot_id);
  if (!snapshot) {
    const err = new Error(`Sentinel snapshot "${snapshot_id}" not found.`);
    err.code = 'SNAPSHOT_NOT_FOUND';
    throw err;
  }
  if (snapshot.simulate_timeout) {
    const err = new Error('Sentinel timeout while computing ledger summary.');
    err.code = 'SENTINEL_TIMEOUT';
    throw err;
  }

  const toolResultId = `res_ledger_summary_${snapshot.snapshot_id}_${callSeq++}`;
  const resolvedScope = category_scope ? TaxonomyRegistry.resolve(category_scope) : null;

  const categoryTotalsMap = {};
  const merchantTotalsMap = {};
  let uncategorizedTotal = 0;
  let uncategorizedCount = 0;
  let provisionalTotal = 0;
  let totalAmount = 0;

  for (const tx of snapshot.transactions) {
    // Filter by month if timeframe_months === 1
    if (timeframe_months === 1 && tx.txn_date && !tx.txn_date.startsWith(snapshot.month)) {
      continue;
    }

    const amt = Number(tx.amount) || 0;
    totalAmount += amt;

    const isUncategorized =
      tx.categorization_status === 'UNCATEGORIZED' ||
      tx.category === 'UNCATEGORIZED' ||
      tx.category_id === 'cat_uncategorized';

    if (isUncategorized) {
      uncategorizedTotal += amt;
      uncategorizedCount++;
      continue;
    }

    if (tx.categorization_status === 'NEEDS_REVIEW') {
      provisionalTotal += amt;
    }

    if (resolvedScope) {
      const txNode = TaxonomyRegistry.resolve(tx.category_id || tx.category);
      const matchesScope =
        tx.category === resolvedScope.name ||
        tx.category_id === resolvedScope.category_id ||
        (txNode && txNode.parent_id === resolvedScope.category_id);
      if (!matchesScope) continue;
    }

    const catName = tx.category;
    if (!categoryTotalsMap[catName]) {
      categoryTotalsMap[catName] = {
        category: catName,
        category_id: tx.category_id || TaxonomyRegistry.resolve(catName)?.category_id || catName,
        total_amount: 0,
        transaction_count: 0
      };
    }
    categoryTotalsMap[catName].total_amount += amt;
    categoryTotalsMap[catName].transaction_count += 1;

    const merchantKey = tx.merchant_sanitized || (tx.raw_description || 'Unknown').split(' ')[0];
    if (!merchantTotalsMap[merchantKey]) {
      merchantTotalsMap[merchantKey] = {
        merchant: merchantKey,
        category: catName,
        total_amount: 0,
        swipe_count: 0
      };
    }
    merchantTotalsMap[merchantKey].total_amount += amt;
    merchantTotalsMap[merchantKey].swipe_count += 1;
  }

  const recurringSchedule = (snapshot.merchant_profiles || [])
    .filter(m => Number(m.is_subscription) === 1 || m.frequency === 'monthly' || m.frequency === 'weekly')
    .map(m => ({
      merchant_name: m.merchant_name,
      category: m.category,
      typical_amount: Number(m.typical_amount),
      frequency: m.frequency,
      is_subscription: Boolean(m.is_subscription)
    }));

  const uncategorizedRatio = totalAmount > 0 ? uncategorizedTotal / totalAmount : 0;
  const provisionalRatio = totalAmount > 0 ? provisionalTotal / totalAmount : 0;
  let confidence = 'high';
  if (snapshot.confidence_override) {
    confidence = snapshot.confidence_override;
  } else if (snapshot.import_in_progress || uncategorizedRatio > 0.15 || provisionalRatio > 0.2) {
    confidence = 'low';
  } else if (uncategorizedRatio > 0.05 || provisionalRatio > 0) {
    confidence = 'medium';
  }

  return {
    tool_result_id: toolResultId,
    snapshot_id: snapshot.snapshot_id,
    timeframe_months,
    category_scope: category_scope || 'ALL',
    category_totals: Object.values(categoryTotalsMap),
    merchant_level_totals: Object.values(merchantTotalsMap),
    merchant_baselines: snapshot.merchant_profiles || [],
    recurring_schedule: recurringSchedule,
    uncategorized_bucket: {
      total_amount: uncategorizedTotal,
      amount_minor: Math.round(uncategorizedTotal * 100),
      transaction_count: uncategorizedCount,
      is_material: uncategorizedTotal >= 1000 || uncategorizedRatio >= 0.05
    },
    confidence
  };
}

module.exports = sentinel_get_ledger_summary;
