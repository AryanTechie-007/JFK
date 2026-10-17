const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTempDb } = require('../helpers/temp-db');
const { callSentinel, SENTINEL_FUNCTIONS } = require('../../src/engines/sentinel');
const { createSnapshot } = require('../../src/platform/snapshot');

describe('SEN-AC-02: Sentinel Determinism Replay', () => {
  let cleanup;

  before(() => {
    const res = setupTempDb();
    cleanup = res.cleanup;
  });

  after(() => {
    if (cleanup) cleanup();
  });

  test('every Sentinel function produces deep-equal data across repeated runs on the same snapshot', () => {
    const userId = 'u_det_test';
    const snapshot = createSnapshot(userId);

    const testableFunctions = [
      { name: 'sentinel_get_surplus_baseline', args: {} },
      { name: 'sentinel_get_ledger_summary', args: {} },
      { name: 'sentinel_get_spending_timeseries', args: { lookback_months: 3 } },
      { name: 'sentinel_run_spending_simulation', args: { delta_minor: 50000 } },
      { name: 'sentinel_run_category_utilization', args: { category_id: 'FOOD' } },
      { name: 'sentinel_run_velocity_projection', args: { category_id: 'FOOD' } },
      { name: 'sentinel_detect_anomalies', args: {} },
      { name: 'sentinel_run_rebalance_simulation', args: { donor_category_id: 'ENTERTAINMENT', recipient_category_id: 'FOOD', amount_minor: 10000 } },
      { name: 'sentinel_validate_cap_change', args: { category_id: 'FOOD', proposed_cap_minor: 1500000 } },
      { name: 'sentinel_run_goal_progress', args: {} },
      { name: 'sentinel_run_goal_feasibility', args: { monthly_add_minor: 50000 } },
      { name: 'sentinel_validate_goal_change', args: { goal_id: 'g_1', proposed_monthly_add_minor: 50000 } },
      { name: 'sentinel_forecast_bill_outlays', args: { horizon_days: 30 } },
      { name: 'sentinel_flag_cashflow_risk', args: {} },
      { name: 'sentinel_check_available_balance', args: { amount_minor: 25000 } },
      { name: 'sentinel_compute_health_score', args: {} },
      { name: 'sentinel_project_sip', args: { monthly_amount_minor: 500000, annual_rate_bp: 1200, months: 12 } },
    ];

    for (const { name, args } of testableFunctions) {
      const run1 = callSentinel(name, userId, snapshot, args);
      const run2 = callSentinel(name, userId, snapshot, args);

      assert.equal(run1.status, run2.status, `${name} status must be deterministic`);
      assert.deepEqual(run1.data, run2.data, `${name} data must be deep-equal across runs`);
      assert.equal(run1.confidence, run2.confidence, `${name} confidence must be identical`);
    }
  });
});
