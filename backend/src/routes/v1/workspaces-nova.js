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
const { scanUserBudgets } = require('../../platform/budget-monitor');
const { CATEGORIES, getStatus } = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

router.get('/workspaces/nova', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const period = req.query.period || undefined;
  const alerts = scanUserBudgets(canonicalUserId);

  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const utilRes = gw.call('sentinel_run_category_utilization', { period });
  const velRes = gw.call('sentinel_run_velocity_projection', { period });
  const anomRes = gw.call('sentinel_detect_anomalies', { lookback_days: 60 });
  const surplusRes = gw.call('sentinel_get_surplus_baseline', {});

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    month: snap.current_month_ist,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    utilization: utilRes,
    velocity: velRes,
    anomalies: anomRes.data?.anomalies || [],
    surplus_baseline: surplusRes.data,
    alerts,
    taxonomy: CATEGORIES.filter((c) => c.direction === 'DEBIT'),
  });
});

router.post('/workspaces/nova/validate-cap', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 4,
  });

  const body = req.body || {};
  const newCapMinor = body.new_cap_minor ?? body.proposed_cap_minor;
  const valRes = gw.call('sentinel_validate_cap_change', {
    category_id: body.category_id,
    new_cap_minor: newCapMinor,
    scope: body.scope || 'STANDING',
    period: body.period || snap.current_month_ist,
    override_protected: Boolean(body.override_protected),
  });

  let proposal = null;
  if (valRes.data?.verdict === 'PASS') {
    proposal = registerProposal({
      userId: canonicalUserId,
      snapshotId: snap.snapshot_id,
      origin: 'UI_FORM',
      proposer: 'USER',
      actionType: 'ADJUST_BUDGET_CAP',
      targetEntityType: 'CAP',
      targetEntityId: body.category_id,
      params: {
        category_id: body.category_id,
        new_cap_minor: newCapMinor,
        scope: body.scope || 'STANDING',
        period: valRes.data.period,
        override_protected: Boolean(body.override_protected),
      },
      validationToolResultId: valRes.tool_result_id,
    });
  }

  res.json({
    success: true,
    validation: valRes,
    proposal,
  });
});

router.post('/workspaces/nova/rebalance', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 4,
  });

  const body = req.body || {};
  const rebRes = gw.call('sentinel_run_rebalance_simulation', {
    target_category_id: body.target_category_id,
    needed_minor: body.needed_minor,
    period: body.period || snap.current_month_ist,
  });

  let proposal = null;
  if (rebRes.status === 'OK' && rebRes.data?.transfers?.length > 0) {
    proposal = registerProposal({
      userId: canonicalUserId,
      snapshotId: snap.snapshot_id,
      origin: 'UI_FORM',
      proposer: 'USER',
      actionType: 'APPLY_REBALANCE',
      targetEntityType: 'CAP',
      targetEntityId: body.target_category_id,
      params: {
        period: rebRes.data.period,
        transfers: rebRes.data.transfers,
      },
      validationToolResultId: rebRes.tool_result_id,
    });
  }

  res.json({
    success: true,
    rebalance: rebRes,
    envelope: rebRes,
    proposal,
  });
});

module.exports = router;
