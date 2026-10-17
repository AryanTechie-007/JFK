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
const { getGoalsForUser } = require('../../platform/profile');
const { registerProposal } = require('../../platform/action-service');
const { getStatus } = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

router.get('/workspaces/atlas', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 25,
  });

  const surplusBaseline = gw.call('sentinel_get_surplus_baseline', {});
  const availableBalance = gw.call('sentinel_check_available_balance', { amount_minor: 0 });
  const goals = getGoalsForUser(canonicalUserId, false, snap.current_month_ist);

  const goalCards = goals.map((g) => {
    const prog = gw.call('sentinel_run_goal_progress', { goal_id: g.goal_id });
    return {
      goal: g,
      progress: prog.data,
      confidence: prog.confidence,
      tool_result_id: prog.tool_result_id,
    };
  });

  const archivedGoals = getGoalsForUser(canonicalUserId, true, snap.current_month_ist).filter(
    (g) => g.status === 'ARCHIVED'
  );

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    snapshot: snap,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    baseline: surplusBaseline,
    surplus_baseline: surplusBaseline.data,
    surplus_confidence: surplusBaseline.confidence,
    balance: availableBalance,
    available_balance: availableBalance.data,
    goals: goalCards.map((gc) => ({
      ...gc.goal,
      current_minor: Number(gc.goal.saved_minor) || 0,
      target_minor: Number(gc.goal.target_minor) || 1,
      progress: gc.progress,
      confidence: gc.confidence,
      tool_result_id: gc.tool_result_id,
    })),
    goal_cards: goalCards,
    archived_goals: archivedGoals,
  });
});

router.get('/workspaces/atlas/archived', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const archivedGoals = getGoalsForUser(canonicalUserId, true).filter(
    (g) => g.status === 'ARCHIVED'
  );
  res.json({ success: true, archived: archivedGoals, archived_goals: archivedGoals });
});

router.post('/workspaces/atlas/validate', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 6,
  });

  const body = req.body || {};
  const operation = body.operation || 'CREATE';
  const payload = body.payload ? { ...body.payload, goal_id: body.goal_id } : body;
  const valRes = gw.call('sentinel_validate_goal_change', { operation, ...payload });

  let feasibility = null;
  let balanceCheck = null;

  if (valRes.data?.verdict === 'PASS') {
    if (operation === 'CREATE' || (operation === 'UPDATE' && payload.monthly_add_minor != null)) {
      feasibility = gw.call('sentinel_run_goal_feasibility', {
        goal_id: payload.goal_id || null,
        proposed_monthly_add_minor: payload.monthly_add_minor || 0,
        target_minor: payload.target_minor,
        deadline: payload.deadline,
      });
    } else if (operation === 'ADD_FUNDS') {
      balanceCheck = gw.call('sentinel_check_available_balance', {
        amount_minor: payload.amount_minor,
      });
    }
  }

  const actionTypeMap = {
    CREATE: 'CREATE_GOAL',
    UPDATE: 'UPDATE_GOAL',
    SET_STATUS: 'SET_GOAL_STATUS',
    SET_MONTH_OVERRIDE: 'SET_GOAL_MONTH_OVERRIDE',
    ADD_FUNDS: 'ADD_FUNDS',
    RELEASE_FUNDS: 'RELEASE_FUNDS',
    RESTORE: 'RESTORE_GOAL',
  };
  const actionType = actionTypeMap[operation] || 'UPDATE_GOAL';

  const canCreateProposal =
    valRes.data?.verdict === 'PASS' &&
    (!feasibility || feasibility.data?.verdict !== 'SHORTFALL') &&
    (!balanceCheck || balanceCheck.data?.verdict === 'OK');

  let proposal = null;
  if (canCreateProposal) {
    const cleanParams = { ...payload };
    delete cleanParams.operation;
    proposal = registerProposal({
      userId: canonicalUserId,
      snapshotId: snap.snapshot_id,
      origin: 'UI_FORM',
      proposer: 'USER',
      actionType,
      targetEntityType: 'GOAL',
      targetEntityId: payload.goal_id || null,
      params: cleanParams,
      validationToolResultId: valRes.tool_result_id,
    });
  }

  res.json({
    success: true,
    validation: valRes,
    feasibility,
    balance_check: balanceCheck,
    proposal,
  });
});

router.post('/workspaces/atlas/sip', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 2,
  });

  const body = req.body || {};
  if (body.annual_rate_bp == null) {
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Please supply an assumed annual return rate (annual_rate_bp) for the illustrative SIP calculator.',
      },
    });
  }

  const sipRes = gw.call('sentinel_project_sip', {
    monthly_amount_minor: body.monthly_amount_minor,
    annual_rate_bp: body.annual_rate_bp,
    months: body.months || 60,
    annual_step_up_bp: body.annual_step_up_bp || 0,
  });

  res.json({
    success: true,
    illustrative_only: true,
    disclaimer: 'Illustrative arithmetic projection based on your assumed rate. Not investment advice.',
    sip: sipRes,
    result: sipRes.data,
    envelope: sipRes,
  });
});

module.exports = router;
