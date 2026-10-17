/**
 * SEN-AC-11: Performance Benchmark at Volume (Sentinel §B.8, WS-SEN-P2)
 *
 * Verifies that with 24 months × 300 rows = 7,200 transactions on file:
 * - Class A (velocity, anomalies, goal progress, ledger summary, timeseries): p95 < 1,000 ms
 * - Class B (spending simulation, bill forecast, cash-flow risk): p95 < 2,000 ms
 *
 * Skipped by default so standard test suite stays sub-second;
 * runs when RUN_PERF=1 is set in environment.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const isPerfEnabled = process.env.RUN_PERF === '1';

describe('SEN-AC-11: Sentinel Performance Benchmarks (24mo × 300 rows = 7,200 txns)', { skip: !isPerfEnabled }, () => {
  let setupTempDb;
  let db;
  let createSnapshot;
  let syncUserStateFromLegacy;
  let ingestBatch;
  let callSentinel;
  let canonicalUserId;
  let snapshot;

  before(() => {
    if (!isPerfEnabled) return;

    setupTempDb = require('../helpers/temp-db').setupTempDb;
    setupTempDb();

    db = require('../../src/db');
    createSnapshot = require('../../src/platform/snapshot').createSnapshot;
    syncUserStateFromLegacy = require('../../src/platform/profile').syncUserStateFromLegacy;
    ingestBatch = require('../../src/engines/categorizer').ingestBatch;
    callSentinel = require('../../src/engines/sentinel').callSentinel;

    const testEmail = `perf_${Date.now()}@finmate.ai`;
    const insertUser = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, monthly_income, fixed_housing_expense)
         VALUES (?, 'hash', 'Perf Tester', 120000, 30000)`
      )
      .run(testEmail);
    const numId = Number(insertUser.lastInsertRowid);
    canonicalUserId = syncUserStateFromLegacy(numId);

    // Setup active goals and caps
    db.prepare(
      `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, version)
       VALUES (?, ?, ?, ?, 'STANDING', 1)`
    ).run('cap_food', canonicalUserId, 'FOOD.DELIVERY', 1000000);

    db.prepare(
      `INSERT OR REPLACE INTO goals_v1 (goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor, deadline, priority_tier, priority_rank, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run('g_house', canonicalUserId, 'House Down Payment', 50000000, 5000000, 2000000, '2030-01-01', 'HIGH', 1, 'ACTIVE');

    // Generate 24 months × 300 rows = 7,200 transactions
    const totalMonths = 24;
    const txnsPerMonth = 300;
    const startYear = 2024;
    const startMonth = 11; // 2024-11 through 2026-10

    const descriptions = [
      { raw: 'SWIGGY ORDER BANGALORE', dir: 'DEBIT', amt: 45000 },
      { raw: 'ZOMATO ONLINE MEAL', dir: 'DEBIT', amt: 62000 },
      { raw: 'NATURE BASKET GROCERIES', dir: 'DEBIT', amt: 120000 },
      { raw: 'UBER RIDE CITY', dir: 'DEBIT', amt: 35000 },
      { raw: 'AMAZON INDIA MARKETPLACE', dir: 'DEBIT', amt: 85000 },
      { raw: 'NETFLIX SUBSCRIPTION', dir: 'DEBIT', amt: 64900 },
      { raw: 'APOLLO PHARMACY MEDICAL', dir: 'DEBIT', amt: 42000 },
      { raw: 'ELECTRICITY BILL BESCOM', dir: 'DEBIT', amt: 210000 },
      { raw: 'AIRTEL FIBER BROADBAND', dir: 'DEBIT', amt: 99900 },
      { raw: 'SALARY CREDIT ACME CORP', dir: 'CREDIT', amt: 12000000 },
    ];

    console.log(`Generating and ingesting ${totalMonths * txnsPerMonth} benchmark transactions...`);
    const allBatches = [];

    for (let m = 0; m < totalMonths; m++) {
      const year = startYear + Math.floor((startMonth + m - 1) / 12);
      const monthNum = ((startMonth + m - 1) % 12) + 1;
      const monthStr = `${year}-${String(monthNum).padStart(2, '0')}`;

      for (let i = 0; i < txnsPerMonth; i++) {
        const template = descriptions[i % descriptions.length];
        const day = (i % 28) + 1;
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        allBatches.push({
          raw_description: template.raw,
          amount_minor: template.amt + (i * 10),
          direction: template.dir,
          txn_date: dateStr,
        });
      }
    }

    // Ingest in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < allBatches.length; i += chunkSize) {
      ingestBatch(canonicalUserId, allBatches.slice(i, i + chunkSize), 'STATEMENT_CSV');
    }

    snapshot = createSnapshot(canonicalUserId);
    console.log(`Ingestion complete. Snapshot pinned at: ${snapshot.snapshot_id}`);
  });

  function measureLatency(fn, iterations = 5) {
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      fn();
      const elapsed = performance.now() - t0;
      times.push(elapsed);
    }
    times.sort((a, b) => a - b);
    const p95Index = Math.min(times.length - 1, Math.floor(times.length * 0.95));
    return {
      p95: times[p95Index],
      min: times[0],
      max: times[times.length - 1],
      median: times[Math.floor(times.length / 2)],
    };
  }

  it('Class A functions (Velocity, Ledger Summary, Timeseries, Anomalies) meet p95 < 1,000 ms', () => {
    // 1. Velocity
    const velStats = measureLatency(() => {
      callSentinel('sentinel_run_velocity_projection', canonicalUserId, snapshot, {});
    });
    console.log(`Velocity p95: ${velStats.p95.toFixed(2)} ms (median: ${velStats.median.toFixed(2)} ms)`);
    assert.ok(velStats.p95 < 1000, `Velocity p95 ${velStats.p95} ms >= 1000 ms target`);

    // 2. Ledger Summary
    const ledgerStats = measureLatency(() => {
      callSentinel('sentinel_get_ledger_summary', canonicalUserId, snapshot, { timeframe_months: 6 });
    });
    console.log(`Ledger Summary p95: ${ledgerStats.p95.toFixed(2)} ms (median: ${ledgerStats.median.toFixed(2)} ms)`);
    assert.ok(ledgerStats.p95 < 1000, `Ledger Summary p95 ${ledgerStats.p95} ms >= 1000 ms target`);

    // 3. Timeseries
    const tsStats = measureLatency(() => {
      callSentinel('sentinel_get_spending_timeseries', canonicalUserId, snapshot, { months: 12 });
    });
    console.log(`Timeseries p95: ${tsStats.p95.toFixed(2)} ms (median: ${tsStats.median.toFixed(2)} ms)`);
    assert.ok(tsStats.p95 < 1000, `Timeseries p95 ${tsStats.p95} ms >= 1000 ms target`);

    // 4. Anomalies
    const anomStats = measureLatency(() => {
      callSentinel('sentinel_detect_anomalies', canonicalUserId, snapshot, { lookback_days: 90 });
    });
    console.log(`Anomalies p95: ${anomStats.p95.toFixed(2)} ms (median: ${anomStats.median.toFixed(2)} ms)`);
    assert.ok(anomStats.p95 < 1000, `Anomalies p95 ${anomStats.p95} ms >= 1000 ms target`);
  });

  it('Class B functions (Simulation, Bill Forecast, Cashflow Risk) meet p95 < 2,000 ms', () => {
    // 1. Spending Simulation
    const simStats = measureLatency(() => {
      callSentinel('sentinel_run_spending_simulation', canonicalUserId, snapshot, { target_month: '2026-11' });
    });
    console.log(`Simulation p95: ${simStats.p95.toFixed(2)} ms (median: ${simStats.median.toFixed(2)} ms)`);
    assert.ok(simStats.p95 < 2000, `Simulation p95 ${simStats.p95} ms >= 2000 ms target`);

    // 2. Bill Forecast
    const billStats = measureLatency(() => {
      callSentinel('sentinel_forecast_bill_outlays', canonicalUserId, snapshot, { horizon_days: 60 });
    });
    console.log(`Bill Forecast p95: ${billStats.p95.toFixed(2)} ms (median: ${billStats.median.toFixed(2)} ms)`);
    assert.ok(billStats.p95 < 2000, `Bill Forecast p95 ${billStats.p95} ms >= 2000 ms target`);

    // 3. Cashflow Risk
    const cashStats = measureLatency(() => {
      callSentinel('sentinel_flag_cashflow_risk', canonicalUserId, snapshot, { horizon_days: 60 });
    });
    console.log(`Cashflow Risk p95: ${cashStats.p95.toFixed(2)} ms (median: ${cashStats.median.toFixed(2)} ms)`);
    assert.ok(cashStats.p95 < 2000, `Cashflow Risk p95 ${cashStats.p95} ms >= 2000 ms target`);
  });
});
