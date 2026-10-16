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
const { registerProposal, executeAction, undoAction } = require('../../platform/action-service');

const router = express.Router();
router.use(requireAuth);

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

module.exports = router;
