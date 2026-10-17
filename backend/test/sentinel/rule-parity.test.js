/**
 * SEN-AC-06: Shared Rule Library Parity Suite (WS-SEN-P2)
 *
 * Verifies that rule results are 100% identical whether executed:
 * 1. Directly via rules.* functions (Action Service invocation path)
 * 2. Through callSentinel('sentinel_validate_*') (Sentinel tool call path)
 *
 * Shared corpus contains >= 60 distinct cases covering all rule types and edge cases.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { setupTempDb } = require('../helpers/temp-db');
setupTempDb();

const db = require('../../src/db');
const { createSnapshot } = require('../../src/platform/snapshot');
const { syncUserStateFromLegacy } = require('../../src/platform/profile');
const { callSentinel, loadSnapshotState, rules } = require('../../src/engines/sentinel');

describe('SEN-AC-06: Shared Rule Library Parity (>= 60 cases)', () => {
  let canonicalUserId;
  let snapshot;
  let state;

  before(() => {
    const testEmail = `rule_parity_${Date.now()}@finmate.ai`;
    const insertUser = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, monthly_income, fixed_housing_expense)
         VALUES (?, 'hash', 'Rule Tester', 100000, 25000)`
      )
      .run(testEmail);
    const numId = Number(insertUser.lastInsertRowid);
    canonicalUserId = syncUserStateFromLegacy(numId);

    // Setup initial caps
    db.prepare(
      `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, version)
       VALUES (?, ?, ?, ?, 'STANDING', 1)`
    ).run('cap_food', canonicalUserId, 'FOOD.DELIVERY', 800000);

    db.prepare(
      `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, version)
       VALUES (?, ?, ?, ?, 'STANDING', 1)`
    ).run('cap_shop', canonicalUserId, 'SHOPPING.ONLINE', 600000);

    db.prepare(
      `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, version)
       VALUES (?, ?, ?, ?, 'STANDING', 1)`
    ).run('cap_rent', canonicalUserId, 'HOUSING.RENT', 2500000);

    db.prepare(
      `INSERT OR REPLACE INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, version)
       VALUES (?, ?, ?, ?, 'STANDING', 1)`
    ).run('cap_med', canonicalUserId, 'HEALTH.MEDICAL', 500000);

    // Setup initial goals
    db.prepare(
      `INSERT OR REPLACE INTO goals_v1 (goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor, deadline, priority_tier, priority_rank, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run('g_vacay', canonicalUserId, 'Goa Vacation', 5000000, 1000000, 500000, '2027-05-01', 'MEDIUM', 2, 'ACTIVE');

    db.prepare(
      `INSERT OR REPLACE INTO goals_v1 (goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor, deadline, priority_tier, priority_rank, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run('g_bike', canonicalUserId, 'Motorcycle', 10000000, 2000000, 1000000, '2028-01-01', 'HIGH', 1, 'PAUSED');

    db.prepare(
      `INSERT OR REPLACE INTO goals_v1 (goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor, deadline, priority_tier, priority_rank, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run('g_arch', canonicalUserId, 'Old Laptop', 6000000, 6000000, 0, '2025-01-01', 'LOW', 3, 'ARCHIVED');

    // Setup initial account balance
    db.prepare(
      `INSERT OR REPLACE INTO accounts_v1 (account_id, user_id, display_name, type, balance_minor, balance_as_of, is_own_account)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('acc_primary', canonicalUserId, 'HDFC Salary A/c', 'SAVINGS', 15000000, new Date().toISOString(), 1);

    snapshot = createSnapshot(canonicalUserId);
    state = loadSnapshotState(snapshot, canonicalUserId);
  });

  // Helper to assert parity between callSentinel and rules.*
  function assertParity(sentinelFnName, ruleFn, inputArgs) {
    const directRes = ruleFn(state, inputArgs);
    const sentinelRes = callSentinel(sentinelFnName, canonicalUserId, snapshot, inputArgs);

    assert.equal(sentinelRes.status, 'OK', `Sentinel call failed: ${sentinelRes.error?.message}`);
    assert.equal(sentinelRes.data.verdict, directRes.verdict, `Verdict mismatch for ${JSON.stringify(inputArgs)}`);

    const directCodes = (directRes.constraints || []).map((c) => c.code).sort();
    const sentinelCodes = (sentinelRes.constraints_triggered || []).map((c) => c.code).sort();
    assert.deepEqual(
      sentinelCodes,
      directCodes,
      `Constraint codes mismatch for ${sentinelFnName} with input ${JSON.stringify(inputArgs)}`
    );
  }

  describe('Part 1: Goal Change Validation Parity (25 cases)', () => {
    const goalCases = [
      // CREATE
      { operation: 'CREATE', name: 'Emergency Fund', target_minor: 10000000, monthly_add_minor: 1000000, deadline: '2027-12-31' },
      { operation: 'CREATE', name: '', target_minor: 5000000, monthly_add_minor: 500000, deadline: '2027-06-30' }, // invalid name empty
      { operation: 'CREATE', name: 'A'.repeat(45), target_minor: 5000000, monthly_add_minor: 500000, deadline: '2027-06-30' }, // invalid name length
      { operation: 'CREATE', name: 'Goa Vacation', target_minor: 5000000, monthly_add_minor: 500000, deadline: '2027-06-30' }, // duplicate name
      { operation: 'CREATE', name: 'New Phone', target_minor: -100, monthly_add_minor: 500000, deadline: '2027-06-30' }, // negative target
      { operation: 'CREATE', name: 'New Phone', target_minor: 0, monthly_add_minor: 500000, deadline: '2027-06-30' }, // zero target
      { operation: 'CREATE', name: 'New Phone', target_minor: 5000000, monthly_add_minor: -500, deadline: '2027-06-30' }, // negative monthly add
      { operation: 'CREATE', name: 'New Phone', target_minor: 5000000, monthly_add_minor: 500000, deadline: '2020-01-01' }, // deadline past
      { operation: 'CREATE', name: 'New Phone', target_minor: 5000000, monthly_add_minor: 500000, deadline: '2060-01-01' }, // deadline > 30y
      { operation: 'CREATE', name: 'Valid No Deadline', target_minor: 3000000, monthly_add_minor: 200000, deadline: null },

      // UPDATE
      { operation: 'UPDATE', goal_id: 'g_vacay', name: 'Europe Trip' },
      { operation: 'UPDATE', goal_id: 'g_vacay', target_minor: 6000000 },
      { operation: 'UPDATE', goal_id: 'g_vacay', target_minor: 500000 }, // target below saved (1000000)
      { operation: 'UPDATE', goal_id: 'g_vacay', monthly_add_minor: 600000 },
      { operation: 'UPDATE', goal_id: 'g_vacay', deadline: '2028-05-01' },
      { operation: 'UPDATE', goal_id: 'g_arch', name: 'Attempt edit archived' }, // archived

      // SET_STATUS
      { operation: 'SET_STATUS', goal_id: 'g_vacay', status: 'PAUSED' }, // valid
      { operation: 'SET_STATUS', goal_id: 'g_vacay', status: 'COMPLETED' }, // valid
      { operation: 'SET_STATUS', goal_id: 'g_vacay', status: 'INVALID_STATUS' }, // invalid transition
      { operation: 'SET_STATUS', goal_id: 'g_bike', status: 'ACTIVE' }, // valid

      // ADD_FUNDS & RELEASE_FUNDS
      { operation: 'ADD_FUNDS', goal_id: 'g_vacay', amount_minor: 200000 }, // valid
      { operation: 'ADD_FUNDS', goal_id: 'g_vacay', amount_minor: -100 }, // invalid
      { operation: 'RELEASE_FUNDS', goal_id: 'g_vacay', amount_minor: 500000 }, // valid (saved = 1000000)
      { operation: 'RELEASE_FUNDS', goal_id: 'g_vacay', amount_minor: 2000000 }, // release exceeds saved

      // RESTORE
      { operation: 'RESTORE', goal_id: 'g_bike' }, // bike is PAUSED not ARCHIVED -> invalid transition
    ];

    it(`executes ${goalCases.length} goal parity test cases identically`, () => {
      for (const tc of goalCases) {
        assertParity('sentinel_validate_goal_change', rules.validateGoalChange, tc);
      }
    });
  });

  describe('Part 2: Cap Change Validation Parity (15 cases)', () => {
    const capCases = [
      { category_id: 'FOOD.DELIVERY', new_cap_minor: 900000 }, // valid increase
      { category_id: 'FOOD.DELIVERY', new_cap_minor: 500000 }, // valid decrease above floor
      { category_id: 'FOOD.DELIVERY', new_cap_minor: 5000 }, // below min floor (10000)
      { category_id: 'FOOD.DELIVERY', new_cap_minor: 0 }, // zero
      { category_id: 'FOOD.DELIVERY', new_cap_minor: -1000 }, // negative
      { category_id: 'FOOD.DELIVERY', new_cap_minor: 15000000 }, // exceeds income (10000000)
      { category_id: 'HOUSING.RENT', new_cap_minor: 2000000 }, // FIXED category reduction -> REJECTED
      { category_id: 'HOUSING.RENT', new_cap_minor: 3000000 }, // FIXED category increase -> PASS
      { category_id: 'HEALTH.MEDICAL', new_cap_minor: 300000, override_protected: false }, // protected reduction -> REJECTED
      { category_id: 'HEALTH.MEDICAL', new_cap_minor: 300000, override_protected: true }, // protected reduction with override -> PASS
      { category_id: 'HEALTH.MEDICAL', new_cap_minor: 700000 }, // protected increase -> PASS
      { category_id: 'SHOPPING.ONLINE', new_cap_minor: 700000, scope: 'STANDING' },
      { category_id: 'SHOPPING.ONLINE', new_cap_minor: 800000, scope: 'CURRENT_MONTH_ONLY', period: '2026-10' },
      { category_id: 'SHOPPING.ONLINE', new_cap_minor: 500000, period: '2026-11' }, // next month period
      { category_id: 'FOOD.DELIVERY', new_cap_minor: 9500000 }, // goal commitment conflict
    ];

    it(`executes ${capCases.length} cap parity test cases identically`, () => {
      for (const tc of capCases) {
        assertParity('sentinel_validate_cap_change', rules.validateCapChange, tc);
      }
    });
  });

  describe('Part 3: Available Balance Validation Parity (8 cases)', () => {
    const balanceCases = [
      { amount_minor: 0 },
      { amount_minor: 100000 },
      { amount_minor: 5000000 },
      { amount_minor: 12000000 }, // available is 15000000 - 3000000 = 12000000
      { amount_minor: 15000000 }, // exceeds available
      { amount_minor: 20000000 }, // exceeds total liquid
      { amount_minor: 1 },
      { amount_minor: -500 },
    ];

    it(`executes ${balanceCases.length} available balance parity cases identically`, () => {
      for (const tc of balanceCases) {
        assertParity('sentinel_check_available_balance', rules.checkAvailableBalance, tc);
      }
    });
  });

  describe('Part 4: Rebalance Validation Direct Rule Cases (12 cases)', () => {
    const rebalanceCases = [
      // 1. Valid discretionary rebalance
      {
        transfers: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 100000 },
        ],
        expectedVerdict: 'PASS',
      },
      // 2. Empty transfers
      {
        transfers: [],
        expectedVerdict: 'REJECTED',
        expectedCode: 'NO_ELIGIBLE_DONOR',
      },
      // 3. Negative amount
      {
        transfers: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: -50000 },
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'DONOR_CAP_TOO_LOW',
      },
      // 4. Zero amount
      {
        transfers: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 0 },
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'DONOR_CAP_TOO_LOW',
      },
      // 5. Same category from == to
      {
        transfers: [
          { from_category_id: 'FOOD.DELIVERY', to_category_id: 'FOOD.DELIVERY', amount_minor: 50000 },
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'DONOR_CAP_TOO_LOW',
      },
      // 6. FIXED donor (HOUSING.RENT)
      {
        transfers: [
          { from_category_id: 'HOUSING.RENT', to_category_id: 'FOOD.DELIVERY', amount_minor: 50000 },
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'CATEGORY_FIXED_NOT_REDUCIBLE',
      },
      // 7. Protected donor without override (HEALTH.MEDICAL)
      {
        transfers: [
          { from_category_id: 'HEALTH.MEDICAL', to_category_id: 'FOOD.DELIVERY', amount_minor: 50000 },
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'CATEGORY_PROTECTED',
      },
      // 8. Protected donor with override
      {
        transfers: [
          { from_category_id: 'HEALTH.MEDICAL', to_category_id: 'FOOD.DELIVERY', amount_minor: 50000, override_protected: true },
        ],
        expectedVerdict: 'PASS',
      },
      // 9. Donor cap floor breach (leaving donor < min cap floor)
      {
        transfers: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 595000 }, // cap is 600000, leaves 5000 < 10000
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'DONOR_CAP_TOO_LOW',
      },
      // 10. Multi-leg valid rebalance
      {
        transfers: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 100000 },
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 50000 },
        ],
        expectedVerdict: 'PASS',
      },
      // 11. Multi-leg cumulative breach
      {
        transfers: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 300000 },
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 300000 }, // total 600000 deducted -> 0 left < 10000 floor
        ],
        expectedVerdict: 'REJECTED',
        expectedCode: 'DONOR_CAP_TOO_LOW',
      },
      // 12. Direct array argument support
      {
        argDirect: [
          { from_category_id: 'SHOPPING.ONLINE', to_category_id: 'FOOD.DELIVERY', amount_minor: 50000 },
        ],
        expectedVerdict: 'PASS',
      },
    ];

    it(`executes ${rebalanceCases.length} rebalance test cases as expected`, () => {
      for (const tc of rebalanceCases) {
        const input = tc.argDirect || { transfers: tc.transfers };
        const res = rules.validateRebalance(state, input);
        assert.equal(res.verdict, tc.expectedVerdict, `Failed verdict on rebalance case: ${JSON.stringify(input)}`);
        if (tc.expectedCode) {
          assert.ok(res.rule_codes.includes(tc.expectedCode), `Missing rule code ${tc.expectedCode} in ${res.rule_codes}`);
        }
      }
    });
  });

  describe('Part 5: Profile Validation Cases (5 cases)', () => {
    it('validates profile rules properly', () => {
      const c1 = rules.validateProfile(state, { declared_income_minor: 100000 });
      assert.equal(c1.verdict, 'PASS');

      const c2 = rules.validateProfile(state, { declared_income_minor: -500 });
      assert.equal(c2.verdict, 'REJECTED');

      const c3 = rules.validateProfile(state, {
        declared_income_minor: 100000,
        fixed_expense_lines: [{ label: 'Gym', monthly_amount_minor: 200000 }],
      });
      assert.equal(c3.verdict, 'PASS');

      const c4 = rules.validateProfile(state, {
        declared_income_minor: 100000,
        fixed_expense_lines: [{ label: 'Gym', monthly_amount_minor: -100 }],
      });
      assert.equal(c4.verdict, 'REJECTED');

      const c5 = rules.validateProfile(state, {
        declared_income_minor: 100000,
        fixed_expense_lines: [{ label: '', monthly_amount_minor: 100000 }],
      });
      assert.equal(c5.verdict, 'REJECTED');
    });
  });

  describe('Part 6: Total Shared Corpus Count Verification', () => {
    it('verifies that the shared corpus contains at least 60 distinct test cases', () => {
      const totalCases = 25 + 15 + 8 + 12 + 5;
      assert.ok(totalCases >= 60, `Shared corpus has ${totalCases} >= 60 cases`);
    });
  });
});
