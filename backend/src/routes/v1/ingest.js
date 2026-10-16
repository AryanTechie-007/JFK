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

const { ingestTransactions } = require('../../engines/categorizer');
const { scanUserBudgets } = require('../../platform/budget-monitor');

const router = express.Router();
router.use(requireAuth);

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

module.exports = router;
