/**
 * FinMate AI — Desktop Application Verification Suite
 * ---------------------------------------------------
 * Runs standalone tests for all 6 parallel team modules + 2 governance tools + V4 Compliance Suite
 * for the FinMate AI Electron Desktop Application.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');

const MODULE_CHECKS = [
  {
    id: 'nova',
    branch: 'nova',
    type: 'Agent',
    name: 'Nova — Real-Time Budget Guardian (V4)',
    testFile: 'src/agents/nova/nova.test.js',
    uiFile: 'src/workspaces/nova/NovaWorkspace.jsx'
  },
  {
    id: 'john',
    branch: 'john',
    type: 'Agent',
    name: 'John — Master Orchestrator & Coach',
    testFile: 'src/agents/john/john.test.js',
    uiFile: 'src/workspaces/john/JohnWorkspace.jsx'
  },
  {
    id: 'iris',
    branch: 'iris',
    type: 'Agent',
    name: 'Iris — Subscription & Recurring Bill Specialist',
    testFile: 'src/agents/iris/iris.test.js',
    uiFile: 'src/workspaces/iris/IrisWorkspace.jsx'
  },
  {
    id: 'atlas',
    branch: 'atlas',
    type: 'Agent',
    name: 'Atlas — Long-Term Goal & Savings Strategist',
    testFile: 'src/agents/atlas/atlas.test.js',
    uiFile: 'src/workspaces/atlas/AtlasWorkspace.jsx'
  },
  {
    id: 'sentinel',
    branch: 'sentinel',
    type: 'Tool',
    name: 'Sentinel — Deterministic Calculator & Predictor',
    testFile: 'src/tools/sentinel/sentinel.test.js',
    uiFile: 'src/workspaces/sentinel/SentinelWorkspace.jsx'
  },
  {
    id: 'tally',
    branch: 'tally',
    type: 'Tool',
    name: 'Tally — Categorization & Spending Analyser',
    testFile: 'src/tools/tally/tally.test.js',
    uiFile: 'src/workspaces/sentinel/SpendingSection.jsx'
  },
  {
    id: 'threshold-job',
    branch: 'threshold-job',
    type: 'Tool',
    name: 'Threshold Job — Deterministic Alerting Engine',
    testFile: 'src/tools/threshold-job/threshold-job.test.js',
    uiFile: null
  },
  {
    id: 'action-service',
    branch: 'action-service',
    type: 'Tool',
    name: 'Action Service — T1/T2/T3 Mutation Governance',
    testFile: 'src/tools/action-service/action-service.test.js',
    uiFile: null
  }
];

console.log('================================================================================');
console.log('🖥️  FINMATE AI — DESKTOP APPLICATION VERIFICATION SUITE');
console.log('================================================================================\n');

let allPassed = true;

for (const mod of MODULE_CHECKS) {
  const testAbs = path.join(ROOT_DIR, mod.testFile);
  if (!fs.existsSync(testAbs)) {
    console.error(`❌ [${mod.branch.toUpperCase()}] Missing test file: ${mod.testFile}`);
    allPassed = false;
    continue;
  }
  if (mod.uiFile && !fs.existsSync(path.join(ROOT_DIR, mod.uiFile))) {
    console.error(`❌ [${mod.branch.toUpperCase()}] Missing UI component: ${mod.uiFile}`);
    allPassed = false;
    continue;
  }

  try {
    execFileSync(process.execPath, [testAbs], { cwd: ROOT_DIR, stdio: 'pipe' });
    console.log(`✅ [${mod.type.toUpperCase()}: ${mod.branch.padEnd(14)}] ${mod.name} — PASSED`);
  } catch (err) {
    console.error(`❌ [${mod.type.toUpperCase()}: ${mod.branch.padEnd(14)}] ${mod.name} — FAILED`);
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    allPassed = false;
  }
}

console.log('\n--------------------------------------------------------------------------------');
console.log('🧪 Running Full 14-Suite Nova V4 Specification Acceptance Test Suite...');
console.log('--------------------------------------------------------------------------------');

try {
  execFileSync(process.execPath, [path.join(ROOT_DIR, 'tests', 'novaEngine.test.js')], {
    cwd: ROOT_DIR,
    stdio: 'pipe'
  });
  console.log('✅ [FULL V4 SUITE] All 14 Test Groups & All 12 V4 Acceptance Criteria — PASSED');
} catch (err) {
  console.error('❌ [FULL V4 SUITE] Failed:');
  if (err.stdout) console.error(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  allPassed = false;
}

console.log('\n================================================================================');
if (allPassed) {
  console.log('🎉 VERDICT: ALL MODULE & V4 ACCEPTANCE TESTS SUCCEEDED (100%)!');
  console.log('================================================================================\n');
  process.exit(0);
} else {
  console.error('🚨 VERDICT: APPLICATION VERIFICATION TESTS FAILED!');
  console.log('================================================================================\n');
  process.exit(1);
}
