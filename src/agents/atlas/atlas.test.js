/**
 * Standalone Branch Test: Atlas Specialist Agent (src/agents/atlas/)
 * Validates long-term goal impact simulation and GOAL_FUNDING_PRESSURE peer hint handling.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const { TASK_TYPES } = require('../../contracts/PlatformRules');
const { SnapshotManager } = require('../../tools/sentinel');
const AtlasAgent = require('./AtlasAgent');

console.log('🗺️  [Branch Test: ATLAS] Running Atlas Goal Strategist standalone verification...');

const db = getDb(':memory:');
const userId = 'test_branch_atlas';
seedNova(userId, db);
const snap = SnapshotManager.getLatestSnapshot(userId, db);

const packet = TaskPacketV1.create({
  task_type: TASK_TYPES.REBALANCE_REQUEST,
  snapshot_id: snap.snapshot_id,
  peer_findings: [
    {
      type: 'GOAL_FUNDING_PRESSURE',
      shortfall_amount: 2500,
      tool_result_id: 'res_reb_shortfall_1'
    }
  ]
});

const result = AtlasAgent.invoke(packet);
assert.strictEqual(result.schema, 'SpecialistResponse@1');
assert.strictEqual(result.agent, 'Atlas');
assert.strictEqual(result.status, 'ok');
assert.ok(result.proposed_actions.length > 0, 'Atlas must propose goal contribution pause option');

console.log('✅ [Branch Test: ATLAS] Passed 100%!');
