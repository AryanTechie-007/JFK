/**
 * SentinelResult@1 Envelope Builder (Sentinel §B.2, §B.5, §C.2, SC §10.2)
 */

const crypto = require('node:crypto');
const { newId } = require('../../../shared/ids');
const { capConfidenceByDataQuality } = require('../../../shared/finance/coverage');
const { MODEL_VERSION, SENTINEL_PARAMS } = require('../params');
const { makeConstraint } = require('../rules/goal');

function computeParamsHash(params) {
  const keys = Object.keys(params || {}).sort();
  const normalized = {};
  for (const k of keys) {
    if (k === '__resolved_from_result_ref') continue;
    normalized[k] = params[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
}

/**
 * Builds a complete `SentinelResult@1` envelope with both canonical §C.2 fields
 * and backward-compatible alias fields (`function_name`, `constraints_triggered`, `value`).
 */
function buildEnvelope(
  state,
  functionName,
  data,
  intrinsicConfidence = 'HIGH',
  extraConstraints = [],
  status = 'OK',
  error = null,
  options = {}
) {
  const registry = options.registry || SENTINEL_PARAMS;
  const dq = state.data_quality || {
    coverage_bp: 10000,
    provisional_share_bp: 0,
    needs_review_count: 0,
    uncategorized_amount_minor: 0,
    complete: true,
  };
  const constraints = [...(extraConstraints || [])];

  const medFloorBp =
    (registry && registry.confidence && registry.confidence.min_coverage_for_medium_bp) ||
    SENTINEL_PARAMS.medium_coverage_floor_bp ||
    7000;
  const provCeilingBp =
    (registry && registry.confidence && registry.confidence.provisional_medium_ceiling_bp) ||
    SENTINEL_PARAMS.medium_provisional_ceiling_bp ||
    2500;
  const provWarnBp =
    (registry && registry.confidence && registry.confidence.provisional_warning_bp) ||
    2000;

  if (dq.coverage_bp < medFloorBp) {
    if (!constraints.some((c) => c.code === 'LOW_CATEGORIZATION_COVERAGE')) {
      constraints.push(
        makeConstraint('LOW_CATEGORIZATION_COVERAGE', { coverage_bp: dq.coverage_bp }, 'WARNING')
      );
    }
  }
  if (dq.provisional_share_bp > provCeilingBp) {
    if (!constraints.some((c) => c.code === 'PROVISIONAL_DATA_DOMINANT')) {
      constraints.push(
        makeConstraint(
          'PROVISIONAL_DATA_DOMINANT',
          { provisional_share_bp: dq.provisional_share_bp },
          'WARNING'
        )
      );
    }
    if (!constraints.some((c) => c.code === 'PROVISIONAL_DATA')) {
      constraints.push(
        makeConstraint(
          'PROVISIONAL_DATA',
          { provisional_share_bp: dq.provisional_share_bp },
          'WARNING'
        )
      );
    }
  } else if (dq.provisional_share_bp > provWarnBp) {
    if (!constraints.some((c) => c.code === 'PROVISIONAL_DATA')) {
      constraints.push(
        makeConstraint(
          'PROVISIONAL_DATA',
          { provisional_share_bp: dq.provisional_share_bp },
          'WARNING'
        )
      );
    }
  }
  if (dq.complete === false) {
    if (!constraints.some((c) => c.code === 'IMPORT_IN_PROGRESS')) {
      constraints.push(makeConstraint('IMPORT_IN_PROGRESS', {}, 'WARNING'));
    }
  }
  if (options.dependsOnBalance && state.balance_stale) {
    if (!constraints.some((c) => c.code === 'STALE_BALANCE')) {
      constraints.push(makeConstraint('STALE_BALANCE', {}, 'WARNING'));
    }
  }

  let finalConfidence = intrinsicConfidence;
  if (intrinsicConfidence !== null) {
    finalConfidence = capConfidenceByDataQuality(
      intrinsicConfidence,
      dq.coverage_bp,
      dq.provisional_share_bp,
      dq.complete
    );
    if (options.dependsOnBalance && state.balance_stale && finalConfidence === 'HIGH') {
      finalConfidence = 'MEDIUM';
    }
  }

  const constraintCodes = [];
  for (const c of constraints) {
    if (c && c.code && !constraintCodes.includes(c.code)) {
      constraintCodes.push(c.code);
    }
  }

  const varianceBand =
    options.variance_band !== undefined
      ? options.variance_band
      : data && data.variance_band
      ? data.variance_band
      : null;

  const modelVersion = (registry && registry.model_version) || MODEL_VERSION;
  const paramsHash = computeParamsHash(options.params || {});

  return {
    schema: 'SentinelResult@1',
    tool_result_id: newId('trs'),
    function: functionName,
    function_name: functionName,
    snapshot_id: state.snapshot.snapshot_id,
    ledger_version: state.snapshot.ledger_version,
    plan_version: state.snapshot.plan_version,
    categorization_version: state.snapshot.ledger_version,
    data_as_of: state.current_date_ist,
    model_version: modelVersion,
    params_hash: paramsHash,
    computed_at: new Date().toISOString(),
    status,
    confidence: finalConfidence,
    variance_band: varianceBand,
    data_quality: {
      schema: 'DataQuality@1',
      coverage_bp: dq.coverage_bp,
      provisional_share_bp: dq.provisional_share_bp,
      needs_review_count: dq.needs_review_count || 0,
      uncategorized_amount_minor: dq.uncategorized_amount_minor || 0,
      complete: dq.complete !== false,
    },
    constraint_codes: constraintCodes,
    constraints_triggered: constraints,
    data: status === 'OK' ? data : null,
    value: status === 'OK' ? data : null,
    error,
  };
}

module.exports = {
  computeParamsHash,
  buildEnvelope,
};
