/**
 * Sentinel Spend Definition & Exclusive Cap Coverage Partition (Sentinel §B.4, SC §5.7, §6.2, §K.1)
 * Implements single-truth spend aggregation across utilization, ledger summary, timeseries, and health score.
 */

const {
  CATEGORIES,
  PARENT_CATEGORIES,
  CATEGORY_BY_ID,
  getCategoryById,
  getCategoryDisplayName,
  isFixedCategory: taxonomyIsFixed,
  isValidCategoryId,
} = require('../../categorizer/taxonomy');
const {
  isActiveRow,
  isSpendDebit,
  isSpendOffsetCredit,
  isSettledStatus,
  isProvisionalStatus,
} = require('../../../shared/finance/movement');

const PARENT_TO_LEAVES = {};
for (const c of CATEGORIES) {
  if (!PARENT_TO_LEAVES[c.parent_id]) {
    PARENT_TO_LEAVES[c.parent_id] = [];
  }
  PARENT_TO_LEAVES[c.parent_id].push(c.category_id);
}

const DEPRECATED_CATEGORY_MAP = Object.freeze({
  'FOOD.COFFEE': 'FOOD.DINING',
  'SHOPPING.CLOTHING': 'SHOPPING.GENERAL',
  'ENTERTAINMENT.MOVIES': 'ENTERTAINMENT.LEISURE',
  'SUBSCRIPTIONS.SOFTWARE': 'SUBSCRIPTIONS.SOFTWARE_NEWS',
});

function isParentCategory(categoryId) {
  return Boolean(categoryId && PARENT_CATEGORIES[categoryId]);
}

function isFixedCategory(categoryId, state = null) {
  if (!categoryId) return false;
  if (state && state.fixedCategoryIds && state.fixedCategoryIds.has(categoryId)) {
    return true;
  }
  if (state && state.profile && Array.isArray(state.profile.fixed_expense_lines)) {
    if (state.profile.fixed_expense_lines.some((l) => l.category_id === categoryId)) {
      return true;
    }
  }
  return taxonomyIsFixed(categoryId);
}

function isIncomeOrSavingCategory(categoryId) {
  if (!categoryId) return false;
  const entry = getCategoryById(categoryId);
  if (!entry) return false;
  return entry.nature === 'INCOME' || entry.nature === 'SAVING';
}

function isCappableCategory(categoryId, state = null) {
  if (!categoryId || categoryId === 'UNCATEGORIZED') return false;
  if (DEPRECATED_CATEGORY_MAP[categoryId]) return true;
  if (!isValidCategoryId(categoryId, true)) return false;
  if (isFixedCategory(categoryId, state) || isIncomeOrSavingCategory(categoryId)) return false;
  if (isParentCategory(categoryId)) {
    const leaves = PARENT_TO_LEAVES[categoryId] || [];
    return leaves.some((leaf) => !isFixedCategory(leaf, state) && !isIncomeOrSavingCategory(leaf));
  }
  return true;
}

/**
 * Builds effective cap map (category_id -> cap_minor) for a given YYYY-MM period,
 * applying month overrides on top of standing caps.
 */
function getEffectiveCapMap(state, period = null, capChanges = []) {
  const targetPeriod = period || (state && (state.current_month_ist || state.currentPeriod));
  const map = new Map();
  const caps = (state && state.caps) || [];
  const overrides = (state && state.capOverrides) || [];

  for (const cap of caps) {
    let amount =
      cap.effective_amount_minor !== undefined &&
      (!targetPeriod || targetPeriod === (state && state.current_month_ist))
        ? cap.effective_amount_minor
        : cap.amount_minor;
    const ov = overrides.find(
      (o) =>
        (o.category_id === cap.category_id || (o.cap_id && o.cap_id === cap.cap_id)) &&
        o.period === targetPeriod
    );
    if (ov) {
      amount = ov.amount_minor !== undefined ? ov.amount_minor : ov.cap_minor;
    }
    map.set(cap.category_id, Math.trunc(Number(amount) || 0));
  }

  if (Array.isArray(capChanges)) {
    for (const chg of capChanges) {
      if (chg && chg.category_id && typeof chg.new_cap_minor === 'number') {
        map.set(chg.category_id, Math.trunc(chg.new_cap_minor));
      }
    }
  }
  return map;
}

