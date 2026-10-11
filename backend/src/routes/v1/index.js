/**
 * FinMate AI — `/api/v1/*` Authoritative Workspace, Chat, Action, Categorizer & Settings API
 * (SC §17.4, §18, Atlas §B.4, Nova §B.4, Iris §B.4, Sentinel §B.8, John §K.1)
 */

const express = require('express');
const db = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { newId, toCanonicalUserId } = require('../../shared/ids');
const { createSnapshot } = require('../../platform/snapshot');
const { createGatewaySession } = require('../../platform/gateway');
const {
  getCanonicalProfile,
  getGoalsForUser,
  getCapsForUser,
} = require('../../platform/profile');
const {
  registerProposal,
  executeAction,
  undoAction,
} = require('../../platform/action-service');
const { scanUserBudgets } = require('../../platform/budget-monitor');
const {
  TAXONOMY_VERSION,
  CATEGORIES,
  PARENT_CATEGORIES,
  ingestTransactions,
  getTransactionsAsOf,
  getStatus,
  getReviewQueue,
} = require('../../engines/categorizer');
const { handleChatRequest } = require('../../agents/john');

const router = express.Router();
router.use(requireAuth);

// ============================================================================
// 1. JOHN ORCHESTRATOR & CHAT (`/api/v1/chat`)
// ============================================================================
router.post('/chat', async (req, res) => {
  try {
    const response = await handleChatRequest(req.userId, req.body || {});
    res.json(response);
  } catch (err) {
    console.error('Error in POST /api/v1/chat:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ============================================================================
// 2. ACTION SERVICE (`/api/v1/actions/*`)
// ============================================================================
router.post('/actions/propose', (req, res) => {
  try {
    const body = req.body || {};
    const proposal = registerProposal({
      userId: req.userId,
      origin: body.origin || 'UI_FORM',
      proposer: 'USER',
      actionType: body.action_type,
      targetEntityType: body.target_entity?.type || 'PLAN',
      targetEntityId: body.target_entity?.id || null,
      params: body.params || {},
      rationale: body.rationale || null,
      validationToolResultId: body.validation_tool_result_id || null,
      impactPreview: body.impact_preview || {},
    });
    res.status(201).json({ success: true, proposal });
  } catch (err) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: err.message } });
  }
});

router.post('/actions/execute', (req, res) => {
  try {
    const body = req.body || {};
    // Allow direct UI execution if confirmation_token is provided OR auto-register UI_FORM proposal when execute_direct is requested
    let requestPayload = body;
    if (!body.proposal_id && body.action_type) {
      const prop = registerProposal({
        userId: req.userId,
        origin: 'UI_FORM',
        proposer: 'USER',
        actionType: body.action_type,
        params: body.params || {},
      });
      requestPayload = {
        ...body,
        proposal_id: prop.proposal_id,
        confirmation_token: prop.confirmation_token,
      };
    }
    const result = executeAction(req.userId, requestPayload);
    res.json(result);
  } catch (err) {
    console.error('Error in POST /api/v1/actions/execute:', err);
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: err.message } });
  }
});

router.post('/actions/:id/undo', (req, res) => {
  try {
    const result = undoAction(req.userId, req.params.id);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/actions/history', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const rows = db
    .prepare('SELECT * FROM action_ledger WHERE user_id = ? ORDER BY executed_at DESC LIMIT 30')
    .all(canonicalUserId);
  res.json({
    actions: rows.map((r) => ({
      ...r,
      params: JSON.parse(r.params_json || '{}'),
      new_versions: JSON.parse(r.new_versions_json || '{}'),
      undo_available: Boolean(
        r.reversible_until &&
          new Date(r.reversible_until) > new Date() &&
          !r.undone_by_action_id
      ),
    })),
  });
});

// ============================================================================
// 3. ATLAS WORKSPACE (`/api/v1/workspaces/atlas*`) — Deterministic, No LLM
// ============================================================================
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

// ============================================================================
// 4. NOVA WORKSPACE (`/api/v1/workspaces/nova*`) — Deterministic, No LLM
// ============================================================================
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

// ============================================================================
// 5. IRIS WORKSPACE (`/api/v1/workspaces/iris*`) — Deterministic, No LLM
// ============================================================================
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

// ============================================================================
// 6. SENTINEL WORKSPACE (`/api/v1/workspaces/sentinel*`) — Unified Observer (§B.6.18)
// ============================================================================
router.get('/workspaces/sentinel', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 15,
  });

  const timeframeMonths = Number(req.query.timeframe_months || req.query.months) || 1;
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

  const profile = getCanonicalProfile(canonicalUserId);
  const reviewQueue = getReviewQueue(canonicalUserId);
  const transactions = getTransactionsAsOf(canonicalUserId, snap.ledger_version, {
    category_id: req.query.category_id || undefined,
    month: req.query.month || undefined,
  }).slice(0, 200);

  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
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
    review_queue: reviewQueue,
    transactions,
    declared_bills: profile.declared_bills,
    accounts: profile.accounts,
    taxonomy: CATEGORIES,
  });
});

router.get('/workspaces/sentinel/spending', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 5,
  });
  const months = Math.min(12, Math.max(1, Number(req.query.months) || 3));
  const summaryRes = gw.call('sentinel_get_ledger_summary', { timeframe_months: months });
  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    result: summaryRes,
    data: summaryRes.data,
  });
});

