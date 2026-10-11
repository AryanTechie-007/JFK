/**
 * 17. `sentinel_project_sip` & `sentinel_validate_profile` (Sentinel §B.6.17, §C.3, §K.1, SEN-AC-20)
 */

const { halfEvenRoundBigInt, multiplyMinorByBp } = require('../../../shared/money');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState } = require('../inputs/load');
const { validateProfile } = require('../rules/profile');
const { buildEnvelope } = require('./envelope');

function sentinel_project_sip(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot
    ? stateInput
    : loadSnapshotState(stateInput, args?.user_id);

  const monthlyAmountMinor = Math.max(0, Math.trunc(Number(args.monthly_amount_minor) || 0));
  const annualRateBp = Math.min(3000, Math.max(0, Math.trunc(Number(args.annual_rate_bp) || 0)));
  const months = Math.min(600, Math.max(1, Math.trunc(Number(args.months) || 12)));
  const annualStepUpBp = Math.min(
    5000,
    Math.max(0, Math.trunc(Number(args.annual_step_up_bp) || 0))
  );

  let totalContributedMinor = 0;
  let corpusMinor = 0;
  let currentMonthlyMinor = monthlyAmountMinor;
  const yearlySchedule = [];

  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0 && annualStepUpBp > 0) {
      currentMonthlyMinor += multiplyMinorByBp(currentMonthlyMinor, annualStepUpBp);
    }
    totalContributedMinor += currentMonthlyMinor;
    corpusMinor += currentMonthlyMinor;
    // Annuity-due monthly compounding: value_m = (value_{m-1} + instalment_m) * (1 + r)
    // where r = annual_rate_bp / 120000
    const monthlyInterestMinor = halfEvenRoundBigInt(
      BigInt(corpusMinor) * BigInt(annualRateBp),
      120000n
    );
    corpusMinor += monthlyInterestMinor;

    if (m % 12 === 0 || m === months) {
      yearlySchedule.push({
        month: m,
        year: Math.ceil(m / 12),
        // Canonical §C.3 fields
        invested_minor: totalContributedMinor,
        value_minor: corpusMinor,
        // Legacy compatibility fields
        monthly_installment_minor: currentMonthlyMinor,
        total_contributed_minor: totalContributedMinor,
        projected_corpus_minor: corpusMinor,
        projected_gain_minor: Math.max(0, corpusMinor - totalContributedMinor),
      });
    }
  }

  const estimatedGainMinor = Math.max(0, corpusMinor - totalContributedMinor);

  return buildEnvelope(
    state,
    'sentinel_project_sip',
    {
      // Canonical §C.3 fields
      future_value_minor: corpusMinor,
      total_invested_minor: totalContributedMinor,
      estimated_gain_minor: estimatedGainMinor,
      yearly_schedule: yearlySchedule,
      illustrative: true,
      rate_source: 'USER_SUPPLIED',
      // Legacy compatibility fields
      illustrative_only: true,
      monthly_amount_minor: monthlyAmountMinor,
      annual_rate_bp: annualRateBp,
      months,
      annual_step_up_bp: annualStepUpBp,
      total_contributed_minor: totalContributedMinor,
      projected_corpus_minor: corpusMinor,
      projected_gain_minor: estimatedGainMinor,
      schedule: yearlySchedule,
    },
    null,
    [],
    'OK',
    null,
    { registry, params: args }
  );
}

function sentinel_validate_profile(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot
    ? stateInput
    : loadSnapshotState(stateInput, args?.user_id);
  const res = validateProfile(state, args);
  return buildEnvelope(
    state,
    'sentinel_validate_profile',
    {
      verdict: res.verdict,
      rule_codes: res.rule_codes,
      warnings: res.warnings,
      errors: res.errors,
    },
    null,
    res.constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_project_sip,
  sentinel_validate_profile,
};
