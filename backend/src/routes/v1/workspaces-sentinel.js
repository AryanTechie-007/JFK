/**
 * FinMate AI — `/api/v1/workspaces/sentinel/*`
 * (SC §17.4, §18, Sentinel §B.6.18, Doc 2 §6, WS-SEN-P2)
 *
 * Authoritative Workspace Views for Sentinel:
 * - GET /workspaces/sentinel/overview (Balances, coverage, upcoming bills, health score)
 * - GET /workspaces/sentinel/spending (Spending breakdown with parent rollups and top merchants)
 * - GET /workspaces/sentinel/timeseries (Granular spending timeseries buckets)
 * - GET /workspaces/sentinel/forecast (Bill outlays, cash-flow risk, and anomaly projections)
 * - GET /workspaces/sentinel (Aggregate view maintained for backwards compatibility)
 */

const express = require('express');
const { requireAuth } = require('./_shared');
const { toCanonicalUserId } = require('../../shared/ids');
const { createSnapshot } = require('../../platform/snapshot');
const { createGatewaySession } = require('../../platform/gateway');
const { getCanonicalProfile } = require('../../platform/profile');
const {
  CATEGORIES,
  getTransactionsAsOf,
  getStatus,
  getReviewQueue,
} = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /workspaces/sentinel/overview
 */
router.get('/workspaces/sentinel/overview', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const availableBalance = gw.call('sentinel_check_available_balance', { amount_minor: 0 });
  const surplus = gw.call('sentinel_get_surplus_baseline', {});
  const upcomingBills = gw.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
  const healthScore = gw.call('sentinel_compute_health_score', {});
  const profile = getCanonicalProfile(canonicalUserId);

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    as_of_date: snap.current_date_ist,
    balances: profile.accounts || [],
    available_balance: availableBalance,
    surplus,
    upcoming_bills: upcomingBills,
    health_score: healthScore,
  });
});

/**
 * GET /workspaces/sentinel/spending
 */
router.get('/workspaces/sentinel/spending', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const period = req.query.period || snap.current_month_ist;
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const summary = gw.call('sentinel_get_ledger_summary', { timeframe_months: 1 });
  const ledgerData = summary.data || {};
  const ledgerCats = ledgerData.categories || [];

  // Build categories array matching SentinelSpendingResponse schema
  const categories = CATEGORIES.map((cat) => {
    const matched = ledgerCats.find((c) => c.category_id === cat.category_id);
    const totalMinor = matched ? Number(matched.total_signed_minor) || 0 : 0;
    return {
      category_id: cat.category_id,
      parent_category_id: cat.parent_category_id || null,
      name: cat.display_name,
      total_minor: totalMinor,
      count: matched ? matched.count || 0 : 0,
      is_parent: Boolean(cat.is_parent),
    };
  });

  // Extract top merchants across categories
  const topMerchantsMap = new Map();
  for (const c of ledgerCats) {
    if (Array.isArray(c.top_merchants)) {
      for (const m of c.top_merchants) {
        const cur = topMerchantsMap.get(m.merchant_name) || {
          merchant_name: m.merchant_name,
          total_minor: 0,
          count: 0,
        };
        cur.total_minor += Number(m.total_minor) || 0;
        cur.count += Number(m.count) || 1;
        topMerchantsMap.set(m.merchant_name, cur);
      }
    }
  }
  const topMerchants = Array.from(topMerchantsMap.values()).sort(
    (a, b) => b.total_minor - a.total_minor
  );

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    period,
    summary,
    categories,
    top_merchants: topMerchants,
    uncategorized_total_minor: Math.max(0, Number(ledgerData.uncategorized_minor) || 0),
    unclassified_total_minor: Math.max(0, Number(ledgerData.unclassified_movement_minor) || 0),
  });
});

/**
 * GET /workspaces/sentinel/timeseries
 */
router.get('/workspaces/sentinel/timeseries', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const granularity = String(req.query.granularity || 'MONTH').toUpperCase();
  const validGranularity = ['MONTH', 'WEEK', 'DAY'].includes(granularity) ? granularity : 'MONTH';
  const months = Number(req.query.months) || 6;
  const categoryId = req.query.category_id || undefined;

  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const timeseries = gw.call('sentinel_get_spending_timeseries', {
    granularity: validGranularity,
    months,
    category_scope: categoryId ? [categoryId] : undefined,
  });

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    granularity: validGranularity,
    timeseries,
    buckets: timeseries.data?.buckets || [],
  });
});

/**
 * GET /workspaces/sentinel/forecast
 */
router.get('/workspaces/sentinel/forecast', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const horizonDays = Math.min(90, Math.max(1, Number(req.query.horizon_days) || 30));

  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const billsForecast = gw.call('sentinel_forecast_bill_outlays', { horizon_days: horizonDays });
  const cashflowRisk = gw.call('sentinel_flag_cashflow_risk', {
    horizon_days: horizonDays,
    outlays: { $ref: `${billsForecast.tool_result_id}:/data/outlays` },
  });
  const anomalies = gw.call('sentinel_detect_anomalies', { lookback_days: 90 });

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    horizon_days: horizonDays,
    bills_forecast: billsForecast,
    cashflow_risk: cashflowRisk,
    anomalies,
  });
});

/**
 * GET /workspaces/sentinel (Aggregate view)
 */
router.get('/workspaces/sentinel', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 15,
  });

  const timeframeMonths = Number(req.query.timeframe_months) || 1;
  const surplusRes = gw.call('sentinel_get_surplus_baseline', {});
  const summaryRes = gw.call('sentinel_get_ledger_summary', { timeframe_months: timeframeMonths });
  const timeseriesRes = gw.call('sentinel_get_spending_timeseries', { months: 6 });
  const billsRes = gw.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
  const riskRes = gw.call('sentinel_flag_cashflow_risk', {
    horizon_days: 30,
    outlays: { $ref: `${billsRes.tool_result_id}:/data/outlays` },
  });
  const anomaliesRes = gw.call('sentinel_detect_anomalies', { lookback_days: 90 });
  const balanceRes = gw.call('sentinel_check_available_balance', { amount_minor: 0 });
  const healthRes = gw.call('sentinel_compute_health_score', {});

  const profile = getCanonicalProfile(canonicalUserId);
  const reviewQueue = getReviewQueue(canonicalUserId);
  const transactions = getTransactionsAsOf(canonicalUserId, snap.ledger_version, {
    category_id: req.query.category_id || undefined,
    month: req.query.month || undefined,
  }).slice(0, 200);

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    // SentinelAggregateResponse required keys
    surplus: surplusRes,
    summary: summaryRes,
    timeseries: timeseriesRes,
    bills: billsRes,
    cashflow_risk: riskRes,
    anomalies: anomaliesRes,
    available_balance: balanceRes,
    health_score: healthRes,
    profile,
    review_queue: reviewQueue,
    transactions,
    categories: CATEGORIES,

    // Aliases kept for backward compatibility with legacy consumers
    baseline: surplusRes,
    surplus_baseline: surplusRes.data,
    spending_summary: summaryRes,
    ledger_summary: summaryRes.data,
    bill_forecast: billsRes,
    declared_bills: profile.declared_bills,
    accounts: profile.accounts,
    taxonomy: CATEGORIES,
  });
});

module.exports = router;
