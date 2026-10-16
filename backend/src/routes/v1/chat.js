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

const { handleChatRequest } = require('../../agents/john');

const router = express.Router();
router.use(requireAuth);

router.post('/chat', async (req, res) => {
  try {
    const response = await handleChatRequest(req.userId, req.body || {});
    res.json(response);
  } catch (err) {
    console.error('Error in POST /api/v1/chat:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

module.exports = router;
