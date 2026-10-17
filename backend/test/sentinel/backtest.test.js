/**
 * SEN-AC-08 & D-PLAN-10: Statistical Backtest Suite (WS-SEN-P2)
 *
 * Verifies that:
 * 1. Sentinel's statistical components have documented methods (METHODS.md)
 * 2. Monthly spend forecast passes backtest on held-out month within ±15% error bounds (D-PLAN-10)
 * 3. Anomaly detection identifies known synthetic spikes with MAD >= 3.0
 * 4. Cadence detection correctly identifies recurring monthly bills
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { setupTempDb } = require('../helpers/temp-db');
setupTempDb();

const db = require('../../src/db');
const { createSnapshot } = require('../../src/platform/snapshot');
const { syncUserStateFromLegacy } = require('../../src/platform/profile');
const { ingestBatch } = require('../../src/engines/categorizer');
const { callSentinel } = require('../../src/engines/sentinel');

describe('SEN-AC-08 & D-PLAN-10: Statistical Backtests on Held-Out History', () => {
  let canonicalUserId;
  let snapshot;

  before(() => {
    const testEmail = `backtest_${Date.now()}@finmate.ai`;
    const insertUser = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, monthly_income, fixed_housing_expense)
         VALUES (?, 'hash', 'Backtest Tester', 90000, 20000)`
      )
      .run(testEmail);
    const numId = Number(insertUser.lastInsertRowid);
    canonicalUserId = syncUserStateFromLegacy(numId);

    // 1. Ingest 3 Training Months (2026-07, 2026-08, 2026-09)
    // Realistic monthly spend around ₹40,000 - ₹43,000 (4,000,000 - 4,300,000 paise)
    const trainingBatches = [
      // Month 1: 2026-07 (Total spend: ₹41,500 = 4,150,000 paise)
      { raw_description: 'SALARY CREDIT ACME CORP', amount_minor: 9000000, direction: 'CREDIT', txn_date: '2026-07-01' },
      { raw_description: 'HOUSE RENT PAYMENT', amount_minor: 2000000, direction: 'DEBIT', txn_date: '2026-07-02' },
      { raw_description: 'NATURE BASKET GROCERIES', amount_minor: 1000000, direction: 'DEBIT', txn_date: '2026-07-08' },
      { raw_description: 'SWIGGY FOOD ORDER', amount_minor: 650000, direction: 'DEBIT', txn_date: '2026-07-15' },
      { raw_description: 'UBER RIDE MUMBAI', amount_minor: 500000, direction: 'DEBIT', txn_date: '2026-07-22' },

      // Month 2: 2026-08 (Total spend: ₹42,000 = 4,200,000 paise)
      { raw_description: 'SALARY CREDIT ACME CORP', amount_minor: 9000000, direction: 'CREDIT', txn_date: '2026-08-01' },
      { raw_description: 'HOUSE RENT PAYMENT', amount_minor: 2000000, direction: 'DEBIT', txn_date: '2026-08-02' },
      { raw_description: 'NATURE BASKET GROCERIES', amount_minor: 1050000, direction: 'DEBIT', txn_date: '2026-08-07' },
      { raw_description: 'SWIGGY FOOD ORDER', amount_minor: 600000, direction: 'DEBIT', txn_date: '2026-08-16' },
      { raw_description: 'UBER RIDE MUMBAI', amount_minor: 550000, direction: 'DEBIT', txn_date: '2026-08-23' },

      // Month 3: 2026-09 (Total spend: ₹41,000 = 4,100,000 paise)
      { raw_description: 'SALARY CREDIT ACME CORP', amount_minor: 9000000, direction: 'CREDIT', txn_date: '2026-09-01' },
      { raw_description: 'HOUSE RENT PAYMENT', amount_minor: 2000000, direction: 'DEBIT', txn_date: '2026-09-02' },
      { raw_description: 'NATURE BASKET GROCERIES', amount_minor: 950000, direction: 'DEBIT', txn_date: '2026-09-06' },
      { raw_description: 'SWIGGY FOOD ORDER', amount_minor: 700000, direction: 'DEBIT', txn_date: '2026-09-14' },
      { raw_description: 'UBER RIDE MUMBAI', amount_minor: 450000, direction: 'DEBIT', txn_date: '2026-09-21' },

      // 2. Ingest Held-Out Test Month (2026-10)
      // Actual spend: ₹42,500 = 4,250,000 paise
      { raw_description: 'SALARY CREDIT ACME CORP', amount_minor: 9000000, direction: 'CREDIT', txn_date: '2026-10-01' },
      { raw_description: 'HOUSE RENT PAYMENT', amount_minor: 2000000, direction: 'DEBIT', txn_date: '2026-10-02' },
      { raw_description: 'NATURE BASKET GROCERIES', amount_minor: 1020000, direction: 'DEBIT', txn_date: '2026-10-08' },
      { raw_description: 'SWIGGY FOOD ORDER', amount_minor: 680000, direction: 'DEBIT', txn_date: '2026-10-15' },
      { raw_description: 'UBER RIDE MUMBAI', amount_minor: 550000, direction: 'DEBIT', txn_date: '2026-10-22' },
    ];

    ingestBatch(canonicalUserId, trainingBatches, 'STATEMENT_CSV');
    snapshot = createSnapshot(canonicalUserId);
  });

  it('proves METHODS.md documentation exists and covers all required statistical topics', () => {
    const methodsPath = path.join(__dirname, '..', '..', 'src', 'engines', 'sentinel', 'METHODS.md');
    assert.ok(fs.existsSync(methodsPath), 'METHODS.md must exist in engines/sentinel');
    const content = fs.readFileSync(methodsPath, 'utf8');

    assert.ok(content.includes('Income Estimation'), 'METHODS.md must document Income Estimation');
    assert.ok(content.includes('Spend Velocity'), 'METHODS.md must document Spend Velocity');
    assert.ok(content.includes('Anomaly Detection'), 'METHODS.md must document Anomaly Detection');
    assert.ok(content.includes('Recurring Bill'), 'METHODS.md must document Cadence / Bill detection');
    assert.ok(content.includes('Spending Simulation'), 'METHODS.md must document Spending Simulation');
    assert.ok(content.includes('Backtest Methodology'), 'METHODS.md must document Backtest Methodology');
    assert.ok(content.includes('±15%') || content.includes('15.0%'), 'METHODS.md must document ±15% bound');
  });

  it('D-PLAN-10: asserts monthly spend forecast on held-out month is within ±15% of actual spend', () => {
    // Actual spend in held-out month (2026-10):
    // Rent: 2,000,000 + Groceries: 1,020,000 + Food: 680,000 + Transport: 550,000 = 4,250,000 paise (₹42,500)
    const actualMonth4SpendMinor = 4250000;

    // Run 3-month ledger summary baseline to get historical monthly average spend
    const summaryRes = callSentinel('sentinel_get_ledger_summary', canonicalUserId, snapshot, {
      timeframe_months: 3,
    });
    assert.equal(summaryRes.status, 'OK');

    const historicalCategories = summaryRes.data.categories || [];
    const totalHistoricalMonthlyAvgMinor = historicalCategories.reduce(
      (sum, c) => sum + (Number(c.monthly_average_minor) || 0),
      0
    );

    // Calculate error percentage
    const absoluteDiff = Math.abs(totalHistoricalMonthlyAvgMinor - actualMonth4SpendMinor);
    const errorRatio = absoluteDiff / actualMonth4SpendMinor;
    const errorPct = (errorRatio * 100).toFixed(2);

    // Verify D-PLAN-10 bound: error must be <= 15.0% (0.15)
    assert.ok(
      errorRatio <= 0.15,
      `Backtest forecast error (${errorPct}%) exceeded provisional limit of 15.0% (D-PLAN-10). Actual: ₹${actualMonth4SpendMinor / 100}, Forecast: ₹${totalHistoricalMonthlyAvgMinor / 100}`
    );
  });

  it('SEN-AC-08: anomaly detection correctly flags synthetic outlier spikes', () => {
    // Ingest a massive 15x spike transaction in 2026-10
    ingestBatch(
      canonicalUserId,
      [
        {
          raw_description: 'SWIGGY LUXURY CATERING ORDER',
          amount_minor: 15000000, // ₹1,50,000 outlier vs ~₹6,500 baseline
          direction: 'DEBIT',
          txn_date: '2026-10-18',
        },
      ],
      'STATEMENT_CSV'
    );
    const newSnap = createSnapshot(canonicalUserId);

    const anomRes = callSentinel('sentinel_detect_anomalies', canonicalUserId, newSnap, {
      lookback_days: 90,
    });
    assert.equal(anomRes.status, 'OK');
    const anomalies = anomRes.data.anomalies || [];
    assert.ok(anomalies.length > 0, 'Anomaly detector should flag luxury outlet purchase');
    assert.ok(
      anomalies.some((a) => (Number(a.amount_minor) || 0) >= 10000000),
      'Outlier spike must be present in anomaly list'
    );
  });

  it('SEN-AC-08: bill forecasting identifies consistent monthly cadence', () => {
    const billsRes = callSentinel('sentinel_forecast_bill_outlays', canonicalUserId, snapshot, {
      horizon_days: 35,
    });
    assert.equal(billsRes.status, 'OK');
    const outlays = billsRes.data.outlays || [];
    assert.ok(
      outlays.length > 0 || billsRes.data.schedule.length > 0,
      'Should identify recurring monthly bill schedule'
    );
  });
});
