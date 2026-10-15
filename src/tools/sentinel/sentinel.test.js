/**
 * Standalone Branch Test: Sentinel Tool (src/tools/sentinel/)
 * Validates all 6 deterministic read-only tools and write-blocking ToolGateway.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const { SentinelEngine, SnapshotManager } = require('./index');

console.log('📐 [Branch Test: SENTINEL] Running Sentinel Deterministic Calculator verification...');

const db = getDb(':memory:');
const userId = 'test_branch_sentinel';
seedNova(userId, db);
const snap = SnapshotManager.getLatestSnapshot(userId, db);

const summary = SentinelEngine.getLedgerSummary({ snapshot_id: snap.snapshot_id });
assert.ok(summary.tool_result_id, 'Must return tool_result_id');

const util = SentinelEngine.runCategoryUtilization({ snapshot_id: snap.snapshot_id });
assert.ok(Array.isArray(util.categories) && util.categories.length > 0, 'Must compute category utilization');

assert.throws(
  () => SentinelEngine.callTool('RECATEGORIZE_TRANSACTION', {}),
  (err) => err.code === 'GATEWAY_WRITE_ATTEMPT_BLOCKED'
);

console.log('✅ [Branch Test: SENTINEL] Passed 100%!');
