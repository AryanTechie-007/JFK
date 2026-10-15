/**
 * Data Quality & Categorization Coverage (SC §8.1–§8.3)
 */

const { halfEvenRoundBigInt } = require('../money');
const {
  CLASSIFICATION_STATUSES,
  isActiveRow,
  isSpendDebit,
  isSettledStatus,
} = require('./movement');

/**
 * SC §8.2 Coverage formula:
 * coverage_bp = round_half_even(10000 * sum(amount_minor of settled) / sum(amount_minor of all spend debits))
 * If denominator is 0, coverage_bp = 10000.
 */
function computeWindowCoverage(transactions) {
  let totalAmountMinor = 0;
  let settledAmountMinor = 0;
  let provisionalAmountMinor = 0;
  let uncategorizedAmountMinor = 0;
  let needsReviewCount = 0;
  let uncategorizedCount = 0;

  for (const t of transactions) {
    if (!isActiveRow(t)) continue;
    const amt = Number(t.amount_minor) || 0;

    if (t.classification_status === CLASSIFICATION_STATUSES.NEEDS_REVIEW) {
      needsReviewCount++;
    } else if (t.classification_status === CLASSIFICATION_STATUSES.UNCATEGORIZED) {
      uncategorizedCount++;
    }

    // Coverage applies over spend debits (or all category-bearing debits)
    if (isSpendDebit(t) || t.direction === 'DEBIT') {
      if (
        t.movement_type === 'TRANSFER_INTERNAL' ||
        t.movement_type === 'CARD_PAYMENT'
      ) {
        continue;
      }
      totalAmountMinor += amt;
      if (isSettledStatus(t.classification_status) && t.category_id) {
        settledAmountMinor += amt;
      } else if (t.classification_status === CLASSIFICATION_STATUSES.NEEDS_REVIEW) {
        provisionalAmountMinor += amt;
      } else {
        uncategorizedAmountMinor += amt;
      }
    }
  }

  const coverageBp =
    totalAmountMinor === 0
      ? 10000
      : halfEvenRoundBigInt(BigInt(settledAmountMinor) * 10000n, BigInt(totalAmountMinor));

  const provisionalShareBp =
    totalAmountMinor === 0
      ? 0
      : halfEvenRoundBigInt(BigInt(provisionalAmountMinor) * 10000n, BigInt(totalAmountMinor));

  return {
    coverage_bp: coverageBp,
    provisional_share_bp: provisionalShareBp,
    total_amount_minor: totalAmountMinor,
    settled_amount_minor: settledAmountMinor,
    provisional_amount_minor: provisionalAmountMinor,
    uncategorized_amount_minor: uncategorizedAmountMinor,
    needs_review_count: needsReviewCount,
    uncategorized_count: uncategorizedCount,
  };
}

const CONFIDENCE_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const RANK_TO_CONFIDENCE = { 1: 'LOW', 2: 'MEDIUM', 3: 'HIGH' };

function minConfidence(a, b) {
  const ra = CONFIDENCE_RANK[a] || 1;
  const rb = CONFIDENCE_RANK[b] || 1;
  return RANK_TO_CONFIDENCE[Math.min(ra, rb)];
}

/**
 * SC §8.3 How data quality caps Sentinel confidence:
 * - coverage_bp >= 8500 and provisional_share_bp <= 1000 -> HIGH
 * - 7000 <= coverage_bp < 8500 or 1000 < provisional_share_bp <= 2500 -> MEDIUM
 * - coverage_bp < 7000 or provisional_share_bp > 2500 -> LOW
 * - complete = false -> max MEDIUM
 */
function capConfidenceByDataQuality(intrinsicConfidence, coverageBp, provisionalShareBp = 0, complete = true) {
  let maxAllowed = 'HIGH';
  if (coverageBp < 7000 || provisionalShareBp > 2500) {
    maxAllowed = 'LOW';
  } else if (coverageBp < 8500 || provisionalShareBp > 1000) {
    maxAllowed = 'MEDIUM';
  }
  if (!complete) {
    maxAllowed = minConfidence(maxAllowed, 'MEDIUM');
  }
  return minConfidence(intrinsicConfidence || 'HIGH', maxAllowed);
}

module.exports = {
  computeWindowCoverage,
  minConfidence,
  capConfidenceByDataQuality,
};
