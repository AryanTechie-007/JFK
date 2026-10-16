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

const { TAXONOMY_VERSION, CATEGORIES, PARENT_CATEGORIES, getStatus, getReviewQueue } = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

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

module.exports = router;
