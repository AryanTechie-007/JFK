/**
 * Sentinel v5.0 — Deterministic Financial Observer, Predictor, and Rule Library (Sentinel §A–§K)
 * Pure function of `(snapshot, params, registry[model_version])`.
 * Zero LLM calls (SEN-AC-04); read-only `sentinel_ro` DB access (SEN-AC-05).
 */

const { newId } = require('../../shared/ids');
const { isToolAllowedForCaller } = require('../../shared/contracts/validator');
const {
  MODEL_VERSION,
  SENTINEL_PARAMS,
  getRegistry,
  listAvailableModelVersions,
} = require('./params');
const {
  createSentinelReadOnlyDb,
  loadSnapshotState,
  getPreviousMonths,
  addMonthsToYearMonth,
  getMonthDays,
} = require('./inputs/load');
const ledger = require('./ledger/spend');
const stats = require('./stats');
const rules = require('./rules');
const schemas = require('./schemas');
const { computeParamsHash, buildEnvelope } = require('./functions/envelope');

const { sentinel_get_surplus_baseline } = require('./functions/surplus');
const { sentinel_get_ledger_summary } = require('./functions/ledger_summary');
const { sentinel_get_spending_timeseries } = require('./functions/timeseries');
const { sentinel_run_spending_simulation } = require('./functions/simulation');
const { sentinel_run_category_utilization } = require('./functions/utilization');
const { sentinel_run_velocity_projection } = require('./functions/velocity');
const { sentinel_detect_anomalies } = require('./functions/anomalies');
const {
  sentinel_run_rebalance_simulation,
  sentinel_validate_cap_change,
} = require('./functions/rebalance');
const { sentinel_run_goal_progress } = require('./functions/goal_progress');
const {
  sentinel_run_goal_feasibility,
  sentinel_validate_goal_change,
} = require('./functions/goal_feasibility');
const { sentinel_forecast_bill_outlays } = require('./functions/bills');
const {
  sentinel_flag_cashflow_risk,
  sentinel_check_available_balance,
} = require('./functions/cashflow');
const {
  calculateHealthScoreComponents,
  sentinel_compute_health_score,
} = require('./functions/health_score');
const {
  sentinel_project_sip,
  sentinel_validate_profile,
} = require('./functions/sip');

const SENTINEL_FUNCTIONS = Object.freeze({
  sentinel_get_surplus_baseline,
  sentinel_get_ledger_summary,
  sentinel_get_spending_timeseries,
  sentinel_run_spending_simulation,
  sentinel_run_category_utilization,
  sentinel_run_velocity_projection,
  sentinel_detect_anomalies,
  sentinel_run_rebalance_simulation,
  sentinel_validate_cap_change,
  sentinel_run_goal_progress,
  sentinel_run_goal_feasibility,
  sentinel_validate_goal_change,
  sentinel_forecast_bill_outlays,
  sentinel_flag_cashflow_risk,
  sentinel_check_available_balance,
  sentinel_compute_health_score,
  sentinel_project_sip,
});

function buildErrorEnvelope(functionName, snapshotId, code, message, modelVersion = MODEL_VERSION, params = {}) {
  return {
    schema: 'SentinelResult@1',
    tool_result_id: newId('trs'),
    function: functionName,
    function_name: functionName,
    snapshot_id: snapshotId || null,
    model_version: modelVersion,
    params_hash: computeParamsHash(params),
    computed_at: new Date().toISOString(),
    status: code === 'SNAPSHOT_NOT_FOUND' || code === 'INSUFFICIENT_HISTORY' ? code : 'ERROR',
    confidence: null,
    variance_band: null,
    data_quality: null,
    constraint_codes: [],
    constraints_triggered: [],
    data: null,
    value: null,
    error: { code, message },
  };
}

/**
 * Canonical Sentinel v5.0 execution entry point (`sentinel.run(functionName, params, ctx)` — §B.2, §E).
 */
