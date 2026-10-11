/**
 * 11 & 12. `sentinel_run_goal_feasibility` & `sentinel_validate_goal_change` (Sentinel §B.6.11, §B.6.12, §C.3, §K.1)
 */

const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState } = require('../inputs/load');
const { makeConstraint, validateGoalChange } = require('../rules/goal');
const { sentinel_get_surplus_baseline } = require('./surplus');
const { buildEnvelope } = require('./envelope');

function sentinel_run_goal_feasibility(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const {
    goal_id = null,
    proposed_monthly_add_minor = 0,
    target_minor = null,
    deadline = null,
    period = null,
  } = args;

  const baselineRes = sentinel_get_surplus_baseline(state, {}, registry);
  const b = baselineRes.data;

  const otherGoalsMinor = state.goals
    .filter((g) => g.status === 'ACTIVE' && g.goal_id !== goal_id)
    .reduce((sum, g) => sum + (Number(g.effective_monthly_add_minor) || 0), 0);

  const proposedMinor = Math.trunc(Number(proposed_monthly_add_minor) || 0);
  const goalCommitmentsInclProposedMinor = otherGoalsMinor + proposedMinor;

  // §B.6.11 canonical headrooms
  const headroomVsSurplusCanonical =
    b.income_minor - b.fixed_total_minor - goalCommitmentsInclProposedMinor;
  const headroomAfterCapsCanonical = headroomVsSurplusCanonical - b.caps_total_minor;
  const conservativeHeadroomAfterCapsCanonical =
    b.conservative_income_minor -
    b.fixed_total_minor -
    goalCommitmentsInclProposedMinor -
    b.caps_total_minor;

  // Legacy surplus-after-discretionary headroom
  const availableSurplusBeforeGoalMinor =
    b.income_minor - b.fixed_commitments_minor - b.discretionary_baseline_minor - otherGoalsMinor;
  const remainingSurplusAfterGoalMinor = availableSurplusBeforeGoalMinor - proposedMinor;

  const constraints = [...baselineRes.constraints_triggered];
  const verdictIncome = baselineRes.confidence === 'HIGH' ? 'CENTRAL' : 'CONSERVATIVE';

  let verdict = 'FEASIBLE';
  let canonicalVerdict = 'FITS';

  if (proposedMinor > 0 && remainingSurplusAfterGoalMinor < 0) {
    verdict = 'SHORTFALL';
    canonicalVerdict = 'SHORTFALL';
    constraints.push(
      makeConstraint('SURPLUS_SHORTFALL', {
        available_surplus_minor: Math.max(0, availableSurplusBeforeGoalMinor),
        proposed_monthly_add_minor: proposedMinor,
      })
    );
  } else if (
    remainingSurplusAfterGoalMinor < b.buffer_floor_minor ||
    (headroomAfterCapsCanonical < 0 && headroomVsSurplusCanonical >= 0)
  ) {
    verdict = 'TIGHT';
    canonicalVerdict = 'TIGHT';
    constraints.push(
      makeConstraint(
        'FEASIBILITY_TIGHT',
        { remaining_buffer_minor: Math.max(0, remainingSurplusAfterGoalMinor) },
        'WARNING'
      )
    );
  }

  let requiredMonthlyAddForDeadlineMinor = proposedMinor;
  if (target_minor != null && deadline) {
    const existingGoal = goal_id ? state.goals.find((g) => g.goal_id === goal_id) : null;
    const saved = existingGoal ? Number(existingGoal.saved_minor) || 0 : 0;
    const rem = Math.max(0, Number(target_minor) - saved);
    const [dy, dm] = String(deadline).slice(0, 7).split('-').map(Number);
    const [cy, cm] = state.current_month_ist.split('-').map(Number);
    const mLeft = Math.max(1, (dy - cy) * 12 + (dm - cm));
    requiredMonthlyAddForDeadlineMinor = Math.ceil(rem / mLeft);
  }

  return buildEnvelope(
    state,
    'sentinel_run_goal_feasibility',
    {
      // Canonical §C.3 fields + legacy compatibility
      goal_id,
      period: period || state.current_month_ist,
      verdict,
      canonical_verdict: canonicalVerdict,
      income_basis: b.income_basis,
      verdict_income: verdictIncome,
      headroom_vs_surplus_signed_minor: remainingSurplusAfterGoalMinor,
      canonical_headroom_vs_surplus_signed_minor: headroomVsSurplusCanonical,
      headroom_after_caps_signed_minor: headroomAfterCapsCanonical,
      conservative_headroom_after_caps_signed_minor: conservativeHeadroomAfterCapsCanonical,
      components: {
        income_minor: b.income_minor,
        fixed_total_minor: b.fixed_total_minor,
        goal_commitments_incl_proposed_minor: goalCommitmentsInclProposedMinor,
        caps_total_minor: b.caps_total_minor,
      },
      proposed_monthly_add_minor: proposedMinor,
      other_goals_commitments_minor: otherGoalsMinor,
      available_surplus_minor: Math.max(0, availableSurplusBeforeGoalMinor),
      buffer_floor_minor: b.buffer_floor_minor,
      required_monthly_add_for_deadline_minor: requiredMonthlyAddForDeadlineMinor,
    },
    baselineRes.confidence,
    constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

function sentinel_validate_goal_change(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const res = validateGoalChange(state, args, registry);
  if (res.error_code === 'UNKNOWN_ENTITY') {
    return buildEnvelope(
      state,
      'sentinel_validate_goal_change',
      null,
      null,
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Goal ${args.goal_id} not found.` },
      { registry, params: args }
    );
  }
  return buildEnvelope(
    state,
    'sentinel_validate_goal_change',
    {
      verdict: res.verdict,
      rule_codes: res.rule_codes,
      operation: res.operation,
      goal_id: res.goal_id,
      period: res.period,
    },
    null,
    res.constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_run_goal_feasibility,
  sentinel_validate_goal_change,
};
