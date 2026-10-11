/**
 * Nova V4 — Interactive Multi-Agent & Sentinel Specification Demo
 */

try {
  require('dotenv').config();
} catch (e) {}

const { getDb } = require('./src/db/db');
const { seedNova } = require('./src/db/seed');
const NovaGuardianEngine = require('./src/agents/nova/NovaGuardianEngine');
const NovaAgentBrain = require('./src/agents/nova/NovaAgentBrain');
const { defaultJohnOrchestrator, AgentNegotiator } = require('./src/agents/john/JohnOrchestrator');
const { defaultTallyService } = require('./src/tools/tally/TallyService');

async function runDemo() {
  console.log('================================================================================');
  console.log('🛡️  NOVA V4 — STATELESS SPECIALIST & SENTINEL ENGINE INTERACTIVE DEMO');
  console.log('================================================================================\n');

  const db = getDb(':memory:');
  const demoUser = 'user_demo_nova';
  seedNova(demoUser, db);

  console.log('📊 [1/6] SENTINEL SNAPSHOT & UTILIZATION (Healthy <80%, Warning 80%-100%, Exceeded >100%):');
  console.log('--------------------------------------------------------------------------------');
  const evaluation = NovaGuardianEngine.evaluateBudget(demoUser, null, db);
  printBudgetTable(evaluation);

  console.log('\n🧠 [2/6] JOHN -> NOVA STATELESS TaskPacket@1 -> SpecialistResponse@1:');
  console.log('--------------------------------------------------------------------------------');
  const cognitiveCycle = await NovaAgentBrain.runCognitiveCycle(demoUser, db);
  const specResp = cognitiveCycle.specialist_response;
  console.log(`🤖 Output Schema:    ${specResp.schema} (status: ${specResp.status}, confidence: ${specResp.confidence})`);
  console.log(`📌 Pinned Snapshot:  ${cognitiveCycle.snapshot_id}`);
  console.log(`🔥 Daily Envelope:   ₹${specResp.daily_spending_envelope.headline_amount.toLocaleString()}/day (${specResp.daily_spending_envelope.headline_mode} mode)`);
  console.log(`\n📝 Grounded Findings (bound with {{placeholders}} to tool_result_ids):`);
  specResp.findings.forEach((f, idx) => {
    console.log(`   ${idx + 1}. Template: "${f.statement}"`);
    console.log(`      Rendered: "${f.rendered_statement}" [tool_result_id: ${f.tool_result_id}]`);
  });

  console.log('\n🚨 [3/6] SENTINEL ANOMALY DETECTION & PEER HINTS:');
  console.log('--------------------------------------------------------------------------------');
  const anomInvocation = defaultJohnOrchestrator.invokeNova({
    userId: demoUser,
    taskType: 'anomaly_event',
    db
  });
  anomInvocation.specialist_response.findings.forEach(f => {
    console.log(`   ⚠️ ${f.rendered_statement}`);
  });
  anomInvocation.specialist_response.peer_hints.forEach(h => {
    console.log(`   📡 Peer Hint for ${h.target_agent}: [${h.type}] -> ${h.note}`);
  });

  console.log('\n🔄 [4/6] PATTERN D: TRANSACTION CATEGORY CORRECTION (Dining -> Shopping):');
  console.log('--------------------------------------------------------------------------------');
  const diningTx = db.prepare(`SELECT * FROM transactions WHERE user_id = ?`).all(demoUser)
    .find(t => t.category === 'Food & Dining' && t.amount >= 4000);
  if (diningTx) {
    const corr = defaultTallyService.correctTransactionCategory(demoUser, diningTx.id, 'Shopping & Lifestyle', db);
    console.log(`   ✅ Tally published ${corr.event.event_type} for tx #${diningTx.id} (₹${diningTx.amount}):`);
    console.log(`      Previous category: ${corr.event.previous_categories.join(', ')} -> Touched: ${corr.event.touched_categories.join(', ')}`);
  }

  console.log('\n🤝 [5/6] STAR-TOPOLOGY COORDINATION (Nova -> John -> Atlas):');
  console.log('--------------------------------------------------------------------------------');
  const atlasCoord = await AgentNegotiator.negotiateWithAtlas(demoUser, db);
  atlasCoord.dialogue.forEach(msg => {
    console.log(`   [${msg.from} ➔ ${msg.to}]:`);
    console.log(`     "${msg.content || msg.analysis}"\n`);
  });

  console.log('📋 [6/6] JOHN ORCHESTRATOR BRIEFING & CONFIRMATION CARDS:');
  console.log('--------------------------------------------------------------------------------');
  const johnBrief = await AgentNegotiator.prepareJohnBriefing(demoUser, db);
  console.log(`   Protocol: ${johnBrief.protocol_version}`);
  johnBrief.coaching_talking_points.forEach(point => {
    console.log(`     • ${point}`);
  });

  console.log('\n================================================================================');
  console.log('✨ NOVA V4 DEMO COMPLETED SUCCESSFULLY!');
  console.log('================================================================================\n');
}

function printBudgetTable(data) {
  console.log(`Monthly Income: ₹${data.cashflow.monthly_income.toLocaleString()} | Fixed Housing: ₹${data.cashflow.fixed_housing_expense.toLocaleString()} | Net Surplus: ₹${data.cashflow.net_surplus.toLocaleString()}`);
  console.log('--------------------------------------------------------------------------------');
  console.log(
    'CATEGORY'.padEnd(24) +
    'SETTLED'.padStart(10) +
    'PROVISIONAL'.padStart(13) +
    'CAP'.padStart(10) +
    'USED %'.padStart(9) +
    'TIER'.padStart(14)
  );
  console.log('-'.repeat(80));

  for (const cat of data.categories) {
    const tierIcon = cat.status === 'exceeded' ? '🚨 EXCEEDED' : cat.status === 'warning' ? '⚠️ WARNING' : '✅ HEALTHY';
    console.log(
      cat.category.padEnd(24) +
      `₹${(cat.spent_settled ?? cat.spent).toLocaleString()}`.padStart(10) +
      `₹${(cat.spent_provisional || 0).toLocaleString()}`.padStart(13) +
      (cat.monthly_cap ? `₹${cat.monthly_cap.toLocaleString()}` : 'Uncapped').padStart(10) +
      (cat.used_pct !== null ? `${cat.used_pct}%` : 'N/A').padStart(9) +
      tierIcon.padStart(14)
    );
  }
}

runDemo().catch(console.error);
