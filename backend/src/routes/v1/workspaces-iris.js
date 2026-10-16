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
const { registerProposal } = require('../../platform/action-service');
const { getStatus } = require('../../engines/categorizer');
const { getGoalsForUser, getCapsForUser } = require('../../platform/profile');

const router = express.Router();
router.use(requireAuth);

router.get('/workspaces/iris', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const targetMonth = req.query.target_month || snap.current_month_ist;
  const surplusRes = gw.call('sentinel_get_surplus_baseline', {});
  const ledgerRes = gw.call('sentinel_get_ledger_summary', { timeframe_months: 3 });
  const billsRes = gw.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
  const riskRes = gw.call('sentinel_flag_cashflow_risk', {
    horizon_days: 30,
    outlays: { $ref: `${billsRes.tool_result_id}:/data/outlays` },
  });
  const anomRes = gw.call('sentinel_detect_anomalies', { lookback_days: 90 });
  const simRes = gw.call('sentinel_run_spending_simulation', { target_month: targetMonth });

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    baseline: surplusRes,
    surplus_baseline: surplusRes.data,
    spending_summary: ledgerRes,
    ledger_summary: ledgerRes.data,
    bill_forecast: billsRes,
    upcoming_bills: billsRes.data,
    cashflow_risk: riskRes,
    anomalies: anomRes,
    simulation: simRes,
    simulation_confidence: simRes.confidence,
    goals: getGoalsForUser(canonicalUserId, false, targetMonth),
    caps: getCapsForUser(canonicalUserId, targetMonth),
  });
});

router.post('/workspaces/iris/simulate', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const body = req.body || {};
  const targetMonth = body.target_month || snap.current_month_ist;
  const simRes = gw.call('sentinel_run_spending_simulation', {
    target_month: targetMonth,
    cap_changes: body.cap_changes || [],
    goal_changes: body.goal_changes || [],
    category_adjustments: body.category_adjustments || [],
    one_off_outlays: body.one_off_outlays || [],
  });

  const riskRes = gw.call('sentinel_flag_cashflow_risk', { horizon_days: 30 });

  const proposals = [];
  if (body.create_proposals && Array.isArray(body.cap_changes)) {
    for (const ch of body.cap_changes.slice(0, 3)) {
      const val = gw.call('sentinel_validate_cap_change', {
        category_id: ch.category_id,
        new_cap_minor: ch.new_cap_minor,
        scope: 'MONTH',
        period: targetMonth,
      });
      if (val.data?.verdict === 'PASS') {
        proposals.push(
          registerProposal({
            userId: canonicalUserId,
            snapshotId: snap.snapshot_id,
            origin: 'UI_FORM',
            proposer: 'USER',
            actionType: 'ADJUST_BUDGET_CAP',
            targetEntityType: 'CAP',
            targetEntityId: ch.category_id,
            params: {
              category_id: ch.category_id,
              new_cap_minor: ch.new_cap_minor,
              scope: 'MONTH',
              period: targetMonth,
            },
            validationToolResultId: val.tool_result_id,
          })
        );
      }
    }
  }

  res.json({
    success: true,
    simulation: simRes,
    confidence: simRes.confidence,
    constraints: simRes.constraints_triggered,
    cashflow_risk: riskRes,
    proposals,
  });
});

module.exports = router;
