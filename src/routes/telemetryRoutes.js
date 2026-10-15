const express = require('express');
const NovaGuardianEngine = require('../agents/nova/NovaGuardianEngine');
const NovaAgentBrain = require('../agents/nova/NovaAgentBrain');
const { defaultJohnOrchestrator, AgentNegotiator } = require('../agents/john/JohnOrchestrator');
const { ActionService } = require('../tools/action-service/ActionService');

function createTelemetryRouter(getDb) {
  const router = express.Router();

  router.use((req, res, next) => {
    req.userId = req.headers['x-user-id'] || 'user_demo_nova';
    next();
  });

  // GET /api/nova/telemetry — Multi-agent status trace for John / Iris / Atlas
  router.get('/', (req, res) => {
    try {
      const db = getDb();
      const telemetry = NovaGuardianEngine.generateTelemetry(req.userId, db);
      res.json(telemetry);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/nova/telemetry/cycle — Full V4 Cycle (TaskPacket@1, SpecialistResponse@1, Velocity, Anomalies)
  router.get('/cycle', async (req, res) => {
    try {
      const db = getDb();
      const cycleResult = await NovaAgentBrain.runCognitiveCycle(req.userId, db);
      res.json(cycleResult);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/nova/telemetry/invoke — Stateless V4 TaskPacket@1 invocation via John
  router.post('/invoke', (req, res) => {
    try {
      const db = getDb();
      const { task_type, user_message, event, ui_context, explicit_user_override } = req.body || {};
      const result = defaultJohnOrchestrator.invokeNova({
        userId: req.userId,
        taskType: task_type,
        userMessage: user_message,
        event,
        uiContext: ui_context,
        explicitUserOverride: Boolean(explicit_user_override),
        db
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code });
    }
  });

  // GET /api/nova/telemetry/briefing — Coaching brief for John (Main Orchestrator)
  router.get('/briefing', async (req, res) => {
    try {
      const db = getDb();
      const briefing = await AgentNegotiator.prepareJohnBriefing(req.userId, db);
      res.json(briefing);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/nova/telemetry/negotiate — Star-Topology goal-funding pressure coordination via John -> Atlas
  router.post('/negotiate', async (req, res) => {
    try {
      const db = getDb();
      const result = await AgentNegotiator.negotiateWithAtlas(req.userId, db, req.body?.deficitAmount);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/nova/telemetry/rebalance — Execute zero-sum rebalance via ActionService
  router.post('/rebalance', (req, res) => {
    try {
      const db = getDb();
      const token = req.headers['x-confirmation-token'] || req.body?.confirmation_token || null;
      if (req.body?.require_confirmation_token && !token) {
        return res.status(400).json({
          error: 'confirmation_token is required to execute APPLY_REBALANCE.',
          code: 'CONFIRMATION_TOKEN_REQUIRED'
        });
      }
      const result = AgentNegotiator.applyRebalance(req.userId, req.body?.move, db, token);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code });
    }
  });

  return router;
}

module.exports = createTelemetryRouter;
