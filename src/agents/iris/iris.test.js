/**
 * Standalone Branch Test: Iris Specialist Agent (src/agents/iris/)
 * Validates recurring subscription detection and RECURRING_ANOMALY peer hint handling.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const { TASK_TYPES } = require('../../contracts/PlatformRules');
const { SnapshotManager } = require('../../tools/sentinel');
const IrisAgent = require('./IrisAgent');

console.log('🔄 [Branch Test: IRIS] Running Iris Subscription Specialist standalone verification...');

const db = getDb(':memory:');
const userId = 'test_branch_iris';
seedNova(userId, db);
const snap = SnapshotManager.getLatestSnapshot(userId, db);

const packet = TaskPacketV1.create({
  task_type: TASK_TYPES.ANOMALY_REVIEW,
  snapshot_id: snap.snapshot_id,
  peer_findings: [
    {
      type: 'RECURRING_ANOMALY',
      merchant: 'Netflix',
      delta: 150,
      tool_result_id: 'res_anom_netflix_1'
    }
  ]
});

const result = IrisAgent.invoke(packet);
assert.strictEqual(result.schema, 'SpecialistResponse@1');
assert.strictEqual(result.status, 'ok');
assert.ok(result.findings.length > 0, 'Iris must return grounded recurring anomaly findings');

console.log('✅ [Branch Test: IRIS] Passed 100%!');
