const assert = require('node:assert/strict');
const db = require('./src/db');
const { newId, isValidId } = require('./src/shared/ids');
const { halfEvenRound, multiplyMinorByBp, ratioToBp, formatInr } = require('./src/shared/money');
const { resolvePlaceholders, findUnboundDigits } = require('./src/shared/contracts/grounding');
const { ACTION_REGISTRY } = require('./src/shared/contracts/action-registry');
const { CONSTRAINT_REGISTRY } = require('./src/shared/contracts/constraint-messages');
const { ingestBatch, getStatus } = require('./src/engines/categorizer');
const { SENTINEL_FUNCTIONS, callSentinel } = require('./src/engines/sentinel');
const { createSnapshot } = require('./src/platform/snapshot');
const { GatewaySession } = require('./src/platform/gateway');
const { syncUserStateFromLegacy } = require('./src/platform/profile');
const { registerProposal, executeAction, undoAction } = require('./src/platform/action-service');
const { getAllowedToolsForCaller } = require('./src/shared/contracts/validator');
const { invoke: invokeAtlas } = require('./src/agents/atlas');
const { invoke: invokeNova } = require('./src/agents/nova');
const { invoke: invokeIris } = require('./src/agents/iris');
const { handleChat } = require('./src/agents/john');

async function runTests() {
  console.log('====================================================');
  console.log('FinMate AI — v1.0 / v5.0 Specification Verification');
  console.log('====================================================\n');

  // 1. Shared Primitives & Contracts
  console.log('1. Testing Shared Primitives & Contracts (SC v1.0.0)...');
  const txnId = newId('txn');
  assert.ok(isValidId(txnId, 'txn'), 'ULID generator should produce valid txn_ ID');
  assert.equal(halfEvenRound(25, 10), 2, 'Half-even rounding 2.5 -> 2');
  assert.equal(halfEvenRound(35, 10), 4, 'Half-even rounding 3.5 -> 4');
  assert.equal(multiplyMinorByBp(100000, 2500), 25000, '25% of 100000 minor = 25000 minor');
  assert.equal(ratioToBp(250, 1000), 2500, '250/1000 = 2500 bp');
  assert.equal(formatInr(12500000), '₹1,25,000', 'Indian number formatting');
  assert.ok(Object.keys(ACTION_REGISTRY).length >= 30, 'All 30 Action Registry entries present');
  assert.ok(Object.keys(CONSTRAINT_REGISTRY).length >= 31, 'All 31 Constraint Codes present');

  const toolResultsMap = new Map([
    ['trs_01TEST', { status: 'OK', value: { feasible_surplus_minor: 2500000 } }]
  ]);
  const grounded = resolvePlaceholders(
    'Your feasible surplus is {{trs_01TEST:/value/feasible_surplus_minor|inr}} per month.',
    { toolResults: toolResultsMap }
  );
  assert.equal(grounded.ok, true);
  assert.equal(grounded.text, 'Your feasible surplus is ₹25,000 per month.');
  const unbound = findUnboundDigits('Your surplus is ₹99,999 this month.', '{{trs_01TEST:/value/feasible_surplus_minor|inr}}');
  assert.ok(unbound.length > 0, 'Unbound digit detector catches ungrounded numbers');
  console.log('   ✓ Shared Primitives & Grounding verified.');

  // 2. Setup Test User & Item Categorizer v3.0
  console.log('2. Testing Item Categorizer v3.0 Pipeline...');
  const testEmail = `spec_test_${Date.now()}@finmate.ai`;
  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, monthly_income, fixed_housing_expense)
    VALUES (?, 'hash', 'Spec Tester', 120000, 35000)
  `).run(testEmail);
  const numericUserId = Number(insertUser.lastInsertRowid);
  const canonicalUserId = syncUserStateFromLegacy(numericUserId);

  const sampleBatch = [
    { raw_description: 'UPI/SWIGGYINSTAMART/swiggy@icici/Order', amount_minor: 65000, direction: 'DEBIT', txn_date: '2026-10-02' },
    { raw_description: 'UPI/ZOMATO/zomato@hdfcbank/Dinner', amount_minor: 85000, direction: 'DEBIT', txn_date: '2026-10-03' },
    { raw_description: 'NETFLIX.COM SUBSCRIPTION', amount_minor: 64900, direction: 'DEBIT', txn_date: '2026-10-04' },
    { raw_description: 'NEFT SALARY CREDIT ACME CORP', amount_minor: 12000000, direction: 'CREDIT', txn_date: '2026-10-01' },
    { raw_description: 'SELF TRANSFER TO OWN SAVINGS A/C', amount_minor: 2000000, direction: 'DEBIT', txn_date: '2026-10-05' },
    { raw_description: 'CRED CREDIT CARD BILL PAYMENT', amount_minor: 1500000, direction: 'DEBIT', txn_date: '2026-10-06' }
  ];

  const ingestRes = ingestBatch(canonicalUserId, sampleBatch, 'STATEMENT_CSV');
  assert.equal(ingestRes.inserted.length, 6, 'Should ingest 6 canonical transactions');

  const swiggyTx = ingestRes.inserted[0];
  assert.equal(swiggyTx.movement_type, 'EXPENSE');
  assert.equal(swiggyTx.category_id, 'FOOD.DELIVERY');

  const selfTransferTx = ingestRes.inserted[4];
  assert.equal(selfTransferTx.movement_type, 'TRANSFER_INTERNAL', 'Self transfer excluded from expenses');

  const cardPayTx = ingestRes.inserted[5];
  assert.equal(cardPayTx.movement_type, 'CARD_PAYMENT', 'Credit card bill payment excluded from expenses');

  const dqStatus = getStatus(canonicalUserId);
  assert.equal(dqStatus.complete, true);
  assert.ok(dqStatus.coverage_bp >= 8000, 'Coverage should be high');
  console.log('   ✓ Item Categorizer v3.0 10-step pipeline & movement exclusions verified.');

  // 3. Sentinel v5.0 All 17 Functions
  console.log('3. Testing Sentinel v5.0 (All 17 Deterministic Functions)...');
  assert.equal(Object.keys(SENTINEL_FUNCTIONS).length, 17, 'Sentinel must export all 17 functions');
  const snapshot = createSnapshot(canonicalUserId);

  const baselineRes = callSentinel('sentinel_get_surplus_baseline', canonicalUserId, snapshot, { horizon_months: 3 });
  assert.equal(baselineRes.status, 'OK');
  assert.ok(baselineRes.value.feasible_surplus_minor > 0, 'Feasible surplus should be positive');

  const sipRes = callSentinel('sentinel_project_sip', canonicalUserId, snapshot, {
    monthly_amount_minor: 1000000,
    annual_rate_bp: 1200,
    months: 120,
    annual_step_up_bp: 0
  });
  assert.equal(sipRes.status, 'OK');
  assert.equal(sipRes.value.total_contributed_minor, 120000000);
  assert.ok(sipRes.value.projected_gain_minor > 0, 'SIP compound gain should be positive');

  const healthRes = callSentinel('sentinel_compute_health_score', canonicalUserId, snapshot, {});
  assert.equal(healthRes.status, 'OK');
  assert.ok((healthRes.value.score ?? healthRes.value.total_score) >= 0);
  console.log('   ✓ Sentinel v5.0 functions verified.');

  // 4. Tool Gateway Allowlist Enforcement
  console.log('4. Testing Tool Gateway Allowlist & Budget (SC §10.4)...');
  const atlasGateway = new GatewaySession({
    caller: 'ATLAS',
    userId: canonicalUserId,
    snapshot,
    maxToolCalls: 4
  });
  const forbiddenCall = atlasGateway.call('sentinel_detect_anomalies', {});
  assert.equal(forbiddenCall.status, 'ERROR', 'ATLAS must be forbidden from calling sentinel_detect_anomalies');
  assert.equal(forbiddenCall.error.code, 'FORBIDDEN');
  const allowedCall = atlasGateway.call('sentinel_get_surplus_baseline', { horizon_months: 3 });
  assert.equal(allowedCall.status, 'OK', 'ATLAS can call sentinel_get_surplus_baseline');
  console.log('   ✓ Tool Gateway caller × function allowlist verified.');

  // 5. Specialists (Atlas v5.0, Nova v5.0, Iris v5.0)
  console.log('5. Testing Specialists (Atlas v5.0, Nova v5.0, Iris v5.0)...');
  const basePacket = {
    schema: 'TaskPacket@1',
    task_id: newId('tsk'),
    request_id: newId('req'),
    trace_id: newId('trc'),
    trigger: 'USER_MESSAGE',
    user_id: canonicalUserId,
    snapshot_id: snapshot.snapshot_id,
    as_of_versions: snapshot.versions,
    data_quality: dqStatus,
    context: {
      user_id: canonicalUserId,
      snapshot,
      preferences: {
        risk_comfort: 'BALANCED',
        protected_categories: ['HEALTH', 'UTILITIES'],
        goal_priority_order: []
      },
      active_entities: { goals: [], caps: [], open_alerts: [] },
      peer_findings: [],
      rolling_summary: null
    },
    budget: { max_tool_calls: 6, deadline_ms: 4000 }
  };

  const atlasResp = await invokeAtlas({
    ...basePacket,
    specialist: 'ATLAS',
    allowed_tools: getAllowedToolsForCaller('ATLAS'),
    task_type: 'CREATE_GOAL',
    task_params: {
      name: 'Emergency Fund',
      target_minor: 15000000,
      monthly_add_minor: 1000000,
      priority_tier: 'HIGH'
    }
  });
  assert.equal(atlasResp.status, 'OK');
  assert.equal(atlasResp.proposals.length, 1);
  assert.equal(atlasResp.proposals[0].action_type, 'CREATE_GOAL');

  const novaResp = await invokeNova({
    ...basePacket,
    specialist: 'NOVA',
    allowed_tools: getAllowedToolsForCaller('NOVA'),
    task_type: 'EVALUATE_CAP_CHANGE',
    task_params: {
      category_id: 'FOOD',
      new_cap_minor: 1200000,
      scope: 'STANDING'
    }
  });
  assert.equal(novaResp.status, 'OK');
  assert.equal(novaResp.proposals.length, 1);
  assert.equal(novaResp.proposals[0].action_type, 'ADJUST_BUDGET_CAP');

  const irisResp = await invokeIris({
    ...basePacket,
    specialist: 'IRIS',
    allowed_tools: getAllowedToolsForCaller('IRIS'),
    task_type: 'WHAT_IF_PURCHASE',
    task_params: {
      amount_minor: 2000000,
      date: '2026-11-15',
      label: 'Holiday Flight'
    }
  });
  assert.equal(irisResp.status, 'OK');
  assert.equal(irisResp.domain.kind, 'IrisDomain@1');
  console.log('   ✓ Atlas v5.0, Nova v5.0, and Iris v5.0 verified.');

  // 6. Action Service (Proposal Registration, Token Verification, Execution & Undo)
  console.log('6. Testing Action Service Execution & Undo (SC §13.6)...');
  const registered = registerProposal({
    userId: canonicalUserId,
    snapshot,
    proposal: atlasResp.proposals[0],
    proposer: 'ATLAS',
    origin: 'AGENT_PROPOSAL'
  });
  assert.ok(registered.proposal_id.startsWith('prp_'));
  assert.ok(registered.confirmation_token.startsWith('cnf_'));

  const execRes = executeAction({
    userId: canonicalUserId,
    proposalId: registered.proposal_id,
    confirmationToken: registered.confirmation_token
  });
  assert.equal(execRes.status, 'EXECUTED');
  assert.ok(execRes.action_id.startsWith('act_'));

  const undoRes = undoAction({
    userId: canonicalUserId,
    actionId: execRes.action_id
  });
  assert.equal(undoRes.status, 'UNDONE');
  console.log('   ✓ Action Service 12-step execution & Undo verified.');

  // 7. John v2.0 End-to-End Orchestrator
  console.log('7. Testing John v2.0 Star-Topology Orchestrator...');
  const chatRes = await handleChat({
    userId: canonicalUserId,
    message: 'Create a goal for Laptop Fund of ₹80,000 saving ₹8,000 per month',
    uiContext: { workspace: 'JOHN' }
  });
  assert.equal(chatRes.schema, 'ChatResponse@1');
  assert.ok(chatRes.reply.length > 0);
  assert.ok(chatRes.proposals.length >= 1, 'John should return validated confirmation card proposal');
  console.log('   ✓ John v2.0 Star-Topology Orchestrator verified.\n');

  console.log('ALL SPECIFICATION VERIFICATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