/**
 * Exclusive cap coverage partition (SC §5.7, Sentinel §B.4, §C.5, SEN-AC-16):
 * - FIXED or INCOME/SAVING leaves cover [] (contradictory cap on FIXED leaf covers no spend, §C.5).
 * - A parent category covers its non-FIXED leaf children that do NOT have their own cap in period.
 * - A discretionary leaf covers [categoryId].
 */
function getCoveredLeafIds(categoryId, state = null, period = null, capMapOverride = null) {
  if (!categoryId || categoryId === 'UNCATEGORIZED') return [];
  const resolvedId = DEPRECATED_CATEGORY_MAP[categoryId] || categoryId;
  if (!isValidCategoryId(resolvedId, true)) return [];

  const capMap = capMapOverride || getEffectiveCapMap(state, period);

  if (isParentCategory(resolvedId)) {
    const leaves = PARENT_TO_LEAVES[resolvedId] || [];
    return leaves.filter((leafId) => {
      if (isFixedCategory(leafId, state) || isIncomeOrSavingCategory(leafId)) return false;
      if (capMap.has(leafId)) return false;
      return true;
    });
  }

  // Leaf category: §C.5 states FIXED leaves are excluded from cap coverage
  if (isFixedCategory(resolvedId, state) || isIncomeOrSavingCategory(resolvedId)) {
    return [];
  }
  return [resolvedId];
}

/**
 * Checks if a transaction is countable (POSTED/SETTLED, not PENDING, not duplicate, not superseded).
 */
function isCountablePostedRow(tx) {
  if (!tx) return false;
  if (tx.status === 'PENDING') return false;
  if (tx.is_duplicate || tx.is_duplicate_of) return false;
  if (tx.superseded_by) return false;
  return isActiveRow(tx);
}

function getTxClassificationStatus(tx) {
  return tx.classification_status || tx.category_status || 'CONFIRMED';
}

function isProvisionalCategoryRow(tx) {
  const st = getTxClassificationStatus(tx);
  return st === 'NEEDS_REVIEW' || st === 'PROVISIONAL' || tx.status === 'PENDING';
}

/**
 * Single-truth signed spend contribution of a transaction to its category (SC §6.2, SEN-AC-13, SEN-AC-14):
 * - Spend debit (EXPENSE, FEE, LOAN_REPAYMENT) -> +amount_minor
 * - Spend offset credit (REFUND, REVERSAL, CHARGEBACK) -> -amount_minor
 * - Transfers, card payments, cash withdrawals (ATM), income, credit interest -> 0 for category spend
 */
function getSignedCategorySpendDelta(tx) {
  if (!isCountablePostedRow(tx)) return 0;
  if (!tx.category_id || tx.category_id === 'UNCATEGORIZED') return 0;
  if (getTxClassificationStatus(tx) === 'UNCATEGORIZED') return 0;
  if (tx.movement_type === 'CASH_WITHDRAWAL') return 0; // ATM withdrawal excluded from category spend per SEN-AC-13
  const amt = Math.trunc(Number(tx.amount_minor) || 0);
  if (isSpendDebit(tx)) {
    return amt;
  }
  if (isSpendOffsetCredit(tx)) {
    return -amt;
  }
  return 0;
}

/**
 * Computes spend breakdown for a set of covered category IDs within a period or period set.
 * Also matches parent category prefix if a transaction was tagged directly with the parent ID.
 */
