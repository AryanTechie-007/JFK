const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTempDb } = require('../helpers/temp-db');
const { callSentinel, SENTINEL_FUNCTIONS, MODEL_VERSION } = require('../../src/engines/sentinel');
const { createSnapshot } = require('../../src/platform/snapshot');

describe('SEN-AC-01: SentinelResult@1 Envelope Conformance Across All 17 Functions', () => {
  let cleanup;

  before(() => {
    const res = setupTempDb();
    cleanup = res.cleanup;
  });

  after(() => {
    if (cleanup) cleanup();
  });

  const allFunctions = [
    { name: 'sentinel_get_surplus_baseline', args: {} },
    { name: 'sentinel_get_ledger_summary', args: {} },
    { name: 'sentinel_get_spending_timeseries', args: {} },
    { name: 'sentinel_run_spending_simulation', args: { delta_minor: 10000 } },
    { name: 'sentinel_run_category_utilization', args: { category_id: 'FOOD' } },
    { name: 'sentinel_run_velocity_projection', args: { category_id: 'FOOD' } },
    { name: 'sentinel_detect_anomalies', args: {} },
    { name: 'sentinel_run_rebalance_simulation', args: { donor_category_id: 'ENTERTAINMENT', recipient_category_id: 'FOOD', amount_minor: 5000 } },
    { name: 'sentinel_validate_cap_change', args: { category_id: 'FOOD', proposed_cap_minor: 100000 } },
    { name: 'sentinel_run_goal_progress', args: {} },
    { name: 'sentinel_run_goal_feasibility', args: { monthly_add_minor: 20000 } },
    { name: 'sentinel_validate_goal_change', args: { goal_id: 'g_1', proposed_monthly_add_minor: 20000 } },
    { name: 'sentinel_forecast_bill_outlays', args: { horizon_days: 14 } },
    { name: 'sentinel_flag_cashflow_risk', args: {} },
    { name: 'sentinel_check_available_balance', args: { amount_minor: 10000 } },
    { name: 'sentinel_compute_health_score', args: {} },
    { name: 'sentinel_project_sip', args: { monthly_amount_minor: 100000, annual_rate_bp: 1200, months: 12 } },
  ];

  test('exactly 17 functions are defined in SENTINEL_FUNCTIONS', () => {
    assert.equal(Object.keys(SENTINEL_FUNCTIONS).length, 17);
    assert.equal(allFunctions.length, 17);
  });

  for (const { name, args } of allFunctions) {
    test(`${name} returns a valid SentinelResult@1 envelope`, () => {
      const userId = 'u_env_test';
      const snap = createSnapshot(userId);
      const res = callSentinel(name, userId, snap, args);

      assert.ok(res, `${name} must return a result object`);
      assert.equal(res.schema, 'SentinelResult@1');
      assert.ok(typeof res.tool_result_id === 'string' && res.tool_result_id.length > 0, 'tool_result_id must be non-empty string');
      assert.equal(res.function, name, 'function field must match called function name');
      assert.equal(res.snapshot_id, snap.snapshot_id, 'snapshot_id must match snapshot');
      assert.equal(res.model_version, MODEL_VERSION, 'model_version must match Sentinel model version');
      assert.ok(typeof res.categorization_version === 'number', 'categorization_version must be a number');
      assert.ok(typeof res.params_hash === 'string' && res.params_hash.length > 0, 'params_hash must be non-empty');
      assert.ok(['OK', 'PARTIAL', 'INSUFFICIENT_DATA', 'ERROR'].includes(res.status), `valid status: ${res.status}`);
      assert.ok(res.data_quality && typeof res.data_quality === 'object', 'data_quality object must be present');
      assert.ok(Array.isArray(res.warnings), 'warnings must be an array');
      assert.ok(typeof res.computed_at === 'string', 'computed_at must be an ISO date string');
      assert.ok(res.data !== undefined, 'data must be present');
    });
  }
});
