/**
 * Sentinel Parameter Registry Loader (Sentinel §C.4, §K.1)
 * Loads immutable parameter sets by model_version (semver) and supports historical replay.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MODEL_VERSION = '5.0.0';
const registryCache = new Map();

function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === 'object' && !Object.isFrozen(obj[key])) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

function flattenRegistry(reg) {
  return deepFreeze({
    ...reg,
    model_version: reg.model_version,
    // Flat aliases for backward compatibility and §C.4 dot-key access
    'tier.warning_bp': reg.tier.warning_bp,
    'tier.exceeded_bp': reg.tier.exceeded_bp,
    'velocity.under_bp': reg.velocity.under_bp,
    'velocity.buffer_bp': reg.velocity.buffer_bp,
    'income.cv_high': reg.income.cv_high,
    'income.cv_medium': reg.income.cv_medium,
    'income.uncertain_credit_bp': reg.income.uncertain_credit_bp,
    'confidence.min_coverage_for_high_bp': reg.confidence.min_coverage_for_high_bp,
    'confidence.min_coverage_for_medium_bp': reg.confidence.min_coverage_for_medium_bp,
    'balance.stale_after_hours': reg.balance.stale_after_hours,
    'simulation.baseline_months': reg.simulation.baseline_months,
    'simulation.band_months': reg.simulation.band_months,
    'anomaly.dup_window_days': reg.anomaly.dup_window_days,
    'anomaly.spike_k': reg.anomaly.spike_k,
    'anomaly.creep_bp': reg.anomaly.creep_bp,
    'bills.cadence_tolerance_days': reg.bills.cadence_tolerance_days,
    'bills.merge_window_days': reg.bills.merge_window_days,
    'bills.merge_amount_bp': reg.bills.merge_amount_bp,
    'cashflow.high_bp': reg.cashflow.high_bp,
    'cashflow.medium_bp': reg.cashflow.medium_bp,
    'goal.trailing_months': reg.goal.trailing_months,
    'goal.max_active': reg.goal.max_active,
    'ledger.top_merchants': reg.ledger.top_merchants,
    'health.savings_benchmark_bp': reg.health.savings_benchmark_bp,
    'health.no_caps_discipline_score': reg.health.no_caps_discipline_score,
    'health.control_span_bp': reg.health.control_span_bp,
    'health.points_per_funded_goal': reg.health.points_per_funded_goal,
    'sip.max_rate_bp': reg.sip.max_rate_bp,

    // Legacy flat keys used by existing modules
    high_coverage_floor_bp: reg.confidence.min_coverage_for_high_bp,
    medium_coverage_floor_bp: reg.confidence.min_coverage_for_medium_bp,
    high_provisional_ceiling_bp: reg.confidence.provisional_high_ceiling_bp,
    medium_provisional_ceiling_bp: reg.confidence.provisional_medium_ceiling_bp,
    watch_tier_bp: reg.tier.warning_bp,
    warning_tier_bp: reg.tier.warning_bp,
    breach_tier_bp: reg.tier.exceeded_bp,
    severe_tier_bp: reg.tier.severe_bp,
    min_cap_floor_minor: reg.tier.min_cap_minor,
    buffer_floor_income_bp: reg.balance.buffer_floor_income_bp,
    buffer_floor_min_minor: reg.balance.buffer_floor_min_minor,
    donor_max_utilization_bp: reg.rebalance.donor_max_utilization_bp,
    donor_max_share_bp: reg.rebalance.donor_max_share_bp,
    min_donor_transfer_minor: reg.rebalance.min_donor_cut_minor,
    max_donors: reg.rebalance.max_donors,
    spike_mad_multiplier_bp: reg.anomaly.spike_k_bp,
    spike_min_excess_minor: reg.anomaly.spike_min_minor,
    min_baseline_txns: reg.anomaly.min_baseline_txns,
    min_history_months: 1,
    high_confidence_history_months: reg.simulation.baseline_months,
    default_band_factor_bp: reg.simulation.default_band_factor_bp,
    savings_target_bp: reg.health.savings_benchmark_bp,
    outflow_healthy_bp: reg.health.outflow_healthy_bp,
    Max_goal_years: reg.goal.max_years,
  });
}

function getRegistry(modelVersion = DEFAULT_MODEL_VERSION) {
  const ver = modelVersion || DEFAULT_MODEL_VERSION;
  if (registryCache.has(ver)) {
    return registryCache.get(ver);
  }
  const filePath = path.join(__dirname, `${ver}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Unknown Sentinel model_version: ${ver}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const frozen = flattenRegistry(raw);
  registryCache.set(ver, frozen);
  return frozen;
}

function listAvailableModelVersions() {
  return fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

module.exports = {
  DEFAULT_MODEL_VERSION,
  getRegistry,
  listAvailableModelVersions,
};