function computeSpendForCategories(
  transactions,
  coveredCategoryIds,
  periodFilter = null,
  maxDateInclusive = null,
  parentCategoryId = null
) {
  const catSet = new Set(coveredCategoryIds || []);
  if (catSet.size === 0) {
    return {
      spent_signed_minor: 0,
      spent_total_minor: 0,
      spent_settled_minor: 0,
      spent_provisional_minor: 0,
      settled_spend_minor: 0,
      provisional_spend_minor: 0,
      total_spend_minor: 0,
    };
  }

  const periodSet =
    typeof periodFilter === 'string'
      ? new Set([periodFilter])
      : periodFilter instanceof Set
      ? periodFilter
      : Array.isArray(periodFilter)
      ? new Set(periodFilter)
      : null;

  let signedTotal = 0;
  let settledDebits = 0;
  let settledCredits = 0;
  let provisionalDebits = 0;
  let provisionalCredits = 0;

  for (const tx of transactions || []) {
    if (!isCountablePostedRow(tx)) continue;
    const txCat = tx.category_id;
    if (!txCat || txCat === 'UNCATEGORIZED') continue;
    const matchesCovered =
      catSet.has(txCat) || (parentCategoryId && txCat === parentCategoryId);
    if (!matchesCovered) continue;

    const txDate = String(tx.txn_date).slice(0, 10);
    const txPeriod = txDate.slice(0, 7);
    if (periodSet && !periodSet.has(txPeriod)) continue;
    if (maxDateInclusive && txDate > maxDateInclusive) continue;

    const delta = getSignedCategorySpendDelta(tx);
    if (delta === 0) continue;

    signedTotal += delta;
    const prov = isProvisionalCategoryRow(tx);
    if (delta > 0) {
      if (prov) provisionalDebits += delta;
      else settledDebits += delta;
    } else {
      if (prov) provisionalCredits += -delta;
      else settledCredits += -delta;
    }
  }

  const spentTotal = Math.max(0, signedTotal);
  const settledNet = Math.max(0, settledDebits - settledCredits);
  const spentSettled = Math.min(spentTotal, settledNet);
  const spentProvisional = Math.max(0, spentTotal - spentSettled);

  return {
    spent_signed_minor: signedTotal,
    spent_total_minor: spentTotal,
    spent_settled_minor: spentSettled,
    spent_provisional_minor: spentProvisional,
    // Legacy aliases
    settled_spend_minor: spentSettled,
    provisional_spend_minor: spentProvisional,
    total_spend_minor: spentTotal,
  };
}

/**
 * Computes special non-category ledger buckets (SC §6.2, Sentinel §B.6.2, SEN-AC-13):
 * - uncategorized_minor
 * - card_payment_unmatched_minor
 * - unclassified_movement_minor
 * - unmatched_credits_minor
 */
function computeSpecialLedgerBuckets(transactions, periodSet = null) {
  let uncategorizedMinor = 0;
  let cardPaymentUnmatchedMinor = 0;
  let unclassifiedMovementMinor = 0;
  let unmatchedCreditsMinor = 0;

  for (const tx of transactions || []) {
    if (!isCountablePostedRow(tx)) continue;
    const txPeriod = String(tx.txn_date).slice(0, 7);
    if (periodSet && !periodSet.has(txPeriod)) continue;
    const amt = Math.trunc(Number(tx.amount_minor) || 0);
    const st = getTxClassificationStatus(tx);

    if (tx.direction === 'DEBIT') {
      if (
        tx.movement_type === 'EXPENSE' &&
        (!tx.category_id || tx.category_id === 'UNCATEGORIZED' || st === 'UNCATEGORIZED')
      ) {
        uncategorizedMinor += amt;
      } else if (tx.movement_type === 'CARD_PAYMENT' && !tx.paired_txn_id && !tx.linked_txn_id) {
        cardPaymentUnmatchedMinor += amt;
      } else if (tx.movement_type === 'UNKNOWN' || tx.movement_type === 'OTHER') {
        unclassifiedMovementMinor += amt;
      }
    } else if (tx.direction === 'CREDIT') {
      if (
        tx.movement_type !== 'INCOME' &&
        tx.movement_type !== 'REFUND' &&
        tx.movement_type !== 'REVERSAL' &&
        tx.movement_type !== 'CHARGEBACK' &&
        tx.movement_type !== 'TRANSFER_INTERNAL' &&
        tx.movement_type !== 'TRANSFER_EXTERNAL' &&
        tx.movement_type !== 'TRANSFER' &&
        tx.movement_type !== 'CARD_PAYMENT' &&
        tx.movement_type !== 'INTEREST'
      ) {
        unmatchedCreditsMinor += amt;
      }
    }
  }

  return {
    uncategorized_minor: uncategorizedMinor,
    card_payment_unmatched_minor: cardPaymentUnmatchedMinor,
    unclassified_movement_minor: unclassifiedMovementMinor,
    unmatched_credits_minor: unmatchedCreditsMinor,
  };
}

module.exports = {
  CATEGORIES,
  PARENT_CATEGORIES,
  CATEGORY_BY_ID,
  PARENT_TO_LEAVES,
  DEPRECATED_CATEGORY_MAP,
  getCategoryById,
  getCategoryDisplayName,
  isParentCategory,
  isFixedCategory,
  isIncomeOrSavingCategory,
  isCappableCategory,
  getEffectiveCapMap,
  getCoveredLeafIds,
  isCountablePostedRow,
  getTxClassificationStatus,
  isProvisionalCategoryRow,
  getSignedCategorySpendDelta,
  computeSpendForCategories,
  computeSpecialLedgerBuckets,
};
