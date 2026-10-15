/**
 * Standalone Branch Test: John Orchestrator Agent (src/agents/john/)
 * Validates deterministic intent routing (Section 3.2) and cross-agent star-topology orchestration.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const { TASK_TYPES } = require('../../contracts/PlatformRules');
const { defaultJohnOrchestrator, RoutingTable } = require('./JohnOrchestrator');

console.log('🎯 [Branch Test: JOHN] Running John Orchestrator standalone verification...');

const db = getDb(':memory:');
const userId = 'test_branch_john';
seedNova(userId, db);

// 1. Verify Section 10 Signal Routing Table
const r1 = RoutingTable.resolveRoute({ user_message: 'Am I overspending on dining this month?' });
assert.strictEqual(r1.destination, 'Nova');

const r2 = RoutingTable.resolveRoute({ user_message: 'Show me next month what-if planning' });
assert.strictEqual(r2.destination, 'Iris');

const r3 = RoutingTable.resolveRoute({ user_message: 'Help me create goal for emergency fund' });
assert.strictEqual(r3.destination, 'Atlas');

// 2. Verify Star-Topology Orchestration
const result = defaultJohnOrchestrator.invokeNova({
  userId,
  taskType: TASK_TYPES.LIVE_STATUS,
  db
});
assert.strictEqual(result.specialist_response.schema, 'SpecialistResponse@1');

console.log('✅ [Branch Test: JOHN] Passed 100%!');
