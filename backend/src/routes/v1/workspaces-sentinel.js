/**
 * FinMate AI — `/api/v1/*` Authoritative Workspace, Chat, Action, Categorizer & Settings API
 * (SC §17.4, §18, Atlas §B.4, Nova §B.4, Iris §B.4, Sentinel §B.8, John §K.1)
 *
 * Split out of routes/v1/index.js by WS-FND-P1. Handler bodies are moved
 * verbatim; only the file-local require block changes.
 */

const express = require('express');
const db = require('../../db');
const { newId } = require('../../shared/ids');
const { requireAuth } = require('./_shared');

const { toCanonicalUserId } = require('../../shared/ids');
const { createSnapshot } = require('../../platform/snapshot');
const { createGatewaySession } = require('../../platform/gateway');
const { getCanonicalProfile } = require('../../platform/profile');
const { CATEGORIES, getTransactionsAsOf, getStatus, getReviewQueue } = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

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
    profile,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    baseline: surplusRes,
    surplus_baseline: surplusRes.data,
    spending_summary: summaryRes,
    ledger_summary: summaryRes.data,
    timeseries: timeseriesRes,
    bill_forecast: billsRes,
    cashflow_risk: riskRes,
    anomalies: anomaliesRes,
    available_balance: balanceRes.data,
    health_score: healthRes,
    review_queue: reviewQueue,
    transactions,
    declared_bills: profile.declared_bills,
    accounts: profile.accounts,
    taxonomy: CATEGORIES,
  });
});

module.exports = router;
