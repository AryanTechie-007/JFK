/**
 * Action Service (SC §13.1–§13.7, §17.2)
 * Single writer gate for all user-confirmed state mutations across Plan Store,
 * Categorizer, and Profile Service. Implements 12-step pre-execution verification,
 * confirmation tokens, idempotency, optimistic concurrency, and reversible undo.
 */

const crypto = require('crypto');
const db = require('../db');
const { newId, toCanonicalUserId, toNumericUserId } = require('../shared/ids');
const { minorToRupees } = require('../shared/money');
const {
  getActionSpec,
  canPropose,
  isProhibitedT4,
} = require('../shared/contracts/action-registry');
const { currentVersions, bumpVersion, createSnapshot } = require('./snapshot');
const { loadSnapshotState, rules, sentinel_run_goal_feasibility, sentinel_run_rebalance_simulation } = require('../engines/sentinel');
const { ingestTransactions, incrementLedgerVersion } = require('../engines/categorizer');
const { getCategoryDisplayName } = require('../engines/categorizer/taxonomy');

function hashParams(params) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(params || {}))
    .digest('hex');
}

/**
 * Registers a proposal in `proposals_v1` and mints a `confirmation_token` (`cnf_...`)
 */
function registerProposal(opts = {}) {
  const {
    userId,
    requestId = null,
    snapshotId = null,
    snapshot = null,
    proposal = null,
    origin = 'AGENT',
    proposer = 'USER',
    targetEntityType = 'PLAN',
    targetEntityId = null,
    impactPreview = {},
    dependsOnProposalId = null,
  } = opts;
  const actionType = opts.actionType || proposal?.action_type;
  const params = opts.params || proposal?.params || {};
  const rationale = opts.rationale || proposal?.rationale || null;
  const validationToolResultId =
    opts.validationToolResultId || proposal?.validation_tool_result_id || null;
  const resolvedSnapshotId = snapshotId || snapshot?.snapshot_id || null;

  const canonicalUserId = toCanonicalUserId(userId);
  const spec = getActionSpec(actionType);
  if (!spec) {
    throw new Error(`Unregistered action_type: ${actionType}`);
  }
  if (!canPropose(proposer, actionType)) {
    throw new Error(`Proposer ${proposer} is not permitted to propose ${actionType}`);
  }

  const snap = resolvedSnapshotId
    ? { snapshot_id: resolvedSnapshotId, ...currentVersions(canonicalUserId) }
    : createSnapshot(canonicalUserId);

  const proposalId = newId('prp');
  const reqId = requestId || newId('req');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15m TTL

  const preconditions = {
    base_versions: {
      ledger_version: snap.ledger_version,
      plan_version: snap.plan_version,
      profile_version: snap.profile_version,
      rules_version: snap.rules_version,
    },
  };

  const rationaleObj = rationale || {
    text: `Proposed ${actionType}`,
    evidence_kind: 'RECOMMENDATION',
    citations: validationToolResultId ? [validationToolResultId] : [],
  };

  db.prepare(
    `INSERT INTO proposals_v1 (
      proposal_id, user_id, request_id, snapshot_id, origin, proposer,
      action_type, tier, target_entity_type, target_entity_id,
      params_json, rationale_json, validation_tool_result_id,
      impact_preview_json, preconditions_json, reversible, undo_window_s,
      depends_on_proposal_id, status, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
  ).run(
    proposalId,
    canonicalUserId,
    reqId,
    snap.snapshot_id,
    origin,
    proposer,
    actionType,
    spec.tier,
    targetEntityType,
    targetEntityId,
    JSON.stringify(params),
    JSON.stringify(rationaleObj),
    validationToolResultId,
    JSON.stringify(impactPreview),
    JSON.stringify(preconditions),
    spec.reversible ? 1 : 0,
    spec.undo_window_s,
    dependsOnProposalId,
    expiresAt,
    now.toISOString()
  );

  // Mint confirmation token (SC §13.5)
  const tokenId = newId('cnf');
  db.prepare(
    `INSERT INTO confirmation_tokens (
      token_id, proposal_id, user_id, action_type, params_hash,
      snapshot_id, tier, issued_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tokenId,
    proposalId,
    canonicalUserId,
    actionType,
    hashParams(params),
    snap.snapshot_id,
    spec.tier,
    now.toISOString(),
    expiresAt
  );

  return {
    schema: 'Proposal@1',
    proposal_id: proposalId,
    request_id: reqId,
    snapshot_id: snap.snapshot_id,
    origin,
    proposer,
    action_type: actionType,
    tier: spec.tier,
    target_entity: { type: targetEntityType, id: targetEntityId },
    params,
    rationale: rationaleObj,
    validation_tool_result_id: validationToolResultId,
    impact_preview: impactPreview,
    preconditions,
    reversible: spec.reversible,
    undo_window_s: spec.undo_window_s,
    depends_on_proposal_id: dependsOnProposalId,
    confirmation_token: tokenId,
    expires_at: expiresAt,
    status: 'PENDING',
  };
}

/**
 * Executes a confirmed ActionRequest@1 (SC §13.6)
 */
function executeAction(userIdOrObj, actionRequest = {}) {
  const isSingleObj =
    typeof userIdOrObj === 'object' && userIdOrObj !== null && !Array.isArray(userIdOrObj);
  const resolvedUserId = isSingleObj ? userIdOrObj.userId || userIdOrObj.user_id : userIdOrObj;
  const reqObj = isSingleObj ? userIdOrObj : actionRequest;

  const canonicalUserId = toCanonicalUserId(resolvedUserId);
  const numericUserId = toNumericUserId(resolvedUserId);

  const {
    proposal_id = reqObj.proposalId || null,
    confirmation_token = reqObj.confirmationToken || null,
    idempotency_key = newId('itk'),
    action_type: rawActionType,
    params: rawParams,
    base_versions: rawBaseVersions,
    acknowledged_warnings = Boolean(reqObj.acknowledgment),
  } = reqObj;

  // Step 1: Check idempotency key first
  const existingAction = db
    .prepare('SELECT * FROM action_ledger WHERE idempotency_key = ? AND user_id = ?')
    .get(idempotency_key, canonicalUserId);

  if (existingAction) {
    return {
      schema: 'ActionResult@1',
      action_id: existingAction.action_id,
      proposal_id: existingAction.proposal_id,
      status: 'DUPLICATE',
      executed_at: existingAction.executed_at,
      new_versions: JSON.parse(existingAction.new_versions_json || '{}'),
      undo_available: Boolean(
        existingAction.reversible_until &&
          new Date(existingAction.reversible_until) > new Date() &&
          !existingAction.undone_by_action_id
      ),
      undo_expires_at: existingAction.reversible_until,
      rejection_reasons: [],
      message_data: JSON.parse(existingAction.params_json || '{}'),
    };
  }

  // Step 2: Load proposal if proposal_id provided
  let proposalRow = null;
  if (proposal_id) {
    proposalRow = db
      .prepare('SELECT * FROM proposals_v1 WHERE proposal_id = ? AND user_id = ?')
      .get(proposal_id, canonicalUserId);
    if (!proposalRow) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_INVALID_TOKEN',
        executed_at: null,
        new_versions: currentVersions(canonicalUserId),
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'Proposal not found' },
      };
    }
    if (new Date(proposalRow.expires_at) < new Date()) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_EXPIRED',
        executed_at: null,
        new_versions: currentVersions(canonicalUserId),
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'Proposal expired' },
      };
    }
    if (proposalRow.depends_on_proposal_id) {
      const dep = db
        .prepare('SELECT status FROM proposals_v1 WHERE proposal_id = ?')
        .get(proposalRow.depends_on_proposal_id);
      if (!dep || dep.status !== 'EXECUTED') {
        return {
          schema: 'ActionResult@1',
          action_id: newId('act'),
          proposal_id,
          status: 'REJECTED_VALIDATION',
          executed_at: null,
          new_versions: currentVersions(canonicalUserId),
          undo_available: false,
          undo_expires_at: null,
          rejection_reasons: [],
          message_data: { reason: 'Dependent proposal must be confirmed first' },
        };
      }
    }
  }

  const actionType = proposalRow ? proposalRow.action_type : rawActionType;
  const params = proposalRow ? JSON.parse(proposalRow.params_json) : rawParams || {};
  const proposer = proposalRow ? proposalRow.proposer : 'USER';

  // Step 3: Reject T4 prohibited actions
  if (isProhibitedT4(actionType)) {
    return {
      schema: 'ActionResult@1',
      action_id: newId('act'),
      proposal_id,
      status: 'REJECTED_VALIDATION',
      executed_at: null,
      new_versions: currentVersions(canonicalUserId),
      undo_available: false,
      undo_expires_at: null,
      rejection_reasons: [],
      message_data: { code: 'PROHIBITED_ACTION' },
    };
  }

  const spec = getActionSpec(actionType);
  if (!spec || !canPropose(proposer, actionType)) {
    return {
      schema: 'ActionResult@1',
      action_id: newId('act'),
      proposal_id,
      status: 'REJECTED_INVALID_TOKEN',
      executed_at: null,
      new_versions: currentVersions(canonicalUserId),
      undo_available: false,
      undo_expires_at: null,
      rejection_reasons: [],
      message_data: { code: 'FORBIDDEN' },
    };
  }

  // Step 4: Verify confirmation token if proposal was registered
  if (proposalRow) {
    if (!confirmation_token) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_INVALID_TOKEN',
        executed_at: null,
        new_versions: currentVersions(canonicalUserId),
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'confirmation_token is required' },
      };
    }
    const tokenRow = db
      .prepare('SELECT * FROM confirmation_tokens WHERE token_id = ? AND proposal_id = ? AND user_id = ?')
      .get(confirmation_token, proposal_id, canonicalUserId);
    if (!tokenRow || tokenRow.used_at) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_INVALID_TOKEN',
        executed_at: null,
        new_versions: currentVersions(canonicalUserId),
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'Invalid or already used confirmation_token' },
      };
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_EXPIRED',
        executed_at: null,
        new_versions: currentVersions(canonicalUserId),
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'Confirmation token expired' },
      };
    }
  }

  // Step 5: T3 requires explicit acknowledgment
  if (spec.tier === 'T3' && !acknowledged_warnings) {
    return {
      schema: 'ActionResult@1',
      action_id: newId('act'),
      proposal_id,
      status: 'REJECTED_INVALID_TOKEN',
      executed_at: null,
      new_versions: currentVersions(canonicalUserId),
      undo_available: false,
      undo_expires_at: null,
      rejection_reasons: [],
      message_data: { reason: 'T3 destructive action requires acknowledged_warnings = true' },
    };
  }

  // Step 6: Optimistic concurrency check on base_versions (if supplied)
  const liveVersions = currentVersions(canonicalUserId);
  const checkVersions =
    rawBaseVersions ||
    (proposalRow ? JSON.parse(proposalRow.preconditions_json || '{}').base_versions : null);

  if (checkVersions) {
    if (
      spec.domain_store === 'PLAN_STORE' &&
      checkVersions.plan_version != null &&
      checkVersions.plan_version !== liveVersions.plan_version
    ) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_STALE',
        executed_at: null,
        new_versions: liveVersions,
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'Plan version changed since proposal was created' },
      };
    }
  }

  // Step 7: Re-run Sentinel validator against live state (SC §13.6 step 6)
  const liveSnap = createSnapshot(canonicalUserId);
  const liveState = loadSnapshotState(liveSnap, canonicalUserId);

  if (spec.sentinel_validator === 'sentinel_validate_goal_change') {
    const valRes = rules.validateGoalChangeRule(liveState, {
      operation: spec.validator_op,
      ...params,
    });
    if (valRes.verdict !== 'PASS') {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_VALIDATION',
        executed_at: null,
        new_versions: liveVersions,
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: valRes.constraints,
        message_data: { verdict: valRes.verdict },
      };
    }
    if (actionType === 'CREATE_GOAL' && (Number(params.monthly_add_minor) || 0) > 0) {
      const feasRes = sentinel_run_goal_feasibility(liveState, {
        goal_id: null,
        proposed_monthly_add_minor: params.monthly_add_minor,
        target_minor: params.target_minor,
        deadline: params.deadline,
      });
      if (feasRes.data.verdict === 'SHORTFALL') {
        return {
          schema: 'ActionResult@1',
          action_id: newId('act'),
          proposal_id,
          status: 'REJECTED_VALIDATION',
          executed_at: null,
          new_versions: liveVersions,
          undo_available: false,
          undo_expires_at: null,
          rejection_reasons: feasRes.constraints_triggered.filter((c) => c.severity === 'MANDATORY'),
          message_data: { verdict: 'SHORTFALL' },
        };
      }
    }
    if (actionType === 'ADD_FUNDS') {
      const balRes = rules.checkAvailableBalanceRule(liveState, { amount_minor: params.amount_minor });
      if (balRes.verdict !== 'OK') {
        return {
          schema: 'ActionResult@1',
          action_id: newId('act'),
          proposal_id,
          status: 'REJECTED_VALIDATION',
          executed_at: null,
          new_versions: liveVersions,
          undo_available: false,
          undo_expires_at: null,
          rejection_reasons: balRes.constraints.filter((c) => c.severity === 'MANDATORY'),
          message_data: { verdict: balRes.verdict },
        };
      }
    }
  } else if (spec.sentinel_validator === 'sentinel_validate_cap_change') {
    const valRes = rules.validateCapChangeRule(liveState, {
      ...params,
      new_cap_minor: params.new_cap_minor ?? params.cap_minor,
      override_protected: proposer === 'USER' ? Boolean(params.override_protected) : false,
    });
    if (valRes.verdict !== 'PASS') {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_VALIDATION',
        executed_at: null,
        new_versions: liveVersions,
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: valRes.constraints,
        message_data: { verdict: valRes.verdict },
      };
    }
  } else if (spec.sentinel_validator === 'sentinel_run_rebalance_simulation') {
    const transfers = Array.isArray(params.transfers)
      ? params.transfers
      : Array.isArray(params.moves)
      ? params.moves
      : [];
    if (transfers.length === 0) {
      return {
        schema: 'ActionResult@1',
        action_id: newId('act'),
        proposal_id,
        status: 'REJECTED_VALIDATION',
        executed_at: null,
        new_versions: liveVersions,
        undo_available: false,
        undo_expires_at: null,
        rejection_reasons: [],
        message_data: { reason: 'No transfers in rebalance' },
      };
    }
  }

  // Step 8: Atomic SQLite mutation + version bump + action_ledger write
  const actionId = newId('act');
  const nowIso = new Date().toISOString();
  const reversibleUntil = spec.reversible
    ? new Date(Date.now() + spec.undo_window_s * 1000).toISOString()
    : null;

  const runAtomicMutation = db.transaction(() => {
    let previousState = {};
    let newVersions = liveVersions;

    switch (actionType) {
      case 'CREATE_GOAL': {
        const goalId = params.goal_id || newId('g');
        const pTier = String(params.priority_tier || 'MEDIUM').toUpperCase();
        const pRank = pTier === 'HIGH' ? 1 : pTier === 'MEDIUM' ? 2 : 3;

        const legacyInfo = db
          .prepare(
            `INSERT INTO goals (user_id, name, target_amount, saved_amount, monthly_allocation, priority, status, source)
             VALUES (?, ?, ?, 0, ?, ?, 'active', ?)`
          )
          .run(
            numericUserId,
            params.name,
            minorToRupees(params.target_minor),
            minorToRupees(params.monthly_add_minor || 0),
            pTier.toLowerCase(),
            proposer === 'USER' ? 'user' : 'john_proposal'
          );

        db.prepare(
          `INSERT INTO goals_v1 (
            goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor,
            deadline, priority_tier, priority_rank, status, version, legacy_goal_id
          ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'ACTIVE', 1, ?)`
        ).run(
          goalId,
          canonicalUserId,
          params.name,
          params.target_minor,
          params.monthly_add_minor || 0,
          params.deadline || null,
          pTier,
          pRank,
          legacyInfo.lastInsertRowid
        );

        previousState = { created_goal_id: goalId, legacy_goal_id: legacyInfo.lastInsertRowid };
        params.goal_id = goalId;
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'UPDATE_GOAL': {
        const cur = db
          .prepare('SELECT * FROM goals_v1 WHERE goal_id = ? AND user_id = ?')
          .get(params.goal_id, canonicalUserId);
        previousState = { goal: cur };
        const nextName = params.name ?? cur.name;
        const nextTarget = params.target_minor ?? cur.target_minor;
        const nextMonthly = params.monthly_add_minor ?? cur.monthly_add_minor;
        const nextDeadline = params.deadline !== undefined ? params.deadline : cur.deadline;
        const nextTier = params.priority_tier ?? cur.priority_tier;
        const nextRank = nextTier === 'HIGH' ? 1 : nextTier === 'MEDIUM' ? 2 : 3;

        db.prepare(
          `UPDATE goals_v1
           SET name = ?, target_minor = ?, monthly_add_minor = ?, deadline = ?,
               priority_tier = ?, priority_rank = ?, version = version + 1, updated_at = datetime('now')
           WHERE goal_id = ? AND user_id = ?`
        ).run(
          nextName,
          nextTarget,
          nextMonthly,
          nextDeadline,
          nextTier,
          nextRank,
          params.goal_id,
          canonicalUserId
        );

        if (cur.legacy_goal_id) {
          db.prepare(
            `UPDATE goals SET name = ?, target_amount = ?, monthly_allocation = ?, priority = ? WHERE id = ?`
          ).run(
            nextName,
            minorToRupees(nextTarget),
            minorToRupees(nextMonthly),
            nextTier.toLowerCase(),
            cur.legacy_goal_id
          );
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'SET_GOAL_STATUS': {
        const cur = db
          .prepare('SELECT * FROM goals_v1 WHERE goal_id = ? AND user_id = ?')
          .get(params.goal_id, canonicalUserId);
        previousState = { goal: cur };
        db.prepare(
          `UPDATE goals_v1 SET status = ?, version = version + 1, updated_at = datetime('now')
           WHERE goal_id = ? AND user_id = ?`
        ).run(params.status, params.goal_id, canonicalUserId);
        if (cur.legacy_goal_id) {
          db.prepare('UPDATE goals SET status = ? WHERE id = ?').run(
            String(params.status).toLowerCase(),
            cur.legacy_goal_id
          );
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'SET_GOAL_MONTH_OVERRIDE': {
        const period = params.period || liveState.current_month_ist;
        const curOv = db
          .prepare('SELECT * FROM goal_month_overrides WHERE user_id = ? AND goal_id = ? AND period = ?')
          .get(canonicalUserId, params.goal_id, period);
        previousState = { override: curOv || null, goal_id: params.goal_id, period };
        db.prepare(
          `INSERT OR REPLACE INTO goal_month_overrides (user_id, goal_id, period, monthly_add_minor, set_by_action_id)
           VALUES (?, ?, ?, ?, ?)`
        ).run(canonicalUserId, params.goal_id, period, params.monthly_add_minor, actionId);
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'ADD_FUNDS': {
        const cur = db
          .prepare('SELECT * FROM goals_v1 WHERE goal_id = ? AND user_id = ?')
          .get(params.goal_id, canonicalUserId);
        previousState = { goal: cur };
        const newSaved = (Number(cur.saved_minor) || 0) + Number(params.amount_minor);
        const newStatus = newSaved >= Number(cur.target_minor) ? 'COMPLETED' : cur.status;
        db.prepare(
          `UPDATE goals_v1 SET saved_minor = ?, status = ?, version = version + 1, updated_at = datetime('now')
           WHERE goal_id = ? AND user_id = ?`
        ).run(newSaved, newStatus, params.goal_id, canonicalUserId);
        if (cur.legacy_goal_id) {
          db.prepare('UPDATE goals SET saved_amount = ?, status = ? WHERE id = ?').run(
            minorToRupees(newSaved),
            newStatus.toLowerCase(),
            cur.legacy_goal_id
          );
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'RELEASE_FUNDS': {
        const cur = db
          .prepare('SELECT * FROM goals_v1 WHERE goal_id = ? AND user_id = ?')
          .get(params.goal_id, canonicalUserId);
        previousState = { goal: cur };
        const newSaved = Math.max(0, (Number(cur.saved_minor) || 0) - Number(params.amount_minor));
        const newStatus =
          cur.status === 'COMPLETED' && newSaved < Number(cur.target_minor) ? 'ACTIVE' : cur.status;
        db.prepare(
          `UPDATE goals_v1 SET saved_minor = ?, status = ?, version = version + 1, updated_at = datetime('now')
           WHERE goal_id = ? AND user_id = ?`
        ).run(newSaved, newStatus, params.goal_id, canonicalUserId);
        if (cur.legacy_goal_id) {
          db.prepare('UPDATE goals SET saved_amount = ?, status = ? WHERE id = ?').run(
            minorToRupees(newSaved),
            newStatus.toLowerCase(),
            cur.legacy_goal_id
          );
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'DELETE_GOAL': {
        const cur = db
          .prepare('SELECT * FROM goals_v1 WHERE goal_id = ? AND user_id = ?')
          .get(params.goal_id, canonicalUserId);
        previousState = { goal: cur };
        const restoreUntil = new Date(Date.now() + 30 * 86400000).toISOString();
        db.prepare(
          `UPDATE goals_v1
           SET status = 'ARCHIVED', archived_at = ?, restore_until = ?, version = version + 1, updated_at = datetime('now')
           WHERE goal_id = ? AND user_id = ?`
        ).run(nowIso, restoreUntil, params.goal_id, canonicalUserId);
        if (cur.legacy_goal_id) {
          db.prepare("UPDATE goals SET status = 'declined' WHERE id = ?").run(cur.legacy_goal_id);
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'RESTORE_GOAL': {
        const cur = db
          .prepare('SELECT * FROM goals_v1 WHERE goal_id = ? AND user_id = ?')
          .get(params.goal_id, canonicalUserId);
        previousState = { goal: cur };
        db.prepare(
          `UPDATE goals_v1
           SET status = 'PAUSED', archived_at = NULL, restore_until = NULL, version = version + 1, updated_at = datetime('now')
           WHERE goal_id = ? AND user_id = ?`
        ).run(params.goal_id, canonicalUserId);
        if (cur.legacy_goal_id) {
          db.prepare("UPDATE goals SET status = 'active' WHERE id = ?").run(cur.legacy_goal_id);
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'ADJUST_BUDGET_CAP': {
        const scope = params.scope || 'STANDING';
        const period = params.period || params.month || liveState.current_month_ist;
        const resolvedCapMinor = Number(params.new_cap_minor ?? params.cap_minor ?? 0);
        if (scope === 'MONTH') {
          const curOv = db
            .prepare('SELECT * FROM cap_month_overrides WHERE user_id = ? AND category_id = ? AND period = ?')
            .get(canonicalUserId, params.category_id, period);
          previousState = { override: curOv || null, category_id: params.category_id, period, scope: 'MONTH' };
          db.prepare(
            `INSERT OR REPLACE INTO cap_month_overrides (user_id, category_id, period, amount_minor, reason, set_by_action_id)
             VALUES (?, ?, ?, ?, 'USER_PLAN', ?)`
          ).run(canonicalUserId, params.category_id, period, resolvedCapMinor, actionId);
        } else {
          const curCap = db
            .prepare('SELECT * FROM caps_v1 WHERE user_id = ? AND category_id = ?')
            .get(canonicalUserId, params.category_id);
          previousState = { cap: curCap || null, category_id: params.category_id, scope: 'STANDING' };
          if (curCap) {
            db.prepare(
              `UPDATE caps_v1 SET amount_minor = ?, version = version + 1, updated_at = datetime('now')
               WHERE cap_id = ?`
            ).run(resolvedCapMinor, curCap.cap_id);
          } else {
            db.prepare(
              `INSERT INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, source, watching, version)
               VALUES (?, ?, ?, ?, 'STANDING', 'USER', 0, 1)`
            ).run(newId('cap'), canonicalUserId, params.category_id, resolvedCapMinor);
          }
          // Sync legacy budget_categories
          const displayCat = getCategoryDisplayName(params.category_id);
          db.prepare(
            `INSERT INTO budget_categories (user_id, category, monthly_cap) VALUES (?, ?, ?)
             ON CONFLICT(user_id, category) DO UPDATE SET monthly_cap = excluded.monthly_cap`
          ).run(numericUserId, displayCat, minorToRupees(resolvedCapMinor));
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'APPLY_REBALANCE': {
        const period = params.period || params.month || liveState.current_month_ist;
        const transfers = params.transfers || params.moves || [];
        const prevOverrides = [];
        for (const tr of transfers) {
          const fromCap = liveState.caps.find((c) => c.category_id === tr.from_category_id);
          const toCap = liveState.caps.find((c) => c.category_id === tr.to_category_id);
          if (!fromCap || !toCap) continue;
          const prevFromOv = db
            .prepare('SELECT * FROM cap_month_overrides WHERE user_id = ? AND category_id = ? AND period = ?')
            .get(canonicalUserId, tr.from_category_id, period);
          const prevToOv = db
            .prepare('SELECT * FROM cap_month_overrides WHERE user_id = ? AND category_id = ? AND period = ?')
            .get(canonicalUserId, tr.to_category_id, period);
          prevOverrides.push(
            { category_id: tr.from_category_id, prev: prevFromOv || null },
            { category_id: tr.to_category_id, prev: prevToOv || null }
          );

          const transferAmt = Number(tr.amount_minor ?? tr.transfer_minor ?? 0);
          const newFromAmt = Math.max(0, fromCap.effective_amount_minor - transferAmt);
          const newToAmt = toCap.effective_amount_minor + transferAmt;

          db.prepare(
            `INSERT OR REPLACE INTO cap_month_overrides (user_id, category_id, period, amount_minor, reason, set_by_action_id)
             VALUES (?, ?, ?, ?, 'REBALANCE', ?)`
          ).run(canonicalUserId, tr.from_category_id, period, newFromAmt, actionId);
          db.prepare(
            `INSERT OR REPLACE INTO cap_month_overrides (user_id, category_id, period, amount_minor, reason, set_by_action_id)
             VALUES (?, ?, ?, ?, 'REBALANCE', ?)`
          ).run(canonicalUserId, tr.to_category_id, period, newToAmt, actionId);
        }
        previousState = { period, prevOverrides };
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'SET_CATEGORY_WATCH': {
        const curCap = db
          .prepare('SELECT * FROM caps_v1 WHERE user_id = ? AND category_id = ?')
          .get(canonicalUserId, params.category_id);
        previousState = { cap: curCap };
        if (curCap) {
          db.prepare('UPDATE caps_v1 SET watching = ?, version = version + 1 WHERE cap_id = ?').run(
            params.watching ? 1 : 0,
            curCap.cap_id
          );
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'DISMISS_ALERT': {
        const curAlert = db
          .prepare('SELECT * FROM alerts_v1 WHERE alert_id = ? AND user_id = ?')
          .get(params.alert_id, canonicalUserId);
        previousState = { alert: curAlert };
        if (curAlert) {
          const cooldownUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
          db.prepare(
            `UPDATE alerts_v1 SET status = 'DISMISSED', cooldown_until = ?, updated_at = datetime('now')
             WHERE alert_id = ?`
          ).run(cooldownUntil, params.alert_id);
        }
        newVersions = bumpVersion(canonicalUserId, 'plan_version');
        break;
      }

      case 'CONFIRM_TRANSACTION_CATEGORY':
      case 'CORRECT_TRANSACTION_CATEGORY':
      case 'CONFIRM_PROVISIONAL_CATEGORY': {
        const curTxn = db
          .prepare('SELECT * FROM transactions_v1 WHERE txn_id = ? AND user_id = ?')
          .get(params.txn_id, canonicalUserId);
        if (!curTxn) throw new Error('Transaction not found');
        previousState = { txn: curTxn };
        const nextCat =
          actionType === 'CONFIRM_PROVISIONAL_CATEGORY'
            ? params.category_id || curTxn.category_id
            : params.category_id || curTxn.category_id;
        const nextMove = params.movement_type || curTxn.movement_type;
        const ver = incrementLedgerVersion(canonicalUserId);
        db.prepare(
          `UPDATE transactions_v1
           SET category_id = ?, movement_type = ?, classification_status = 'CONFIRMED',
               classification_confidence = 'HIGH', classification_confidence_bp = 10000,
               classification_source = 'USER', categorized_version = ?
           WHERE txn_id = ?`
        ).run(nextCat, nextMove, ver, curTxn.txn_id);

        db.prepare(
          `INSERT INTO categorization_history (
            txn_id, user_id, version, movement_type, category_id, classification_status,
            classification_confidence, classification_confidence_bp, classification_source, reason_code
          ) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'HIGH', 10000, 'USER', ?)`
        ).run(curTxn.txn_id, canonicalUserId, ver, nextMove, nextCat, actionType);

        db.prepare(
          `UPDATE review_items SET status = 'RESOLVED', resolved_at = datetime('now'), resolved_by_action_id = ?
           WHERE txn_id = ?`
        ).run(actionId, curTxn.txn_id);

        if (params.create_rule && curTxn.normalized_description) {
          db.prepare(
            `INSERT INTO category_rules (
              rule_id, user_id, match_type, pattern, direction, category_id, movement_type,
              priority, active, version, created_from_action_id
            ) VALUES (?, ?, 'NORMALIZED_SUBSTRING', ?, ?, ?, ?, 50, 1, 1, ?)`
          ).run(
            newId('evt'),
            canonicalUserId,
            curTxn.normalized_description.slice(0, 40),
            curTxn.direction || 'DEBIT',
            nextCat,
            nextMove,
            actionId
          );
          bumpVersion(canonicalUserId, 'rules_version');
        }

        if (curTxn.legacy_txn_id && nextCat) {
          db.prepare('UPDATE transactions SET category = ? WHERE id = ?').run(
            getCategoryDisplayName(nextCat),
            curTxn.legacy_txn_id
          );
        }
        newVersions = currentVersions(canonicalUserId);
        break;
      }

      case 'SET_TRANSACTION_MOVEMENT_TYPE': {
        const curTxn = db
          .prepare('SELECT * FROM transactions_v1 WHERE txn_id = ? AND user_id = ?')
          .get(params.txn_id, canonicalUserId);
        if (!curTxn) throw new Error('Transaction not found');
        previousState = { txn: curTxn };
        const ver = incrementLedgerVersion(canonicalUserId);
        const nextCategoryId =
          params.movement_type === 'TRANSFER_INTERNAL' || params.movement_type === 'CARD_PAYMENT'
            ? null
            : params.category_id !== undefined
            ? params.category_id
            : curTxn.category_id;

        db.prepare(
          `UPDATE transactions_v1
           SET movement_type = ?, category_id = ?, classification_status = 'CONFIRMED',
               classification_confidence = 'HIGH', classification_confidence_bp = 10000,
               classification_source = 'USER', categorized_version = ?
           WHERE txn_id = ?`
        ).run(params.movement_type, nextCategoryId, ver, curTxn.txn_id);

        db.prepare(
          `UPDATE review_items SET status = 'RESOLVED', resolved_at = datetime('now'), resolved_by_action_id = ?
           WHERE txn_id = ?`
        ).run(actionId, curTxn.txn_id);
        newVersions = currentVersions(canonicalUserId);
        break;
      }

      case 'CREATE_CATEGORY_RULE': {
        const ruleId = newId('evt');
        db.prepare(
          `INSERT INTO category_rules (
            rule_id, user_id, match_type, pattern, direction, category_id, movement_type,
            priority, active, version, created_from_action_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`
        ).run(
          ruleId,
          canonicalUserId,
          params.match_type || 'NORMALIZED_SUBSTRING',
          params.pattern,
          params.direction || 'DEBIT',
          params.category_id,
          params.movement_type || 'EXPENSE',
          params.priority || 50,
          actionId
        );
        previousState = { created_rule_id: ruleId };
        newVersions = bumpVersion(canonicalUserId, 'rules_version');
        break;
      }

      case 'CREATE_MANUAL_TRANSACTION': {
        const res = ingestTransactions(canonicalUserId, [params], 'MANUAL_USER');
        previousState = { created_txn_id: res.inserted[0]?.txn_id };
        newVersions = currentVersions(canonicalUserId);
        break;
      }

      case 'UPDATE_PROFILE':
      case 'UPDATE_USER_PROFILE': {
        const curProf = db
          .prepare('SELECT * FROM user_profiles_v1 WHERE user_id = ?')
          .get(canonicalUserId);
        previousState = { profile: curProf };
        const nextName = params.display_name ?? curProf.display_name;
        const nextIncome =
          params.declared_income_minor !== undefined
            ? params.declared_income_minor
            : curProf.declared_income_minor;
        let nextFixedJson = curProf.fixed_expense_lines_json;
        if (params.fixed_expense_lines !== undefined) {
          nextFixedJson = JSON.stringify(params.fixed_expense_lines);
        } else if (params.fixed_outflow_minor !== undefined) {
          nextFixedJson = JSON.stringify([
            { label: 'Fixed Obligations', category_id: 'HOUSING.RENT', monthly_amount_minor: Number(params.fixed_outflow_minor) }
          ]);
        }

        const existingPrefs = JSON.parse(curProf.preferences_json || '{}');
        const nextPrefs = {
          ...existingPrefs,
          ...(params.risk_comfort ? { risk_comfort: params.risk_comfort } : {}),
          ...(params.emergency_buffer_months !== undefined ? { emergency_buffer_months: Number(params.emergency_buffer_months) } : {}),
          ...(params.protected_categories ? { protected_categories: params.protected_categories } : {}),
          ...(params.llm_processing_consent !== undefined ? { llm_processing_consent: Boolean(params.llm_processing_consent) } : {}),
        };

        db.prepare(
          `UPDATE user_profiles_v1
           SET display_name = ?, declared_income_minor = ?, fixed_expense_lines_json = ?,
               preferences_json = ?, version = version + 1, updated_at = datetime('now')
           WHERE user_id = ?`
        ).run(nextName, nextIncome, nextFixedJson, JSON.stringify(nextPrefs), canonicalUserId);

        const fixedTotalMinor = JSON.parse(nextFixedJson || '[]').reduce(
          (s, l) => s + (Number(l.monthly_amount_minor) || 0),
          0
        );
        db.prepare(
          `UPDATE users SET name = ?, monthly_income = ?, fixed_housing_expense = ? WHERE id = ?`
        ).run(nextName, minorToRupees(nextIncome || 0), minorToRupees(fixedTotalMinor), numericUserId);

        newVersions = bumpVersion(canonicalUserId, 'profile_version');
        break;
      }

      case 'UPDATE_USER_PREFERENCES': {
        const curProf = db
          .prepare('SELECT * FROM user_profiles_v1 WHERE user_id = ?')
          .get(canonicalUserId);
        previousState = { profile: curProf };
        const existingPrefs = JSON.parse(curProf.preferences_json || '{}');
        const nextPrefs = { ...existingPrefs, ...params };
        db.prepare(
          `UPDATE user_profiles_v1
           SET preferences_json = ?, version = version + 1, updated_at = datetime('now')
           WHERE user_id = ?`
        ).run(JSON.stringify(nextPrefs), canonicalUserId);
        newVersions = bumpVersion(canonicalUserId, 'profile_version');
        break;
      }

      case 'DELETE_MEMORY_FACT': {
        db.prepare('DELETE FROM memory_facts WHERE fact_id = ? AND user_id = ?').run(
          params.fact_id,
          canonicalUserId
        );
        newVersions = currentVersions(canonicalUserId);
        break;
      }

      case 'CREATE_DECLARED_BILL': {
        const billId = newId('bil');
        const nextDue =
          params.next_due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        const dueDay = Number(params.due_day) || parseInt(nextDue.slice(8, 10), 10) || 1;
        db.prepare(
          `INSERT INTO declared_bills_v1 (
            bill_id, user_id, label, category_id, amount_minor, cadence, due_day, next_due_date, active, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`
        ).run(
          billId,
          canonicalUserId,
          params.label || params.merchant_name,
          params.category_id || 'SUBSCRIPTIONS.STREAMING',
          params.amount_minor ?? params.expected_minor ?? 0,
          params.cadence || params.frequency || 'MONTHLY',
          dueDay,
          nextDue
        );
        previousState = { created_bill_id: billId };
        newVersions = bumpVersion(canonicalUserId, 'profile_version');
        break;
      }

      case 'DELETE_DECLARED_BILL': {
        const curBill = db
          .prepare('SELECT * FROM declared_bills_v1 WHERE bill_id = ? AND user_id = ?')
          .get(params.bill_id, canonicalUserId);
        previousState = { bill: curBill };
        db.prepare('UPDATE declared_bills_v1 SET active = 0 WHERE bill_id = ? AND user_id = ?').run(
          params.bill_id,
          canonicalUserId
        );
        newVersions = bumpVersion(canonicalUserId, 'profile_version');
        break;
      }

      default:
        break;
    }

    if (proposalRow) {
      db.prepare("UPDATE proposals_v1 SET status = 'EXECUTED' WHERE proposal_id = ?").run(
        proposalRow.proposal_id
      );
      if (confirmation_token) {
        db.prepare('UPDATE confirmation_tokens SET used_at = ? WHERE token_id = ?').run(
          nowIso,
          confirmation_token
        );
      }
    }

    db.prepare(
      `INSERT INTO action_ledger (
        action_id, user_id, proposal_id, idempotency_key, action_type, status,
        proposer, params_json, previous_state_json, new_versions_json,
        reversible_until, executed_at
      ) VALUES (?, ?, ?, ?, ?, 'EXECUTED', ?, ?, ?, ?, ?, ?)`
    ).run(
      actionId,
      canonicalUserId,
      proposal_id,
      idempotency_key,
      actionType,
      proposer,
      JSON.stringify(params),
      JSON.stringify(previousState),
      JSON.stringify(newVersions),
      reversibleUntil,
      nowIso
    );

    return newVersions;
  });

  const newVersions = runAtomicMutation();

  return {
    schema: 'ActionResult@1',
    action_id: actionId,
    proposal_id,
    status: 'EXECUTED',
    executed_at: nowIso,
    new_versions: newVersions,
    undo_available: Boolean(reversibleUntil),
    undo_expires_at: reversibleUntil,
    rejection_reasons: [],
    message_data: params,
  };
}

/**
 * Reverses an executed action within its undo window (SC §13.7)
 */
function undoAction(userIdOrObj, targetActionId) {
  const isSingleObj =
    typeof userIdOrObj === 'object' && userIdOrObj !== null && !Array.isArray(userIdOrObj);
  const resolvedUserId = isSingleObj ? userIdOrObj.userId || userIdOrObj.user_id : userIdOrObj;
  const resolvedActionId = isSingleObj ? userIdOrObj.actionId || userIdOrObj.action_id : targetActionId;

  const canonicalUserId = toCanonicalUserId(resolvedUserId);
  const row = db
    .prepare('SELECT * FROM action_ledger WHERE action_id = ? AND user_id = ?')
    .get(resolvedActionId, canonicalUserId);

  if (!row || row.status !== 'EXECUTED' || row.undone_by_action_id) {
    return { ok: false, status: 'FAILED', error: 'Action cannot be undone or was already undone' };
  }
  if (row.reversible_until && new Date(row.reversible_until) < new Date()) {
    return { ok: false, status: 'FAILED', error: 'Undo window has expired' };
  }

  const prevState = JSON.parse(row.previous_state_json || '{}');
  const undoActId = newId('act');

  const runUndo = db.transaction(() => {
    switch (row.action_type) {
      case 'CREATE_GOAL':
        if (prevState.created_goal_id) {
          db.prepare('DELETE FROM goals_v1 WHERE goal_id = ?').run(prevState.created_goal_id);
        }
        if (prevState.legacy_goal_id) {
          db.prepare('DELETE FROM goals WHERE id = ?').run(prevState.legacy_goal_id);
        }
        break;
      case 'UPDATE_GOAL':
      case 'SET_GOAL_STATUS':
      case 'ADD_FUNDS':
      case 'RELEASE_FUNDS':
      case 'DELETE_GOAL':
      case 'RESTORE_GOAL':
        if (prevState.goal) {
          const g = prevState.goal;
          db.prepare(
            `UPDATE goals_v1
             SET name = ?, target_minor = ?, saved_minor = ?, monthly_add_minor = ?,
                 deadline = ?, priority_tier = ?, priority_rank = ?, status = ?,
                 archived_at = ?, restore_until = ?, version = version + 1
             WHERE goal_id = ?`
          ).run(
            g.name,
            g.target_minor,
            g.saved_minor,
            g.monthly_add_minor,
            g.deadline,
            g.priority_tier,
            g.priority_rank,
            g.status,
            g.archived_at,
            g.restore_until,
            g.goal_id
          );
        }
        break;
      case 'ADJUST_BUDGET_CAP':
        if (prevState.scope === 'MONTH') {
          if (prevState.override) {
            db.prepare(
              `INSERT OR REPLACE INTO cap_month_overrides (user_id, category_id, period, amount_minor, reason)
               VALUES (?, ?, ?, ?, ?)`
            ).run(
              canonicalUserId,
              prevState.category_id,
              prevState.period,
              prevState.override.amount_minor,
              prevState.override.reason
            );
          } else {
            db.prepare(
              'DELETE FROM cap_month_overrides WHERE user_id = ? AND category_id = ? AND period = ?'
            ).run(canonicalUserId, prevState.category_id, prevState.period);
          }
        } else if (prevState.cap) {
          db.prepare('UPDATE caps_v1 SET amount_minor = ? WHERE cap_id = ?').run(
            prevState.cap.amount_minor,
            prevState.cap.cap_id
          );
        }
        break;
      default:
        break;
    }

    const newVersions = bumpVersion(canonicalUserId, 'plan_version');
    db.prepare('UPDATE action_ledger SET undone_by_action_id = ? WHERE action_id = ?').run(
      undoActId,
      resolvedActionId
    );
    return newVersions;
  });

  const newVersions = runUndo();
  return {
    ok: true,
    status: 'UNDONE',
    undo_action_id: undoActId,
    target_action_id: resolvedActionId,
    new_versions: newVersions,
  };
}

module.exports = {
  registerProposal,
  executeAction,
  undoAction,
};
