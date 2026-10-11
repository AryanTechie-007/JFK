const express = require('express');
const { ActionService } = require('../tools/action-service/ActionService');

function createActionRouter(getDb) {
  const router = express.Router();

  router.use((req, res, next) => {
    req.userId = req.headers['x-user-id'] || 'user_demo_nova';
    next();
  });

  // POST /api/actions/token — Issue a confirmation token for a proposed action card
  router.post('/token', (req, res) => {
    try {
      const { actionType, payload, initiatedBy } = req.body || {};
      const card = ActionService.createProposalConfirmation({
        userId: req.userId,
        actionType,
        payload,
        initiatedBy: initiatedBy || 'Nova'
      });
      res.json(card);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code });
    }
  });

  // POST /api/actions/execute — Execute an action through the Action Service
  router.post('/execute', (req, res) => {
    try {
      const db = getDb();
      const { actionType, payload, confirmationToken, initiatedBy, explicitUserOverride } = req.body || {};
      const result = ActionService.execute({
        userId: req.userId,
        actionType,
        payload,
        confirmationToken: confirmationToken || req.headers['x-confirmation-token'],
        initiatedBy: initiatedBy || 'Nova',
        explicitUserOverride: Boolean(explicitUserOverride),
        db
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code, validation: err.validation });
    }
  });

  // GET /api/actions/audit — Inspect Action Service audit log
  router.get('/audit', (_req, res) => {
    res.json({ audit_log: ActionService.getAuditLog() });
  });

  return router;
}

module.exports = createActionRouter;
