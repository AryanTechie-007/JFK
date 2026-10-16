/**
 * Shared pieces used by every /api/v1 domain router.
 *
 * The auth guard used to be imported at the top of routes/v1/index.js; after the
 * WS-FND-P1 split every domain router imports it from here so a new shared helper
 * has exactly one home (workstream-assignments.md section 5).
 */

const { requireAuth } = require('../../middleware/auth');

module.exports = { requireAuth };
