/**
 * Sentinel Goal Rule Library (`rules/goal.js` — Sentinel §B.6.12, §E, §K.1, SEN-AC-06)
 */

const { renderConstraintMessage, CONSTRAINT_REGISTRY } = require('../../../shared/contracts/constraint-messages');
const { SENTINEL_PARAMS } = require('../params');

function makeConstraint(code, details = {}, overrideSeverity = null) {
  const reg = CONSTRAINT_REGISTRY[code] || { default_severity: 'MANDATORY' };
  return {
    code,
    severity: overrideSeverity || reg.default_severity,
    source: 'SENTINEL_RESULT',
    message: renderConstraintMessage(code, details),
    details,
  };
}

function addCodeAndConstraint(constraints, ruleCodes, code, details = {}, severity = 'MANDATORY') {
  if (!ruleCodes.includes(code)) {
    ruleCodes.push(code);
  }
  if (!constraints.some((c) => c.code === code)) {
    constraints.push(makeConstraint(code, details, severity));
  }
}

/**
 * Validates a goal mutation against current snapshot state.
 */
function validateGoalChange(state, params = {}, registry = SENTINEL_PARAMS) {
  const {
    operation = 'CREATE',
    goal_id = null,
    name,
    target_minor,
    monthly_add_minor,
    deadline,
    status,
    amount_minor,
    period,
  } = params;

  const constraints = [];
  const ruleCodes = [];
  const currentDateIst =
    state.current_date_ist || state.asOfDate || new Date().toISOString().slice(0, 10);
  const maxYears = (registry && registry.goal && registry.goal.max_years) || 30;
  const maxActiveGoals = (registry && registry.goal && registry.goal.max_active) || 20;
  const maxYear = parseInt(currentDateIst.slice(0, 4), 10) + maxYears;
  const maxDeadline = `${maxYear}${currentDateIst.slice(4)}`;

  const allGoals = state.all_goals_including_archived || state.goals || [];
  const activeOrPausedGoals = (state.goals || allGoals).filter((g) => g.status !== 'ARCHIVED');
  const targetGoal = goal_id ? allGoals.find((g) => g.goal_id === goal_id) : null;

  if (operation !== 'CREATE' && !targetGoal) {
    return {
      verdict: 'REJECTED',
      rule_codes: ['UNKNOWN_ENTITY'],
      warnings: [],
      constraints: [],
      error_code: 'UNKNOWN_ENTITY',
    };
  }

  // Precision check (AMOUNT_PRECISION)
  for (const [field, val] of [
    ['target_minor', target_minor],
    ['monthly_add_minor', monthly_add_minor],
    ['amount_minor', amount_minor],
  ]) {
    if (val !== undefined && val !== null) {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        addCodeAndConstraint(constraints, ruleCodes, 'AMOUNT_PRECISION', { field, value: val });
      }
    }
  }

  // Max active goals check (GOAL_LIMIT)
  if (operation === 'CREATE' && activeOrPausedGoals.length >= maxActiveGoals) {
    addCodeAndConstraint(constraints, ruleCodes, 'GOAL_LIMIT', {
      max_active: maxActiveGoals,
      current_active: activeOrPausedGoals.length,
    });
  }

  // Archived / Status checks
  if (targetGoal && targetGoal.status === 'ARCHIVED' && operation !== 'RESTORE') {
    addCodeAndConstraint(constraints, ruleCodes, 'GOAL_ALREADY_ARCHIVED', { goal_id });
    addCodeAndConstraint(constraints, ruleCodes, 'GOAL_NOT_ACTIVE', { goal_id, status: targetGoal.status });
  }

  if (
    (operation === 'ADD_FUNDS' || operation === 'SET_MONTH_OVERRIDE') &&
    targetGoal &&
    targetGoal.status !== 'ACTIVE'
  ) {
    addCodeAndConstraint(constraints, ruleCodes, 'GOAL_NOT_ACTIVE', {
      goal_id,
      status: targetGoal.status,
      operation,
    });
  }

  if (
    operation === 'RELEASE_FUNDS' &&
    targetGoal &&
    !['ACTIVE', 'PAUSED', 'COMPLETED'].includes(targetGoal.status)
  ) {
    addCodeAndConstraint(constraints, ruleCodes, 'GOAL_NOT_ACTIVE', {
      goal_id,
      status: targetGoal.status,
      operation,
    });
  }

  if (operation === 'RESTORE' && targetGoal) {
    if (targetGoal.status !== 'ARCHIVED') {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_STATUS_TRANSITION_INVALID', {
        from: targetGoal.status,
        to: 'PAUSED',
      });
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_NOT_ACTIVE', {
        from: targetGoal.status,
        to: 'PAUSED',
      });
    } else if (
      targetGoal.restore_until &&
      new Date(currentDateIst) > new Date(targetGoal.restore_until)
    ) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_RESTORE_EXPIRED', {
        restore_until: targetGoal.restore_until,
      });
      addCodeAndConstraint(constraints, ruleCodes, 'RESTORE_WINDOW_EXPIRED', {
        restore_until: targetGoal.restore_until,
      });
    }
  }

  // Name validation (NAME_INVALID / GOAL_NAME_INVALID)
  if (operation === 'CREATE' || (operation === 'UPDATE' && name !== undefined)) {
    const cleanName = String(name || '').trim();
    const isDuplicate = activeOrPausedGoals.some(
      (g) =>
        g.goal_id !== goal_id &&
        g.status !== 'ARCHIVED' &&
        String(g.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (!cleanName || cleanName.length > 40 || isDuplicate) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_NAME_INVALID', { name: cleanName });
      addCodeAndConstraint(constraints, ruleCodes, 'NAME_INVALID', { name: cleanName });
    }
  }

  // Target validation (TARGET_NOT_POSITIVE, TARGET_BELOW_SAVED)
  const effectiveTargetMinor =
    target_minor !== undefined && target_minor !== null
      ? Number(target_minor)
      : targetGoal
      ? Number(targetGoal.target_minor)
      : null;

  if (operation === 'CREATE' || (operation === 'UPDATE' && target_minor !== undefined)) {
    const tMinor = Number(target_minor);
    if (!Number.isFinite(tMinor) || tMinor <= 0) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_TARGET_NOT_POSITIVE', { target_minor: tMinor });
      addCodeAndConstraint(constraints, ruleCodes, 'TARGET_NOT_POSITIVE', { target_minor: tMinor });
    } else if (targetGoal && tMinor < (Number(targetGoal.saved_minor) || 0)) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_TARGET_BELOW_SAVED', {
        target_minor: tMinor,
        saved_minor: targetGoal.saved_minor,
      });
      addCodeAndConstraint(constraints, ruleCodes, 'TARGET_BELOW_SAVED', {
        target_minor: tMinor,
        saved_minor: targetGoal.saved_minor,
      });
    }
  }

  // Monthly add validation (GOAL_MONTHLY_ADD_NEGATIVE, CONTRIBUTION_EXCEEDS_TARGET)
  if (
    operation === 'CREATE' ||
    (operation === 'UPDATE' && monthly_add_minor !== undefined) ||
    operation === 'SET_MONTH_OVERRIDE'
  ) {
    const mMinor = Number(monthly_add_minor);
    if (!Number.isFinite(mMinor) || mMinor < 0) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_MONTHLY_ADD_NEGATIVE', {
        monthly_add_minor: mMinor,
      });
    } else if (
      effectiveTargetMinor !== null &&
      effectiveTargetMinor > 0 &&
      mMinor > effectiveTargetMinor
    ) {
      addCodeAndConstraint(constraints, ruleCodes, 'CONTRIBUTION_EXCEEDS_TARGET', {
        monthly_add_minor: mMinor,
        target_minor: effectiveTargetMinor,
      });
    }
  }

  // Deadline validation (DEADLINE_IN_PAST, GOAL_DEADLINE_TOO_FAR)
  if ((operation === 'CREATE' || operation === 'UPDATE') && deadline != null && deadline !== '') {
    const dStr = String(deadline).slice(0, 10);
    if (dStr < currentDateIst) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_DEADLINE_IN_PAST', {
        deadline: dStr,
        current_date_ist: currentDateIst,
      });
      addCodeAndConstraint(constraints, ruleCodes, 'DEADLINE_IN_PAST', {
        deadline: dStr,
        current_date_ist: currentDateIst,
      });
    } else if (dStr > maxDeadline) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_DEADLINE_TOO_FAR', {
        deadline: dStr,
        max_deadline: maxDeadline,
      });
    }
  }

  // Status transition validation
  if (operation === 'SET_STATUS' && targetGoal) {
    const nextStatus = String(status || '').toUpperCase();
    const curStatus = targetGoal.status;
    const valid =
      (curStatus === 'ACTIVE' && (nextStatus === 'PAUSED' || nextStatus === 'COMPLETED')) ||
      (curStatus === 'PAUSED' && nextStatus === 'ACTIVE') ||
      (curStatus === 'COMPLETED' && nextStatus === 'ACTIVE');
    if (!valid) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_STATUS_TRANSITION_INVALID', {
        from: curStatus,
        to: nextStatus,
      });
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_NOT_ACTIVE', {
        from: curStatus,
        to: nextStatus,
      });
    }
  }

  // ADD_FUNDS validation (TARGET_NOT_POSITIVE, FUNDS_EXCEED_TARGET)
  if (operation === 'ADD_FUNDS' && targetGoal) {
    const amt = Number(amount_minor);
    const saved = Number(targetGoal.saved_minor) || 0;
    const tgt = Number(targetGoal.target_minor) || 0;
    if (!Number.isFinite(amt) || amt <= 0) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_TARGET_NOT_POSITIVE', { amount_minor: amt });
      addCodeAndConstraint(constraints, ruleCodes, 'TARGET_NOT_POSITIVE', { amount_minor: amt });
    } else if (tgt > 0 && saved + amt > tgt) {
      addCodeAndConstraint(constraints, ruleCodes, 'FUNDS_EXCEED_TARGET', {
        saved_minor: saved,
        amount_minor: amt,
        target_minor: tgt,
      });
    }
  }

  // RELEASE_FUNDS validation (RELEASE_EXCEEDS_SAVED)
  if (operation === 'RELEASE_FUNDS' && targetGoal) {
    const amt = Number(amount_minor);
    const saved = Number(targetGoal.saved_minor) || 0;
    if (!Number.isFinite(amt) || amt <= 0 || amt > saved) {
      addCodeAndConstraint(constraints, ruleCodes, 'GOAL_RELEASE_EXCEEDS_SAVED', {
        requested_minor: amt,
        saved_minor: saved,
      });
      addCodeAndConstraint(constraints, ruleCodes, 'RELEASE_EXCEEDS_SAVED', {
        requested_minor: amt,
        saved_minor: saved,
      });
    }
  }

  const hasMandatory = constraints.some((c) => c.severity === 'MANDATORY');
  return {
    verdict: hasMandatory ? 'REJECTED' : 'PASS',
    rule_codes: ruleCodes,
    warnings: [],
    operation,
    goal_id: goal_id || null,
    period: period || null,
    constraints,
  };
}

module.exports = {
  makeConstraint,
  validateGoalChange,
  validateGoalChangeRule: validateGoalChange,
};