function run(functionName, params = {}, ctx = {}) {
  const snapshotId =
    ctx.snapshot_id || ctx.snapshotId || (ctx.snapshot && ctx.snapshot.snapshot_id) || null;
  const modelVersion = ctx.model_version || MODEL_VERSION;

  // 1. Check abort signal / deadline (§E)
  if ((ctx.signal && ctx.signal.aborted) || (ctx.deadline && Date.now() > ctx.deadline)) {
    return buildErrorEnvelope(
      functionName,
      snapshotId,
      'TIMEOUT',
      'Sentinel execution aborted due to deadline timeout.',
      modelVersion,
      params
    );
  }

  // 2. Defence-in-depth caller × function allowlist (§E)
  if (ctx.caller && !isToolAllowedForCaller(ctx.caller, functionName)) {
    return buildErrorEnvelope(
      functionName,
      snapshotId,
      'FORBIDDEN',
      `Caller ${ctx.caller} is not permitted to invoke ${functionName}.`,
      modelVersion,
      params
    );
  }

  // 3. Validate input parameters & reject identity/literal fact params (§B.2, §C.3, §F, SEN-AC-03)
  const validation = schemas.validateInputParams(functionName, params, {
    allowResolvedFactRef: Boolean(ctx.allowResolvedFactRef),
  });
  if (!validation.valid) {
    return buildErrorEnvelope(
      functionName,
      snapshotId,
      validation.error_code || 'INVALID_INPUT',
      validation.message,
      modelVersion,
      params
    );
  }

  // 4. Load parameter registry for requested model_version (§C.4, SEN-AC-09)
  let registry;
  try {
    registry = getRegistry(modelVersion);
  } catch (err) {
    return buildErrorEnvelope(
      functionName,
      snapshotId,
      'INVALID_INPUT',
      err.message,
      modelVersion,
      params
    );
  }

  // 5. Load snapshot & enforce user scope + 24h staleness (§B.2 step 3, SEN-AC-10)
  let state;
  try {
    state =
      ctx.state && ctx.state.snapshot
        ? ctx.state
        : loadSnapshotState(ctx.snapshot || snapshotId, ctx.user_id || ctx.userId, {
            strictSnapshot: Boolean(snapshotId && ctx.strictSnapshot !== false),
            expectedUserId: ctx.user_id || ctx.userId || null,
            enforceFreshSnapshot: Boolean(ctx.enforceFreshSnapshot),
            nowMs: ctx.nowMs,
          });
  } catch (err) {
    return buildErrorEnvelope(
      functionName,
      snapshotId,
      err.code || 'SNAPSHOT_NOT_FOUND',
      err.message,
      modelVersion,
      params
    );
  }

  // 6. Force override_protected = false for specialist/John callers (SC §13.4, Sentinel §B.6.9)
  const effectiveParams = { ...(params || {}) };
  if (
    functionName === 'sentinel_validate_cap_change' &&
    ctx.caller &&
    ['ATLAS', 'NOVA', 'IRIS', 'JOHN'].includes(ctx.caller)
  ) {
    effectiveParams.override_protected = false;
  }

  // Extract resolved fact payload if gateway wrapped it
  if (
    functionName === 'sentinel_flag_cashflow_risk' &&
    effectiveParams.outlays &&
    effectiveParams.outlays.__resolved_from_result_ref
  ) {
    effectiveParams.outlays = effectiveParams.outlays.value;
  }

  const fn = SENTINEL_FUNCTIONS[functionName];
  return fn(state, effectiveParams, registry);
}

/**
 * Legacy helper signature `callSentinel(fnName, userId, snapshot, args)`.
 */
function callSentinel(fnName, userId, snapshot, args = {}) {
  const fn = SENTINEL_FUNCTIONS[fnName];
  if (!fn) throw new Error(`Unknown Sentinel function: ${fnName}`);
  const snapId = typeof snapshot === 'object' ? snapshot?.snapshot_id : snapshot;
  const state = loadSnapshotState(snapId, userId);
  return fn(state, args, SENTINEL_PARAMS);
}

module.exports = {
  MODEL_VERSION,
  SENTINEL_PARAMS,
  getRegistry,
  listAvailableModelVersions,
  createSentinelReadOnlyDb,
  loadSnapshotState,
  getPreviousMonths,
  addMonthsToYearMonth,
  getMonthDays,
  buildEnvelope,
  calculateHealthScoreComponents,
  run,
  callSentinel,
  SENTINEL_FUNCTIONS,
  ...SENTINEL_FUNCTIONS,
  rules,
  schemas,
  stats,
  ledger,
};
