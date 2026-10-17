/**
 * FinMate AI — `/api/v1/workspaces/john`
 * (SC §17.4, John §K.1, Doc 2 §6, WS-SEN-P2)
 *
 * John Orchestrator Workspace / Health Strip.
 * Returns authoritative snapshot, data quality, and Sentinel health metrics.
 */

const express = require('express');
const { requireAuth } = require('./_shared');
const { toCanonicalUserId } = require('../../shared/ids');
const { createSnapshot } = require('../../platform/snapshot');
const { createGatewaySession } = require('../../platform/gateway');
const { getStatus } = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

router.get('/workspaces/john', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const surplusRes = gw.call('sentinel_get_surplus_baseline', {});
  const billsRes = gw.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
  const cashflowRes = gw.call('sentinel_flag_cashflow_risk', {
    horizon_days: 30,
    outlays: { $ref: `${billsRes.tool_result_id}:/data/outlays` },
  });

  const confidence = surplusRes.confidence || 'HIGH';
  const netSurplus = surplusRes.data?.net_surplus_signed_minor ?? 0;
  const conservativeSurplus = surplusRes.data?.conservative_net_surplus_signed_minor ?? netSurplus;

  const headline = {
    metric: 'MONTHLY_SURPLUS',
    amount_minor: confidence === 'HIGH' ? netSurplus : conservativeSurplus,
    conservative_amount_minor: conservativeSurplus,
    is_conservative: confidence !== 'HIGH',
    confidence,
  };

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    surplus: surplusRes,
    bills: billsRes,
    cashflow: cashflowRes,
    headline_figure: headline,
  });
});

module.exports = router;
