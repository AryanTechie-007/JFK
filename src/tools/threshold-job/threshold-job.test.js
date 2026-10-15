/**
 * Standalone Branch Test: Threshold Job Tool (src/tools/threshold-job/)
 * Validates deterministic threshold alert generation and duplicate event hygiene.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const { defaultTallyService } = require('../tally/TallyService');
const { defaultThresholdJob, defaultAlertStore } = require('./ThresholdJob');

console.log('🚨 [Branch Test: THRESHOLD-JOB] Running Threshold Job Alerting verification...');

const db = getDb(':memory:');
const userId = 'test_branch_threshold';
defaultAlertStore.reset();
seedNova(userId, db);

const batch = defaultTallyService.ingestBatch(
  userId,
  [{ rawDescription: 'Swiggy Party Order', amount: 1500, category: 'Food & Dining' }],
  db,
  { event_id: 'evt_branch_test_1' }
);
const run1 = defaultThresholdJob.handleCategorizationUpdated(batch.event);
const alerts = defaultAlertStore.getOpenAlerts(userId);
assert.ok(alerts.length > 0 || run1.alerts_created.length > 0, 'Must create threshold alert deterministically');

const dup = defaultThresholdJob.handleCategorizationUpdated(batch.event);
assert.strictEqual(dup.deduplicated, true, 'Duplicate event must be suppressed');

console.log('✅ [Branch Test: THRESHOLD-JOB] Passed 100%!');