router.get('/workspaces/sentinel/timeseries', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 5,
  });
  const tsRes = gw.call('sentinel_get_spending_timeseries', {
    granularity: req.query.granularity || 'MONTH',
    from_period: req.query.from || undefined,
    to_period: req.query.to || undefined,
    months: Number(req.query.months) || 6,
  });
  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    result: tsRes,
    data: tsRes.data,
  });
});

router.get('/workspaces/sentinel/forecast', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const gw = createGatewaySession({
    caller: 'WORKSPACE_API',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 5,
  });
  const horizonDays = Math.min(60, Math.max(1, Number(req.query.horizon_days) || 30));
  const billsRes = gw.call('sentinel_forecast_bill_outlays', { horizon_days: horizonDays });
  const riskRes = gw.call('sentinel_flag_cashflow_risk', {
    horizon_days: horizonDays,
    outlays: { $ref: `${billsRes.tool_result_id}:/data/outlays` },
  });
  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    bill_forecast: billsRes,
    cashflow_risk: riskRes,
  });
});

router.get('/workspaces/sentinel/overview', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const profile = getCanonicalProfile(canonicalUserId);
  const dq = getStatus(canonicalUserId, snap.ledger_version);
  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
    data_quality: dq,
    accounts: profile.accounts,
    declared_bills: profile.declared_bills,
  });
});

router.get('/transactions', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  const txns = getTransactionsAsOf(canonicalUserId, snap.ledger_version, {
    category_id: req.query.category_id || undefined,
    month: req.query.month || undefined,
  });
  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    transactions: txns,
  });
});

router.get('/transactions/:id', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const row = db
    .prepare('SELECT * FROM transactions_v1 WHERE txn_id = ? AND user_id = ?')
    .get(req.params.id, canonicalUserId);
  if (!row) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
  }
  const history = db
    .prepare('SELECT * FROM categorization_history WHERE txn_id = ? AND user_id = ? ORDER BY version DESC')
    .all(req.params.id, canonicalUserId);
  res.json({ success: true, transaction: row, history });
});

router.get('/review-queue', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const snap = createSnapshot(canonicalUserId);
  res.json({
    success: true,
    snapshot_id: snap.snapshot_id,
    as_of_date: snap.current_date_ist,
    data_quality: getStatus(canonicalUserId, snap.ledger_version),
    items: getReviewQueue(req.userId),
  });
});

// ============================================================================
// 7. CATEGORIZER & INGESTION (`/api/v1/categorizer/*`, `/api/v1/ingest/*`)
// ============================================================================
router.get('/categorizer/status', (req, res) => {
  res.json(getStatus(req.userId));
});

router.get('/categorizer/taxonomy', (_req, res) => {
  res.json({
    taxonomy_version: TAXONOMY_VERSION,
    categories: CATEGORIES,
    parent_categories: PARENT_CATEGORIES,
  });
});

router.get('/categorizer/review-queue', (req, res) => {
  res.json({ items: getReviewQueue(req.userId) });
});

router.post('/ingest/batch', (req, res) => {
  try {
    const items = req.body?.items || req.body?.lines || [];
    const result = ingestTransactions(req.userId, items, req.body?.source || 'STATEMENT_IMPORT');
    scanUserBudgets(req.userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: err.message } });
  }
});

router.post('/ingest/manual', (req, res) => {
  try {
    const item = req.body || {};
    const result = ingestTransactions(req.userId, [item], 'MANUAL_USER');
    scanUserBudgets(req.userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: err.message } });
  }
});

// ============================================================================
// 8. SETTINGS, PROFILE, RULES & MEMORY FACTS (`/api/v1/settings*`, `/api/v1/memory*`)
// ============================================================================
router.get('/settings', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const profile = getCanonicalProfile(canonicalUserId);
  const rules = db
    .prepare('SELECT * FROM category_rules WHERE user_id = ? AND active = 1 ORDER BY priority ASC')
    .all(canonicalUserId);
  const memoryFacts = db
    .prepare('SELECT * FROM memory_facts WHERE user_id = ? ORDER BY created_at DESC')
    .all(canonicalUserId);

  res.json({
    success: true,
    profile,
    category_rules: rules,
    memory_facts: memoryFacts,
    taxonomy: CATEGORIES,
  });
});

router.get('/settings/category-rules', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const rules = db
    .prepare('SELECT * FROM category_rules WHERE user_id = ? AND active = 1 ORDER BY priority ASC')
    .all(canonicalUserId);
  res.json({ success: true, rules });
});

router.get('/settings/memory-facts', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const facts = db
    .prepare('SELECT * FROM memory_facts WHERE user_id = ? ORDER BY created_at DESC')
    .all(canonicalUserId);
  res.json({ success: true, facts });
});

router.post('/memory/facts', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const factId = newId('mf');
  db.prepare(
    `INSERT INTO memory_facts (fact_id, user_id, text, created_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(factId, canonicalUserId, text.slice(0, 200));
  res.status(201).json({
    fact: db.prepare('SELECT * FROM memory_facts WHERE fact_id = ?').get(factId),
  });
});

router.delete('/memory/facts/:fact_id', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  db.prepare('DELETE FROM memory_facts WHERE fact_id = ? AND user_id = ?').run(
    req.params.fact_id,
    canonicalUserId
  );
  res.json({ deleted: true });
});

module.exports = router;
