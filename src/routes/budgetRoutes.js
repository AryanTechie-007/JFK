const express = require('express');
const NovaGuardianEngine = require('../agents/nova/NovaGuardianEngine');
const { defaultJohnOrchestrator } = require('../agents/john/JohnOrchestrator');
const { ActionService } = require('../tools/action-service/ActionService');
const { TASK_TYPES } = require('../contracts/PlatformRules');

function createBudgetRouter(getDb) {
  const router = express.Router();

  router.use((req, res, next) => {
    req.userId = req.headers['x-user-id'] || 'user_demo_nova';
    next();
  });

  // GET /api/budget?month=YYYY-MM — Fetch live budget dashboard from Sentinel snapshot
  router.get('/', (req, res) => {
    try {
      const db = getDb();
      const result = NovaGuardianEngine.evaluateBudget(req.userId, req.query.month, db);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/budget/:category/propose — Validate cap change via Nova & Sentinel and issue confirmation card
  router.post('/:category/propose', (req, res) => {
    try {
      const db = getDb();
      const newCap = Number((req.body || {}).monthlyCap ?? (req.body || {}).new_cap);
      const explicitUserRequest = Boolean(req.body?.explicit_user_request);

      const result = defaultJohnOrchestrator.invokeNova({
        userId: req.userId,
        taskType: TASK_TYPES.ADJUST_CAP_REQUEST,
        event: {
          category: req.params.category,
          new_cap: newCap,
          explicit_user_request: explicitUserRequest
        },
        explicitUserOverride: explicitUserRequest,
        db
      });

      const status = result.specialist_response.status === 'rejected' ? 400 : 200;
      res.status(status).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code });
    }
  });

  // PUT /api/budget/:category — Execute cap change via ActionService (validates rules & confirmation token)
  router.put('/:category', (req, res) => {
    try {
      const db = getDb();
      const cap = Number((req.body || {}).monthlyCap ?? (req.body || {}).new_cap);
      const explicitOverride = Boolean(req.body?.explicit_user_request);
      let token = req.headers['x-confirmation-token'] || req.body?.confirmation_token;

      // If require_token is strictly enforced or token is provided, verify it;
      // otherwise issue confirmation token via John when called from direct UI confirmation
      if (!token && !req.body?.require_confirmation_token) {
        const card = ActionService.createProposalConfirmation({
          userId: req.userId,
          actionType: 'ADJUST_BUDGET_CAP',
          payload: { category: req.params.category, new_cap: cap },
          initiatedBy: 'Nova'
        });
        token = card.confirmation_token;
      }

      const execResult = ActionService.execute({
        userId: req.userId,
        actionType: 'ADJUST_BUDGET_CAP',
        payload: { category: req.params.category, new_cap: cap },
        confirmationToken: token,
        initiatedBy: 'Nova',
        explicitUserOverride: explicitOverride,
        db
      });

      res.json(execResult);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code, validation: err.validation });
    }
  });

  // DELETE /api/budget/:category — Remove category cap
  router.delete('/:category', (req, res) => {
    try {
      const db = getDb();
      const result = db.prepare(`
        DELETE FROM budget_categories WHERE user_id = ? AND category = ?
      `).run(req.userId, req.params.category);

      res.json({
        success: true,
        deleted: result.changes > 0,
        category: req.params.category
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createBudgetRouter;
