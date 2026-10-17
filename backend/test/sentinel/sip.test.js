const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { sentinel_project_sip } = require('../../src/engines/sentinel');

describe('SEN-AC-20: SIP Reference Suite (20 Cases)', () => {
  const dummyState = {
    snapshot: {
      snapshot_id: 'snp_test',
      ledger_version: 1,
      plan_version: 1,
      categorization_version: 1,
    },
    data_quality: {
      coverage_bp: 10000,
      provisional_share_bp: 0,
      complete: true,
      needs_review_count: 0,
      uncategorized_amount_minor: 0,
    },
  };

  const testCases = [
    // [monthlyMinor, rateBp, months, stepUpBp, desc]
    [100000, 0, 12, 0, 'Zero rate 1 year'],
    [500000, 1200, 12, 0, '12% rate 1 year basic'],
    [1000000, 1200, 24, 0, '12% rate 2 years'],
    [50000, 1500, 36, 0, '15% rate 3 years small amount'],
    [2000000, 800, 60, 0, '8% rate 5 years conservative'],
    [1000000, 1200, 12, 1000, '10% annual step up 1 year (no step triggered before m=13)'],
    [1000000, 1200, 24, 1000, '10% annual step up 2 years (step triggered at m=13)'],
    [500000, 1200, 36, 1000, '10% step up 3 years'],
    [100000, 600, 6, 0, 'Short duration 6 months'],
    [2500000, 1400, 120, 500, '10 years 5% step up long horizon'],
    [100000, 2000, 12, 0, 'High yield 20% 1 year'],
    [500000, 0, 60, 1000, 'Zero rate with step up 5 years'],
    [1000000, 1000, 1, 0, 'Single month edge case'],
    [0, 1200, 12, 0, 'Zero amount edge case'],
    [500000, 3000, 24, 0, 'Max rate 30% edge case'],
    [100000, 1200, 13, 1000, 'Boundary test: m=13 first month of step up'],
    [200000, 1100, 48, 1500, '15% step up 4 years'],
    [750000, 950, 84, 0, '7 years fixed SIP'],
    [3000000, 1350, 15, 2000, '15 months with 20% step up'],
    [400000, 1250, 50, 750, '50 months uneven duration'],
  ];

  test('runs exactly 20 reference cases', () => {
    assert.equal(testCases.length, 20);
  });

  for (let i = 0; i < testCases.length; i++) {
    const [monthly, rate, months, stepUp, desc] = testCases[i];
    test(`Case ${i + 1}: ${desc}`, () => {
      const res = sentinel_project_sip(dummyState, {
        monthly_amount_minor: monthly,
        annual_rate_bp: rate,
        months,
        annual_step_up_bp: stepUp,
      });

      assert.equal(res.status, 'OK');
      const d = res.data;

      // Mathematical invariants
      assert.ok(d.total_contributed_minor >= monthly * Math.min(1, months), 'contributed >= base');
      assert.ok(d.projected_corpus_minor >= d.total_contributed_minor, 'corpus >= contribution');
      assert.equal(
        d.projected_gain_minor,
        d.projected_corpus_minor - d.total_contributed_minor,
        'gain = corpus - contributed'
      );

      if (rate === 0) {
        assert.equal(d.projected_gain_minor, 0, '0% rate must yield 0 gain');
      }

      if (monthly === 0) {
        assert.equal(d.projected_corpus_minor, 0, '0 amount must yield 0 corpus');
      }

      if (months > 12 && stepUp > 0 && monthly > 0) {
        // Step up verification: schedule year 2 installment must be strictly greater than year 1
        const y1 = d.schedule.find((s) => s.year === 1);
        const y2 = d.schedule.find((s) => s.year === 2);
        if (y1 && y2) {
          assert.ok(
            y2.monthly_installment_minor > y1.monthly_installment_minor,
            'year 2 monthly installment must increase by step up'
          );
        }
      }
    });
  }
});
