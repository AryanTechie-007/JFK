/**
 * Sentinel v5.0 Parameter Registry & Model Version (Sentinel §B.3, §C.4, SEN-AC-09)
 */

const crypto = require('node:crypto');

const MAJOR_MINOR = '5.0';

const RAW_PARAMS = {
  // Data Quality & Coverage thresholds (bp)
  high_coverage_floor_bp: 8500,
  medium_coverage_floor_bp: 7000,
  high_provisional_ceiling_bp: 1000,
  medium_provisional_ceiling_bp: 2500,

  // Cap tiers (bp) & floors (minor paise)
  watch_tier_bp: 8500,
  breach_tier_bp: 10000,
  severe_tier_bp: 11000,
  min_cap_floor_minor: 10000, // ₹100.00

  // Safety buffer floor
  buffer_floor_income_bp: 500, // 5% of monthly income
  buffer_floor_min_minor: 200000, // ₹2,000.00

  // Rebalance rules
  donor_max_utilization_bp: 7000, // 70%
  donor_max_share_bp: 5000, // max 50% of donor's remaining headroom
  min_donor_transfer_minor: 5000, // ₹50.00
  max_donors: 3,

  // Anomaly detection
  spike_mad_multiplier_bp: 30000, // 3.0x MAD
  spike_min_excess_minor: 100000, // ₹1,000.00
  burst_window_days: 7,
  burst_multiplier_bp: 20000, // 2.0x weekly average
  min_baseline_txns: 5,

  // Simulation & Empirical bands
  min_history_months: 1,
  high_confidence_history_months: 3,
  default_band_factor_bp: 2000, // ±20% when empirical sample < 3 months

  // Health Score weights
  savings_target_bp: 2000, // 20% savings rate -> 25/25
  outflow_healthy_bp: 6000, // <=60% outflow -> 25/25
  Max_goal_years: 30,
};

function computeParamsHash(paramsObj) {
  const keys = Object.keys(paramsObj)
    .filter((k) => k !== 'model_version' && k !== 'params_hash')
    .sort();
  const canonical = JSON.stringify(keys.map((k) => [k, paramsObj[k]]));
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 8);
}

const paramsHash = computeParamsHash(RAW_PARAMS);
const MODEL_VERSION = `${MAJOR_MINOR}+${paramsHash}`;

const SENTINEL_PARAMS = Object.freeze({
  ...RAW_PARAMS,
  model_version: MODEL_VERSION,
  params_hash: paramsHash,
});

module.exports = {
  MODEL_VERSION,
  SENTINEL_PARAMS,
  computeParamsHash,
};
