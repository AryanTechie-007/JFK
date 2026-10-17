/**
 * FinMate AI — `/api/v1/*` router wiring.
 *
 * After WS-FND-P1 this file contains no handler code: every domain owns one file
 * (workstream-assignments.md §5). Adding a router is a one-line PR reviewed by WS-FND.
 */

const express = require('express');
const { requireAuth } = require('./_shared');

const router = express.Router();
router.use(requireAuth);

router.use(require('./system'));
router.use(require('./chat'));
router.use(require('./actions'));
router.use(require('./workspaces-john'));
router.use(require('./workspaces-atlas'));
router.use(require('./workspaces-nova'));
router.use(require('./workspaces-iris'));
router.use(require('./workspaces-sentinel'));
router.use(require('./categorizer'));
router.use(require('./ingest'));
router.use(require('./settings'));

module.exports = router;
