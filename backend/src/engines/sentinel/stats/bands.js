/**
 * Sentinel Uncertainty Bands & Confidence Rules (Sentinel §B.5, §K.1)
 */

const { p20Minor, p80Minor, mulBpHalfEven } = require('./math');

const CONFIDENCE_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const RANK_TO_CONFIDENCE = { 1: 'LOW', 2: 'MEDIUM', 3: 'HIGH' };

function minConfidence(...levels) {
  let minRank = 3;
  for (const lvl of levels) {
    if (!lvl) continue;
    const r = CONFIDENCE_RANK[lvl] || 2;
    if (r < minRank) minRank = r;
  }
  return RANK_TO_CONFIDENCE[minRank] || 'MEDIUM';
}

/**
 * §B.5 Base confidence from DataQuality@1 + parameter registry thresholds.
 * Also collects shared data quality constraint codes.
 */
function evaluateDataQualityConfidence(dataQuality, registry, options = {}) {
  const dq = dataQuality || {
    coverage_bp: 10000,
    provisional_share_bp: 0,
    history_days: 90,
    complete: true,
    accounts_stale: false,
  };
  const confReg = (registry && registry.confidence) || {
    min_coverage_for_high_bp: 8500,
    min_coverage_for_medium_bp: 7000,
    provisional_high_ceiling_bp: 1000,
    provisional_medium_ceiling_bp: 2500,
    provisional_warning_bp: 2000,
  };

  let rank = 3; // Start HIGH
  const codes = [];

  if (dq.coverage_bp < confReg.min_coverage_for_medium_bp) {
    rank = Math.min(rank, 1); // LOW
    codes.push({
      code: 'LOW_CATEGORIZATION_COVERAGE',
      severity: 'WARNING',
      details: { coverage_bp: dq.coverage_bp },
    });
  } else if (dq.coverage_bp < confReg.min_coverage_for_high_bp) {
    rank = Math.min(rank, 2); // MEDIUM
  }

  if (dq.provisional_share_bp > confReg.provisional_medium_ceiling_bp) {
    rank = Math.min(rank, 1); // LOW
    codes.push({
      code: 'PROVISIONAL_DATA_DOMINANT',
      severity: 'WARNING',
      details: { provisional_share_bp: dq.provisional_share_bp },
    });
    codes.push({
      code: 'PROVISIONAL_DATA',
      severity: 'WARNING',
      details: { provisional_share_bp: dq.provisional_share_bp },
    });
  } else if (dq.provisional_share_bp > confReg.provisional_warning_bp) {
    rank = Math.min(rank, 2); // MEDIUM
    codes.push({
      code: 'PROVISIONAL_DATA',
      severity: 'WARNING',
      details: { provisional_share_bp: dq.provisional_share_bp },
    });
  } else if (dq.provisional_share_bp > confReg.provisional_high_ceiling_bp) {
    rank = Math.min(rank, 2); // MEDIUM
  }

  if (dq.complete === false) {
    rank = Math.min(rank, 2); // Cap at MEDIUM
    codes.push({
      code: 'IMPORT_IN_PROGRESS',
      severity: 'WARNING',
      details: {},
    });
  }

  if (options.dependsOnBalance && dq.accounts_stale) {
    rank = Math.min(rank, 2); // Cap at MEDIUM
    codes.push({
      code: 'STALE_BALANCE',
      severity: 'WARNING',
      details: {},
    });
  }

  return {
    confidence: RANK_TO_CONFIDENCE[rank],
    codes,
  };
}

/**
 * Computes empirical [p20, p80] band when >= 3 samples exist, or fallback band otherwise.
 */
function computeUncertaintyBand(samples, pointEstimateMinor, defaultBandBp = 2000) {
  if (Array.isArray(samples) && samples.length >= 3) {
    const low = Math.min(p20Minor(samples), pointEstimateMinor);
    const high = Math.max(p80Minor(samples), pointEstimateMinor);
    return {
      low_minor: Math.max(0, low),
      point_minor: pointEstimateMinor,
      high_minor: Math.max(pointEstimateMinor, high),
      method: 'EMPIRICAL_QUANTILE',
      sample_size: samples.length,
    };
  }
  const delta = mulBpHalfEven(Math.abs(pointEstimateMinor), defaultBandBp);
  return {
    low_minor: Math.max(0, pointEstimateMinor - delta),
    point_minor: pointEstimateMinor,
    high_minor: pointEstimateMinor + delta,
    method: 'DEFAULT_FACTOR_BAND',
    sample_size: Array.isArray(samples) ? samples.length : 0,
  };
}

module.exports = {
  CONFIDENCE_RANK,
  RANK_TO_CONFIDENCE,
  minConfidence,
  evaluateDataQualityConfidence,
  computeUncertaintyBand,
};
