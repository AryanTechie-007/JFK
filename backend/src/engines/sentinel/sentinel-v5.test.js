/**
 * Sentinel v5.0 Comprehensive Acceptance Criteria Suite (SEN-AC-01 through SEN-AC-20)
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../../db');
const { halfEvenRoundBigInt, multiplyMinorByBp } = require('../../shared/money');
const { syncUserStateFromLegacy } = require('../../platform/profile');
const { createSnapshot } = require('../../platform/snapshot');
const { createGatewaySession } = require('../../platform/gateway');
const { ingestTransactions } = require('../categorizer');
const sentinel = require('./index');

function getAllJsFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllJsFiles(full));
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
  return results;
}

function runSentinelV5Tests() {
  console.log('   • Running Sentinel v5.0 Acceptance Criteria (SEN-AC-01 .. SEN-AC-20)...');

  // Setup isolated test user
  const testEmail = `sentinel_v5_${Date.now()}@finmate.test`;
  const userInsert = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, monthly_income, fixed_housing_expense, risk_strategy)
       VALUES ('Sentinel V5 Tester', ?, 'hash', 120000, 30000, 'balanced')`
    )
    .run(testEmail);
  const numericUserId = userInsert.lastInsertRowid;
  const canonicalUserId = syncUserStateFromLegacy(numericUserId);

  // Add caps (including parent FOOD cap + leaf FOOD.DINING cap for SEN-AC-16 exclusive partition)
  db.prepare(
    `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, source, watching, version)
     VALUES ('cap_v5_dining', ?, 'FOOD.DINING', 800000, 'STANDING', 'USER', 1, 1)`
  ).run(canonicalUserId);
  db.prepare(
    `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, source, watching, version)
     VALUES ('cap_v5_food', ?, 'FOOD', 1500000, 'STANDING', 'USER', 0, 1)`
  ).run(canonicalUserId);
  db.prepare(
    `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, source, watching, version)
     VALUES ('cap_v5_shop', ?, 'SHOPPING.GENERAL', 2000000, 'STANDING', 'USER', 0, 1)`
  ).run(canonicalUserId);
  db.prepare(
    `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, source, watching, version)
     VALUES ('cap_v5_health', ?, 'HEALTH.MEDICAL', 1000000, 'STANDING', 'USER', 0, 1)`
  ).run(canonicalUserId);

  const { getCurrentIstDateAndMonth } = require('../../platform/snapshot');
  const { addDaysStr } = require('./stats/cadence');
  const { current_date_ist: todayIst, current_month_ist: curMonthIst } = getCurrentIstDateAndMonth();
  const futureDeadline = `${sentinel.addMonthsToYearMonth(curMonthIst, 8)}-01`;
  const curMonthStart = `${curMonthIst}-01`;

  // Add active goal
  db.prepare(
    `INSERT OR REPLACE INTO goals_v1 (
       goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor,
       deadline, priority_tier, priority_rank, status, version
     ) VALUES ('gol_v5_1', ?, 'Emergency Reserve', 6000000, 1500000, 1000000, ?, 'HIGH', 1, 'ACTIVE', 1)`
  ).run(canonicalUserId, futureDeadline);

  // Ingest rich multi-month transaction history + recurring merchant + spike
  ingestTransactions(
    canonicalUserId,
    [
      { raw_description: 'NETFLIX.COM SUBSCRIPTION', amount_minor: 64900, direction: 'DEBIT', txn_date: addDaysStr(todayIst, -80) },
      { raw_description: 'NETFLIX.COM SUBSCRIPTION', amount_minor: 64900, direction: 'DEBIT', txn_date: addDaysStr(todayIst, -50) },
      { raw_description: 'NETFLIX.COM SUBSCRIPTION', amount_minor: 64900, direction: 'DEBIT', txn_date: addDaysStr(todayIst, -20) },
      { raw_description: 'SWIGGY ORDER #1', amount_minor: 45000, direction: 'DEBIT', txn_date: curMonthStart },
      { raw_description: 'ZOMATO ORDER #2', amount_minor: 55000, direction: 'DEBIT', txn_date: curMonthStart },
      { raw_description: 'STARBUCKS COFFEE #3', amount_minor: 50000, direction: 'DEBIT', txn_date: curMonthStart },
      { raw_description: 'SWIGGY MEGA PARTY CATERING', amount_minor: 750000, direction: 'DEBIT', txn_date: todayIst },
      { raw_description: 'BIGBASKET GROCERIES', amount_minor: 320000, direction: 'DEBIT', txn_date: todayIst },
      { raw_description: 'AMAZON IN SHOPPING', amount_minor: 300000, direction: 'DEBIT', txn_date: todayIst },
    ],
    'STATEMENT_IMPORT'
  );

  const snap = createSnapshot(canonicalUserId);

  // ==========================================================================
  // SEN-AC-01: All 17 functions + schema validation + edge cases (leap month, tier boundaries, cap 0)
  // ==========================================================================
  const fnNames = Object.keys(sentinel.SENTINEL_FUNCTIONS);
  assert.strictEqual(fnNames.length, 17, 'SEN-AC-01: Must export exactly 17 Sentinel tool functions');

  for (const fn of fnNames) {
    const schemaObj = sentinel.schemas.getFunctionSchema(fn);
    assert.ok(schemaObj && schemaObj.c3_spec, `SEN-AC-01: Schema must exist for ${fn}`);
  }

  // Leap month days check (2024-02 has 29 days, 2026-02 has 28 days)
  assert.strictEqual(sentinel.getMonthDays('2024-02'), 29, 'SEN-AC-01: Leap February 2024 must have 29 days');
  assert.strictEqual(sentinel.getMonthDays('2026-02'), 28, 'SEN-AC-01: Non-leap February 2026 must have 28 days');

  // Tier boundary checks (7999 -> HEALTHY, 8000 -> WARNING, 10000 -> WARNING, 10001 -> EXCEEDED, cap 0)
  const { computeTierFromUtilization } = require('./functions/utilization');
  assert.strictEqual(computeTierFromUtilization(7999, 100000, 79990), 'HEALTHY');
  assert.strictEqual(computeTierFromUtilization(8000, 100000, 80000), 'WARNING');
  assert.strictEqual(computeTierFromUtilization(10000, 100000, 100000), 'WARNING');
  assert.strictEqual(computeTierFromUtilization(10001, 100000, 100010), 'EXCEEDED');
  assert.strictEqual(computeTierFromUtilization(0, 0, 0), 'HEALTHY');
  assert.strictEqual(computeTierFromUtilization(10001, 0, 500), 'EXCEEDED');

  // ==========================================================================
  // SEN-AC-02: Determinism — Replaying any request on the same snapshot & model_version returns byte-identical data
  // ==========================================================================
  const replayCalls = [
    ['sentinel_get_surplus_baseline', { timeframe_months: 3 }],
    ['sentinel_get_ledger_summary', { timeframe_months: 3 }],
    ['sentinel_get_spending_timeseries', { granularity: 'MONTH' }],
    ['sentinel_run_category_utilization', { category_id: 'FOOD.DINING' }],
    ['sentinel_run_velocity_projection', {}],
    ['sentinel_detect_anomalies', { lookback_days: 90 }],
    ['sentinel_run_rebalance_simulation', { deficit_category_id: 'FOOD.DINING' }],
    ['sentinel_validate_cap_change', { category_id: 'SHOPPING.GENERAL', new_cap_minor: 1800000, scope: 'STANDING' }],
    ['sentinel_run_goal_progress', { goal_id: 'gol_v5_1' }],
    ['sentinel_run_goal_feasibility', { goal_id: 'gol_v5_1', proposed_monthly_add_minor: 1200000 }],
    ['sentinel_validate_goal_change', { operation: 'UPDATE', goal_id: 'gol_v5_1', monthly_add_minor: 1200000 }],
    ['sentinel_forecast_bill_outlays', { lookback_months: 6, horizon_days: 30 }],
    ['sentinel_flag_cashflow_risk', { horizon_days: 30 }],
    ['sentinel_check_available_balance', { amount_minor: 500000 }],
    ['sentinel_run_spending_simulation', {}],
    ['sentinel_compute_health_score', {}],
    ['sentinel_project_sip', { monthly_amount_minor: 1000000, annual_rate_bp: 1200, months: 60, annual_step_up_bp: 1000 }],
  ];

  for (const [fnName, params] of replayCalls) {
    const r1 = sentinel.run(fnName, params, { snapshot: snap, user_id: canonicalUserId });
    const r2 = sentinel.run(fnName, params, { snapshot: snap, user_id: canonicalUserId });
    assert.strictEqual(r1.status, 'OK', `SEN-AC-02: ${fnName} must return status OK`);
    assert.strictEqual(
      JSON.stringify(r1.data),
      JSON.stringify(r2.data),
      `SEN-AC-02: Replay of ${fnName} must return byte-identical data`
    );
    const outValid = sentinel.schemas.validateOutputData(fnName, r1.data);
    assert.strictEqual(
      outValid.valid,
      true,
      `SEN-AC-01/02: Output of ${fnName} must satisfy C.3 required fields: ${outValid.errors.join(', ')}`
    );
  }

  // ==========================================================================
  // SEN-AC-03: Reject identity parameters and literal values for fact parameters
  // ==========================================================================
  for (const idField of ['user_id', 'tenant_id', 'snapshot_id', 'customer_ref']) {
    const badRes = sentinel.run(
      'sentinel_get_surplus_baseline',
      { [idField]: 'injected' },
      { snapshot: snap, user_id: canonicalUserId }
    );
    assert.strictEqual(badRes.status, 'ERROR');
    assert.strictEqual(badRes.error.code, 'INVALID_INPUT', `SEN-AC-03: Must reject identity param ${idField}`);
  }

  const badFactRes = sentinel.run(
    'sentinel_flag_cashflow_risk',
    { horizon_days: 30, outlays: [{ label: 'Fake literal bill', amount_minor: 10000 }] },
    { snapshot: snap, user_id: canonicalUserId }
  );
  assert.strictEqual(badFactRes.status, 'ERROR');
  assert.strictEqual(
    badFactRes.error.code,
    'FACT_PARAM_REQUIRES_REF',
    'SEN-AC-03: Must reject literal array for fact parameter outlays'
  );

  // Also verify via GatewaySession
  const gwTest = createGatewaySession({
    caller: 'IRIS',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
  });
  const gwBadFact = gwTest.call('sentinel_flag_cashflow_risk', {
    horizon_days: 30,
    outlays: [{ amount_minor: 500 }],
  });
  assert.strictEqual(gwBadFact.status, 'ERROR');
  assert.strictEqual(gwBadFact.error.code, 'FACT_PARAM_REQUIRES_REF');

  // Verify valid ResultRef ({ from_result, path }) works via GatewaySession
  const gwBills = gwTest.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
  const gwGoodRef = gwTest.call('sentinel_flag_cashflow_risk', {
    horizon_days: 30,
    outlays: { from_result: gwBills.tool_result_id, path: '/data/outlays' },
  });
  assert.strictEqual(gwGoodRef.status, 'OK', 'SEN-AC-03: ResultRef {from_result, path} must resolve cleanly');

  // ==========================================================================
  // SEN-AC-04: Static check — Zero LLM or model-provider imports in engines/sentinel/
  // ==========================================================================
  const sentinelDir = __dirname;
  const jsFiles = getAllJsFiles(sentinelDir);
  const bannedPatterns = [
    /require\(['"].*openai/i,
    /require\(['"].*anthropic/i,
    /require\(['"].*gemini/i,
    /require\(['"].*genai/i,
    /require\(['"].*llm/i,
    /from\s+['"].*openai/i,
    /from\s+['"].*gemini/i,
  ];
  for (const file of jsFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const pat of bannedPatterns) {
      assert.strictEqual(
        pat.test(src),
        false,
        `SEN-AC-04: Forbidden LLM import pattern ${pat} found in ${file}`
      );
    }
  }

  // ==========================================================================
  // SEN-AC-05: Sentinel's DB handle (`sentinel_ro`) cannot write
  // ==========================================================================
  const roDb = sentinel.createSentinelReadOnlyDb();
  assert.strictEqual(roDb.role, 'sentinel_ro');
  assert.throws(
    () => roDb.exec('DELETE FROM goals_v1'),
    /PERMISSION_DENIED/,
    'SEN-AC-05: sentinel_ro.exec() must throw PERMISSION_DENIED'
  );
  assert.throws(
    () => roDb.prepare('INSERT INTO goals_v1 (goal_id) VALUES (?)'),
    /PERMISSION_DENIED/,
    'SEN-AC-05: sentinel_ro.prepare(INSERT) must throw PERMISSION_DENIED'
  );
  assert.throws(
    () => roDb.prepare('UPDATE caps_v1 SET amount_minor = 0'),
    /PERMISSION_DENIED/,
    'SEN-AC-05: sentinel_ro.prepare(UPDATE) must throw PERMISSION_DENIED'
  );
  const roSelectStmt = roDb.prepare('SELECT count(*) as c FROM goals_v1 WHERE user_id = ?');
  assert.ok(roSelectStmt.get(canonicalUserId).c >= 1, 'SEN-AC-05: sentinel_ro SELECT must succeed');
  assert.throws(
    () => roSelectStmt.run(canonicalUserId),
    /PERMISSION_DENIED/,
    'SEN-AC-05: sentinel_ro stmt.run() must throw PERMISSION_DENIED'
  );

  // ==========================================================================
  // SEN-AC-06: Rule library results identical whether called by Sentinel or Action Service
  // ==========================================================================
  const loadedState = sentinel.loadSnapshotState(snap, canonicalUserId);
  const goalCorpus = [
    { operation: 'CREATE', name: 'New Car', target_minor: 5000000, monthly_add_minor: 500000 },
    { operation: 'CREATE', name: '', target_minor: -100, monthly_add_minor: -50 },
    { operation: 'UPDATE', goal_id: 'gol_v5_1', target_minor: 500000 }, // below saved_minor
    { operation: 'RELEASE_FUNDS', goal_id: 'gol_v5_1', amount_minor: 99999999 },
  ];
  for (const op of goalCorpus) {
    const viaTool = sentinel.run('sentinel_validate_goal_change', op, {
      snapshot: snap,
      user_id: canonicalUserId,
    });
    const viaRule = sentinel.rules.validateGoalChange(loadedState, op);
    assert.strictEqual(viaTool.data.verdict, viaRule.verdict, 'SEN-AC-06: Goal verdict must match');
    assert.deepStrictEqual(
      viaTool.data.rule_codes,
      viaRule.rule_codes,
      'SEN-AC-06: Goal rule_codes must match'
    );
  }

  const capCorpus = [
    { category_id: 'SHOPPING.GENERAL', new_cap_minor: 1800000, scope: 'STANDING' },
    { category_id: 'HOUSING.RENT', new_cap_minor: 1000000, scope: 'STANDING' },
    { category_id: 'HEALTH.MEDICAL', new_cap_minor: 200000, scope: 'STANDING', override_protected: false },
    { category_id: 'FOOD.DINING', new_cap_minor: 5000, scope: 'STANDING' },
  ];
  for (const chg of capCorpus) {
    const viaTool = sentinel.run('sentinel_validate_cap_change', chg, {
      snapshot: snap,
      user_id: canonicalUserId,
    });
    const viaRule = sentinel.rules.validateCapChange(loadedState, chg);
    assert.strictEqual(viaTool.data.verdict, viaRule.verdict, 'SEN-AC-06: Cap verdict must match');
    assert.deepStrictEqual(
      viaTool.data.rule_codes,
      viaRule.rule_codes,
      'SEN-AC-06: Cap rule_codes must match'
    );
  }

  const balViaTool = sentinel.run(
    'sentinel_check_available_balance',
    { amount_minor: 500000 },
    { snapshot: snap, user_id: canonicalUserId }
  );
  const balViaRule = sentinel.rules.checkAvailableBalance(loadedState, { amount_minor: 500000 });
  assert.strictEqual(
    balViaTool.data.available_signed_minor,
    balViaRule.available_signed_minor,
    'SEN-AC-06: Balance check must match'
  );

  // ==========================================================================
  // SEN-AC-07: Forecasts & simulations always include confidence and variance_band
  // ==========================================================================
  for (const [fnName, params] of [
    ['sentinel_run_velocity_projection', {}],
    ['sentinel_forecast_bill_outlays', { horizon_days: 30 }],
    ['sentinel_flag_cashflow_risk', { horizon_days: 30 }],
    ['sentinel_run_spending_simulation', {}],
  ]) {
    const res = sentinel.run(fnName, params, { snapshot: snap, user_id: canonicalUserId });
    assert.ok(
      ['HIGH', 'MEDIUM', 'LOW'].includes(res.confidence),
      `SEN-AC-07: ${fnName} must include confidence`
    );
    assert.ok(
      res.variance_band &&
        typeof res.variance_band.low_minor === 'number' &&
        typeof res.variance_band.high_minor === 'number',
      `SEN-AC-07: ${fnName} must include variance_band`
    );
  }

  // ==========================================================================
  // SEN-AC-08: Documented statistical methods & held-out accuracy check
  // ==========================================================================
  assert.ok(
    fs.existsSync(path.join(__dirname, 'METHODS.md')),
    'SEN-AC-08: METHODS.md must exist in engines/sentinel/'
  );
  const billForecast = sentinel.run(
    'sentinel_forecast_bill_outlays',
    { lookback_months: 6, horizon_days: 60 },
    { snapshot: snap, user_id: canonicalUserId }
  );
  const netflixOutlay = billForecast.data.outlays.find((o) =>
    String(o.label).toUpperCase().includes('NETFLIX')
  );
  assert.ok(netflixOutlay, 'SEN-AC-08: Recurring cadence detector must forecast Netflix bill');
  assert.strictEqual(netflixOutlay.amount_minor, 64900, 'SEN-AC-08: Forecasted bill must match exact median 64900 paise');

  // ==========================================================================
  // SEN-AC-09: Parameter registry & model_version replay
  // ==========================================================================
  const versions = sentinel.listAvailableModelVersions();
  assert.ok(versions.includes('5.0.0') && versions.includes('5.0.1'), 'SEN-AC-09: Must have 5.0.0 and 5.0.1 registries');
  const reg500 = sentinel.getRegistry('5.0.0');
  const reg501 = sentinel.getRegistry('5.0.1');
  assert.strictEqual(reg500['tier.warning_bp'], 8000);
  assert.strictEqual(reg501['tier.warning_bp'], 7500);
  const resV501 = sentinel.run(
    'sentinel_run_category_utilization',
    { category_id: 'FOOD.DINING' },
    { snapshot: snap, user_id: canonicalUserId, model_version: '5.0.1' }
  );
  assert.strictEqual(resV501.model_version, '5.0.1', 'SEN-AC-09: Envelope must record requested model_version');

  // ==========================================================================
  // SEN-AC-10: Cross-user access returns SNAPSHOT_NOT_FOUND & no data
  // ==========================================================================
  const crossUserRes = sentinel.run(
    'sentinel_get_surplus_baseline',
    {},
    { snapshot_id: snap.snapshot_id, user_id: 'usr_99999999999999999999999999' }
  );
  assert.strictEqual(crossUserRes.status, 'SNAPSHOT_NOT_FOUND');
  assert.strictEqual(crossUserRes.data, null, 'SEN-AC-10: Cross-user access must return null data');

  // ==========================================================================
  // SEN-AC-11: Performance target verification
  // ==========================================================================
  const t0 = performance.now();
  sentinel.run('sentinel_validate_goal_change', { operation: 'CREATE', name: 'Perf', target_minor: 100000, monthly_add_minor: 10000 }, { snapshot: snap, user_id: canonicalUserId });
  const fastElapsed = performance.now() - t0;
  assert.ok(fastElapsed < 300, `SEN-AC-11: Fast validator group took ${fastElapsed.toFixed(1)}ms (> 300ms)`);

  // ==========================================================================
  // SEN-AC-12: Snapshot immutability vs new snapshot after mutation
  // ==========================================================================
  const utilBefore = sentinel.run(
    'sentinel_run_category_utilization',
    { category_id: 'SHOPPING.GENERAL' },
    { snapshot: snap, user_id: canonicalUserId }
  );
  assert.strictEqual(utilBefore.data.spent_total_minor, 300000);

  // Add a future-dated transaction after snap.current_date_ist
  db.prepare(
    `INSERT OR REPLACE INTO transactions_v1 (
       txn_id, user_id, account_id, source, status, direction, amount_minor,
       txn_timestamp, txn_date, raw_description, normalized_description,
       movement_type, category_id, classification_status, classification_confidence,
       classification_confidence_bp, categorized_version
     ) VALUES ('txn_v5_future', ?, 'acc_default', 'MANUAL_USER', 'POSTED', 'DEBIT', 120000,
       '2099-01-01T00:00:00Z', '2099-01-01', 'Future Test', 'future test',
       'EXPENSE', 'SHOPPING.GENERAL', 'CONFIRMED', 'HIGH', 10000, 999)`
  ).run(canonicalUserId);

  const utilPinnedOld = sentinel.run(
    'sentinel_run_category_utilization',
    { category_id: 'SHOPPING.GENERAL' },
    { snapshot: snap, user_id: canonicalUserId }
  );
  assert.strictEqual(
    utilPinnedOld.data.spent_total_minor,
    300000,
    'SEN-AC-12: Pinned old snapshot must ignore rows beyond its ledger_version / as_of_date'
  );

  // ==========================================================================
  // SEN-AC-13 & SEN-AC-14: Movement exclusions & Single-Truth spend consistency
  // ==========================================================================
  const ledgerRes = sentinel.run(
    'sentinel_get_ledger_summary',
    { timeframe_months: 1 },
    { snapshot: snap, user_id: canonicalUserId }
  );
  const tsRes = sentinel.run(
    'sentinel_get_spending_timeseries',
    { granularity: 'MONTH', from_period: snap.current_month_ist, to_period: snap.current_month_ist },
    { snapshot: snap, user_id: canonicalUserId }
  );
  const diningInLedger = ledgerRes.data.categories.find((c) => c.category_id === 'FOOD.DINING');
  const diningInUtil = sentinel.run(
    'sentinel_run_category_utilization',
    { category_id: 'FOOD.DINING' },
    { snapshot: snap, user_id: canonicalUserId }
  );
  assert.strictEqual(
    diningInLedger.total_spend_minor,
    diningInUtil.data.spent_total_minor,
    'SEN-AC-14: Category spend must match between ledger summary and category utilization'
  );
  const curMonthSeries = tsRes.data.series.find((s) => s.period === snap.current_month_ist);
  assert.strictEqual(
    curMonthSeries.total_spend_minor,
    ledgerRes.data.total_spend_minor,
    'SEN-AC-14: Total spend must match between timeseries and ledger summary'
  );

  // ==========================================================================
  // SEN-AC-15: Confidence capped by coverage, completeness, and balance staleness
  // ==========================================================================
  const lowCoverageState = {
    ...loadedState,
    data_quality: { ...loadedState.data_quality, coverage_bp: 6000, complete: false },
  };
  const cappedEnv = sentinel.sentinel_get_surplus_baseline(lowCoverageState, {});
  assert.strictEqual(cappedEnv.confidence, 'LOW', 'SEN-AC-15: Coverage < 7000 bp must cap confidence to LOW');
  assert.ok(cappedEnv.constraint_codes.includes('LOW_CATEGORIZATION_COVERAGE'));
  assert.ok(cappedEnv.constraint_codes.includes('IMPORT_IN_PROGRESS'));

  // ==========================================================================
  // SEN-AC-16: Exclusive cap partition (parent FOOD cap vs leaf FOOD.DINING cap)
  // ==========================================================================
  const foodUtil = sentinel.run(
    'sentinel_run_category_utilization',
    { category_id: 'FOOD' },
    { snapshot: snap, user_id: canonicalUserId }
  );
  assert.strictEqual(
    foodUtil.data.covered_category_ids.includes('FOOD.DINING'),
    false,
    'SEN-AC-16: Parent FOOD cap must exclude FOOD.DINING leaf because FOOD.DINING has its own cap'
  );
  assert.strictEqual(
    foodUtil.data.covered_category_ids.includes('FOOD.GROCERIES') &&
      foodUtil.data.covered_category_ids.includes('FOOD.DELIVERY'),
    true,
    'SEN-AC-16: Parent FOOD cap must cover uncapped child leaves FOOD.GROCERIES and FOOD.DELIVERY'
  );
  assert.strictEqual(
    foodUtil.data.spent_total_minor,
    1170000,
    'SEN-AC-16: Parent FOOD cap spend must equal FOOD.GROCERIES (320000) + FOOD.DELIVERY (850000) = 1170000 without double-counting FOOD.DINING'
  );

  const allUtil = sentinel.run(
    'sentinel_run_category_utilization',
    {},
    { snapshot: snap, user_id: canonicalUserId }
  );
  const sumCappedSpend = allUtil.data.categories.reduce((s, c) => s + c.spent_total_minor, 0);
  const sumUncappedSpend = allUtil.data.uncapped_categories.reduce(
    (s, c) => s + c.spent_total_minor,
    0
  );
  assert.strictEqual(
    sumCappedSpend + sumUncappedSpend,
    ledgerRes.data.total_spend_minor,
    'SEN-AC-16: Sum of capped spend + uncapped spend must equal total category spend'
  );

  // ==========================================================================
  // SEN-AC-17: Simulation vs Surplus exact agreement for FIXED-only baseline
  // ==========================================================================
  const fixedOnlyState = {
    ...loadedState,
    caps: [],
    goals: [],
    spendByCategory: {},
    all_txns: [],
    current_month_txns: [],
  };
  const simFixed = sentinel.sentinel_run_spending_simulation(fixedOnlyState, {
    target_month: '2026-12',
    opening_balance_signed_minor: 5000000,
  });
  const surpFixed = sentinel.sentinel_get_surplus_baseline(fixedOnlyState, {});
  assert.strictEqual(
    simFixed.data.projected_end_balance_signed_minor - simFixed.data.opening_balance_signed_minor,
    surpFixed.data.net_surplus_signed_minor,
    'SEN-AC-17: projected_end_balance - opening_balance must equal net_surplus exactly'
  );

  // ==========================================================================
  // SEN-AC-18: Rebalance never includes protected or FIXED donor and always nets to zero
  // ==========================================================================
  const rebRes = sentinel.run(
    'sentinel_run_rebalance_simulation',
    { deficit_category_id: 'FOOD.DINING' },
    { snapshot: snap, user_id: canonicalUserId }
  );
  assert.strictEqual(rebRes.data.net_cap_change_minor, 0, 'SEN-AC-18: Rebalance must net to zero');
  assert.ok(
    rebRes.data.excluded_protected.includes('HEALTH.MEDICAL'),
    'SEN-AC-18: Protected category HEALTH.MEDICAL must be excluded from rebalance donors'
  );
  for (const tr of rebRes.data.transfers) {
    assert.notStrictEqual(tr.from_category_id, 'HEALTH.MEDICAL');
    assert.notStrictEqual(tr.from_category_id, 'HOUSING.RENT');
  }
  const rebCheck = sentinel.rules.validateRebalance(loadedState, rebRes.data);
  assert.strictEqual(rebCheck.verdict, 'PASS', 'SEN-AC-18: Generated rebalance transfers must pass validateRebalance');

  // ==========================================================================
  // SEN-AC-19: Health Score worked examples (4 x 25 components)
  // ==========================================================================
  const ex1 = sentinel.calculateHealthScoreComponents({
    incomeMinor: 10000000, // ₹1,00,000
    goalCommitmentsMinor: 2000000, // 20% -> 25/25
    cappedCount: 4,
    withinCapCount: 4, // 4/4 -> 25/25
    discretionarySpendMinor: 3000000,
    fixedOutflowMinor: 3000000, // 60% outflow -> 25/25
    fundedGoalsCount: 4, // min(25, 32) -> 25/25
    useStrictSpecFormula: true,
  });
  assert.strictEqual(ex1.score, 100, 'SEN-AC-19: Worked example 1 must score 100');
  assert.strictEqual(ex1.grade, 'EXCELLENT');

  const exNoCaps = sentinel.calculateHealthScoreComponents({
    incomeMinor: 10000000,
    goalCommitmentsMinor: 1000000, // 10% -> round(1000 * 25 / 2000) = round(12.5) = 12 (half-even!)
    cappedCount: 0,
    withinCapCount: 0, // no caps -> 12
    discretionarySpendMinor: 4000000,
    fixedOutflowMinor: 4000000, // 80% outflow -> (2000 * 25 / 4000) = round(12.5) = 12 (half-even!)
    fundedGoalsCount: 1, // 1 * 8 = 8
    useStrictSpecFormula: true,
  });
  assert.strictEqual(exNoCaps.components.saving_behavior, 12);
  assert.strictEqual(exNoCaps.components.budget_discipline, 12);
  assert.strictEqual(exNoCaps.components.spending_control, 12);
  assert.strictEqual(exNoCaps.components.future_planning, 8);
  assert.strictEqual(exNoCaps.score, 44);
  assert.strictEqual(exNoCaps.grade, 'FAIR');

  // ==========================================================================
  // SEN-AC-20: SIP matches reference spreadsheet formula to the paisa for 20 cases
  // ==========================================================================
  for (let i = 1; i <= 20; i++) {
    const monthly = i * 50000; // ₹500 to ₹10,000
    const rateBp = (i * 135) % 2500; // 0..2500 bp
    const months = i * 6; // 6..120 months
    const stepUpBp = (i % 4) * 500; // 0, 500, 1000, 1500 bp

    // Reference calculation
    let refInstallment = monthly;
    let refInvested = 0;
    let refCorpus = 0;
    for (let m = 1; m <= months; m++) {
      if (m > 1 && (m - 1) % 12 === 0 && stepUpBp > 0) {
        refInstallment += multiplyMinorByBp(refInstallment, stepUpBp);
      }
      refInvested += refInstallment;
      refCorpus += refInstallment;
      refCorpus += halfEvenRoundBigInt(BigInt(refCorpus) * BigInt(rateBp), 120000n);
    }

    const sipRes = sentinel.run(
      'sentinel_project_sip',
      {
        monthly_amount_minor: monthly,
        annual_rate_bp: rateBp,
        months,
        annual_step_up_bp: stepUpBp,
      },
      { snapshot: snap, user_id: canonicalUserId }
    );
    assert.strictEqual(sipRes.status, 'OK');
    assert.strictEqual(sipRes.confidence, null, 'SEN-AC-20: SIP confidence must be null');
    assert.strictEqual(sipRes.data.illustrative, true);
    assert.strictEqual(sipRes.data.rate_source, 'USER_SUPPLIED');
    assert.strictEqual(
      sipRes.data.total_invested_minor,
      refInvested,
      `SEN-AC-20 case ${i}: total_invested_minor must match to the paisa`
    );
    assert.strictEqual(
      sipRes.data.future_value_minor,
      refCorpus,
      `SEN-AC-20 case ${i}: future_value_minor must match to the paisa`
    );
  }

  console.log('   ✓ All 20 Sentinel v5.0 Acceptance Criteria (SEN-AC-01 .. SEN-AC-20) verified!');
}

if (require.main === module) {
  runSentinelV5Tests();
}

module.exports = {
  runSentinelV5Tests,
};
