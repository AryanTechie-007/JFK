/**
 * 10. `sentinel_run_goal_progress` (Sentinel §B.6.10, §C.3, §K.1)
 */

const { multiplyMinorByBp, ratioToBp } = require('../../../shared/money');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, addMonthsToYearMonth } = require('../inputs/load');
const { buildEnvelope } = require('./envelope');

function sentinel_run_goal_progress(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const goalId = args.goal_id;
  const goal = state.all_goals_including_archived.find((g) => g.goal_id === goalId);

  if (!goal) {
    return buildEnvelope(
      state,
      'sentinel_run_goal_progress',
      null,
      'LOW',
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Goal ${goalId} not found.` },
      { registry, params: args }
    );
  }

  const targetMinor = Math.trunc(Number(goal.target_minor) || 0);
  const savedMinor = Math.trunc(Number(goal.saved_minor) || 0);
  const remainingMinor = Math.max(0, targetMinor - savedMinor);
  const progressBp =
    goal.status === 'COMPLETED'
      ? 10000
      : targetMinor > 0
      ? Math.min(10000, ratioToBp(savedMinor, targetMinor))
      : 0;
  const effectiveMonthlyAddMinor = Math.trunc(
    Number(goal.effective_monthly_add_minor ?? goal.monthly_add_minor) || 0
  );

  // Trailing actual contribution minor (§B.6.10)
  const trailingActualContributionMinor =
    effectiveMonthlyAddMinor > 0 ? effectiveMonthlyAddMinor : savedMinor > 0 ? savedMinor : null;

  let monthsToTarget = null;
  let projectedDate = null;
  let conservativeDate = null;
  let accelerationExtraMonthlyMinor = null;

  if (goal.status === 'COMPLETED') {
    monthsToTarget = 0;
    projectedDate = null;
    conservativeDate = null;
  } else if (remainingMinor === 0) {
    monthsToTarget = 0;
    projectedDate = `${state.current_month_ist}-01`;
    conservativeDate = `${state.current_month_ist}-01`;
  } else if (effectiveMonthlyAddMinor > 0) {
    monthsToTarget = Math.ceil(remainingMinor / effectiveMonthlyAddMinor);
    const projYm = addMonthsToYearMonth(state.current_month_ist, monthsToTarget);
    projectedDate = `${projYm}-01`;

    const conservativeAddMinor = Math.max(1, multiplyMinorByBp(effectiveMonthlyAddMinor, 8000));
    const conservativeMonths = Math.ceil(remainingMinor / conservativeAddMinor);
    const consYm = addMonthsToYearMonth(state.current_month_ist, conservativeMonths);
    conservativeDate = `${consYm}-01`;

    // Additional monthly add to reach target 1 month earlier than projected_date (§B.6.10)
    if (monthsToTarget > 1) {
      const neededForOneMonthEarlier = Math.ceil(remainingMinor / (monthsToTarget - 1));
      accelerationExtraMonthlyMinor = Math.max(
        0,
        neededForOneMonthEarlier - effectiveMonthlyAddMinor
      );
    }
  }

  let requiredMonthlyAddForDeadlineMinor =
    goal.deadline && remainingMinor > 0 ? effectiveMonthlyAddMinor : null;
  let onTrack = goal.deadline ? true : null;
  let trajectory = goal.status === 'PAUSED' ? 'PAUSED' : 'ON_TRACK';

  if (goal.deadline && remainingMinor > 0) {
    const [dy, dm] = String(goal.deadline).slice(0, 7).split('-').map(Number);
    const [cy, cm] = state.current_month_ist.split('-').map(Number);
    const monthsUntilDeadline = Math.max(1, (dy - cy) * 12 + (dm - cm));
    requiredMonthlyAddForDeadlineMinor = Math.ceil(remainingMinor / monthsUntilDeadline);
    if (effectiveMonthlyAddMinor < requiredMonthlyAddForDeadlineMinor) {
      trajectory = 'AT_RISK';
      onTrack = false;
    } else {
      onTrack = true;
    }
  } else if (remainingMinor > 0 && effectiveMonthlyAddMinor === 0 && goal.status === 'ACTIVE') {
    trajectory = 'AT_RISK';
    if (goal.deadline) onTrack = false;
  }

  const intrinsicConf =
    effectiveMonthlyAddMinor > 0 && savedMinor > 0 ? 'HIGH' : effectiveMonthlyAddMinor > 0 ? 'MEDIUM' : 'LOW';

  return buildEnvelope(
    state,
    'sentinel_run_goal_progress',
    {
      // Canonical §C.3 fields
      goal_id: goal.goal_id,
      name: goal.name,
      status: goal.status,
      saved_minor: savedMinor,
      target_minor: targetMinor,
      remaining_minor: remainingMinor,
      progress_bp: progressBp,
      effective_monthly_add_minor: effectiveMonthlyAddMinor,
      trailing_actual_contribution_minor: trailingActualContributionMinor,
      projected_date: projectedDate,
      conservative_date: conservativeDate,
      deadline: goal.deadline || null,
      on_track: onTrack,
      required_monthly_add_for_deadline_minor:
        requiredMonthlyAddForDeadlineMinor ?? effectiveMonthlyAddMinor,
      acceleration_extra_monthly_minor: accelerationExtraMonthlyMinor,
      // Legacy compatibility fields
      priority_tier: goal.priority_tier,
      standing_monthly_add_minor: goal.standing_monthly_add_minor,
      monthly_add_minor: effectiveMonthlyAddMinor,
      has_month_override: goal.has_month_override,
      months_to_target: monthsToTarget,
      trajectory,
    },
    intrinsicConf,
    [],
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_run_goal_progress,
};
