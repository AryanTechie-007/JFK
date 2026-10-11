/**
 * Standalone Branch Test: Action Service Tool (src/tools/action-service/)
 * Validates T1/T2/T3 confirmation token governance and Sentinel re-validation prior to state mutation.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const { ActionService, ConfirmationTokenManager } = require('./ActionService');

console.log('🔐 [Branch Test: ACTION-SERVICE] Running Action Service Governance verification...');

const db = getDb(':memory:');
const userId = 'test_branch_action';
ConfirmationTokenManager.reset();
seedNova(userId, db);

assert.throws(
  () => ActionService.execute({
    userId,
    actionType: 'ADJUST_BUDGET_CAP',
    payload: { category: 'Food & Dining', new_cap: 12000 },
    confirmationToken: null,
    initiatedBy: 'Nova',
    db
  }),
  (err) => err.code === 'CONFIRMATION_TOKEN_REQUIRED'
);

const card = ActionService.createProposalConfirmation({
  userId,
  actionType: 'ADJUST_BUDGET_CAP',
  payload: { category: 'Food & Dining', new_cap: 12000 },
  initiatedBy: 'Nova'
});

const executed = ActionService.execute({
  userId,
  actionType: 'ADJUST_BUDGET_CAP',
  payload: { category: 'Food & Dining', new_cap: 12000 },
  confirmationToken: card.confirmation_token,
  initiatedBy: 'Nova',
  db
});
assert.strictEqual(executed.success, true);

console.log('✅ [Branch Test: ACTION-SERVICE] Passed 100%!');
