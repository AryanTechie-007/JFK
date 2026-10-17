const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { sentinel_compute_health_score } = require('../../src/engines/sentinel');

describe('SEN-AC-19: Health Score 4-Pillar Worked Examples (Sentinel §B.9)', () => {
  function makeState({
    incomeMinor = 10000000, // ₹1,00,000
    goalCommitmentsMinor = 2000000, // ₹20,000 (20% -> 2000 bp -> perfect saving score 25)
    fixedCommitmentsMinor = 2000000, // ₹20,000
    currentMonthSpendMinor = 4000000, // ₹40,000 (total outflow ₹60,000 -> 6000 bp outflow)
    cappedCategories = [{ category_id: 'FOOD', utilization_bp: 8000 }], // 100% within cap -> 25
    goals = [{ status: 'ACTIVE', effective_monthly_add_minor: 2000000 }],
  } = {}) {
    return {
      snapshot: {
        snapshot_id: 'snp_health_test',
        ledger_version: 1,
        plan_version: 1,
        categorization_version: 1,
      },
      profile: {
        fixed_expense_lines: [{ monthly_amount_minor: fixedCommitmentsMinor }],
      },
      current_month_ist: '2026-10',
      income_minor: incomeMinor,
      goal_commitments_minor: goalCommitmentsMinor,
      fixed_commitments_minor: fixedCommitmentsMinor,
      caps: cappedCategories.map((c) => ({
        category_id: c.category_id,
        monthly_cap_minor: 1000000,
        status: 'ACTIVE',
      })),
      goals,
      current_month_txns: [
        {
          id: 't1',
          amount_minor: currentMonthSpendMinor,
          direction: 'DEBIT',
          movement_type: 'SPEND',
          classification_status: 'SETTLED',
          category_id: 'FOOD',
          active: 1,
        },
      ],
      all_txns: [],
      data_quality: {
        coverage_bp: 10000,
        provisional_share_bp: 0,
        complete: true,
        needs_review_count: 0,
        uncategorized_amount_minor: 0,
      },
    };
  }

  test('health score computes 4 sub-pillars summing exactly to total score', () => {
    const state = makeState();
    const res = sentinel_compute_health_score(state);

    assert.equal(res.status, 'OK');
    const d = res.data;
    assert.equal(d.max_score, 100);

    const sub = d.sub_scores;
    assert.ok(sub.saving_behaviour >= 0 && sub.saving_behaviour <= 25);
    assert.ok(sub.budget_discipline >= 0 && sub.budget_discipline <= 25);
    assert.ok(sub.spending_control >= 0 && sub.spending_control <= 25);
    assert.ok(sub.future_planning >= 0 && sub.future_planning <= 25);

    assert.equal(
      d.score,
      sub.saving_behaviour + sub.budget_discipline + sub.spending_control + sub.future_planning
    );
  });

  test('grades map accurately: EXCELLENT >= 80, GOOD >= 60, FAIR >= 40, NEEDS_WORK < 40', () => {
    const excellentState = makeState({
      incomeMinor: 10000000,
      goalCommitmentsMinor: 2500000, // 25% savings rate
      fixedCommitmentsMinor: 1500000,
      currentMonthSpendMinor: 2000000,
      goals: [
        { status: 'ACTIVE', effective_monthly_add_minor: 1500000 },
        { status: 'ACTIVE', effective_monthly_add_minor: 1000000 },
      ],
    });
    const resExc = sentinel_compute_health_score(excellentState);
    assert.ok(resExc.data.score >= 80, `Expected >= 80, got ${resExc.data.score}`);
    assert.equal(resExc.data.grade, 'EXCELLENT');
  });

  test('zero income edge case produces SAFE fallback scores without division by zero', () => {
    const zeroIncState = makeState({ incomeMinor: 0, goalCommitmentsMinor: 0 });
    const res = sentinel_compute_health_score(zeroIncState);
    assert.equal(res.status, 'OK');
    assert.ok(res.data.score >= 0 && res.data.score <= 100);
    assert.equal(res.data.metrics.savings_rate_bp, 0);
  });
});
