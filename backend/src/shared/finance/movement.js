/**
 * Movement Types, Spend Definition, and Ledger Helpers (SC §6.1–§6.3)
 */

const MOVEMENT_TYPES = Object.freeze({
  EXPENSE: 'EXPENSE',
  INCOME: 'INCOME',
  TRANSFER_INTERNAL: 'TRANSFER_INTERNAL',
  TRANSFER_EXTERNAL: 'TRANSFER_EXTERNAL',
  CARD_PAYMENT: 'CARD_PAYMENT',
  REFUND: 'REFUND',
  REVERSAL: 'REVERSAL',
  CHARGEBACK: 'CHARGEBACK',
  CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
  FEE: 'FEE',
  INTEREST: 'INTEREST',
  LOAN_REPAYMENT: 'LOAN_REPAYMENT',
  UNKNOWN: 'UNKNOWN',
});

const DIRECTIONS = Object.freeze({
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
});

const CLASSIFICATION_STATUSES = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  AUTO: 'AUTO',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  UNCATEGORIZED: 'UNCATEGORIZED',
});

const CONFIDENCE_LEVELS = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const SPEND_DEBIT_TYPES = new Set([
  MOVEMENT_TYPES.EXPENSE,
  MOVEMENT_TYPES.CASH_WITHDRAWAL,
  MOVEMENT_TYPES.FEE,
  MOVEMENT_TYPES.LOAN_REPAYMENT,
]);

const SPEND_OFFSET_CREDIT_TYPES = new Set([
  MOVEMENT_TYPES.REFUND,
  MOVEMENT_TYPES.REVERSAL,
  MOVEMENT_TYPES.CHARGEBACK,
]);

const CATEGORY_BEARING_TYPES = new Set([
  MOVEMENT_TYPES.EXPENSE,
  MOVEMENT_TYPES.CASH_WITHDRAWAL,
  MOVEMENT_TYPES.FEE,
  MOVEMENT_TYPES.LOAN_REPAYMENT,
  MOVEMENT_TYPES.INCOME,
  MOVEMENT_TYPES.REFUND,
  MOVEMENT_TYPES.REVERSAL,
  MOVEMENT_TYPES.CHARGEBACK,
  MOVEMENT_TYPES.INTEREST,
]);

function isActiveRow(txn) {
  if (!txn) return false;
  if (txn.superseded_by) return false;
  if (txn.is_duplicate_of) return false;
  return true;
}

function isSettledStatus(status) {
  return (
    status === CLASSIFICATION_STATUSES.CONFIRMED ||
    status === CLASSIFICATION_STATUSES.AUTO
  );
}

function isProvisionalStatus(status) {
  return status === CLASSIFICATION_STATUSES.NEEDS_REVIEW;
}

function isSpendDebit(txn) {
  return (
    isActiveRow(txn) &&
    txn.direction === DIRECTIONS.DEBIT &&
    SPEND_DEBIT_TYPES.has(txn.movement_type)
  );
}

function isSpendOffsetCredit(txn) {
  return (
    isActiveRow(txn) &&
    txn.direction === DIRECTIONS.CREDIT &&
    SPEND_OFFSET_CREDIT_TYPES.has(txn.movement_type)
  );
}

/**
 * SC §6.2 Definition of Spend for a category in a period:
 * Spend(c, P) = max(0, sum(debits in c, P) - sum(offset credits in c, P))
 */
function computeCategorySpend(transactions, categoryId = null) {
  let settledDebits = 0;
  let settledCredits = 0;
  let provisionalDebits = 0;
  let provisionalCredits = 0;

  for (const t of transactions) {
    if (!isActiveRow(t)) continue;
    if (categoryId !== null) {
      const matchesLeafOrParent =
        t.category_id === categoryId ||
        (typeof t.category_id === 'string' && t.category_id.startsWith(`${categoryId}.`));
      if (!matchesLeafOrParent) continue;
    } else {
      // Total spend across all spend categories (including UNCATEGORIZED debits)
      if (!isSpendDebit(t) && !isSpendOffsetCredit(t)) continue;
    }

    const amt = Number(t.amount_minor) || 0;
    const settled = isSettledStatus(t.classification_status);
    const provisional = isProvisionalStatus(t.classification_status);

    if (isSpendDebit(t)) {
      if (settled) settledDebits += amt;
      else if (provisional || categoryId === null) provisionalDebits += amt;
    } else if (isSpendOffsetCredit(t)) {
      if (settled) settledCredits += amt;
      else if (provisional || categoryId === null) provisionalCredits += amt;
    }
  }

  const settledSpendMinor = Math.max(0, settledDebits - settledCredits);
  const provisionalSpendMinor = Math.max(0, provisionalDebits - provisionalCredits);
  const totalSpendMinor = Math.max(
    0,
    settledDebits + provisionalDebits - (settledCredits + provisionalCredits)
  );

  return {
    settled_spend_minor: settledSpendMinor,
    provisional_spend_minor: provisionalSpendMinor,
    total_spend_minor: totalSpendMinor,
  };
}

module.exports = {
  MOVEMENT_TYPES,
  DIRECTIONS,
  CLASSIFICATION_STATUSES,
  CONFIDENCE_LEVELS,
  SPEND_DEBIT_TYPES,
  SPEND_OFFSET_CREDIT_TYPES,
  CATEGORY_BEARING_TYPES,
  isActiveRow,
  isSettledStatus,
  isProvisionalStatus,
  isSpendDebit,
  isSpendOffsetCredit,
  computeCategorySpend,
};
