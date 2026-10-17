/**
 * Sentinel v5.0 Shared Rule Library (Sentinel §A.2, §B.6 functions 9, 12, 15 + Rebalance & Profile validators)
 * Used by both Sentinel tool calls AND Action Service pre-execution re-validation.
 */

const { SENTINEL_PARAMS } = require('../params');
const { isFixedCategory, getCategoryDisplayName } = require('../../categorizer/taxonomy');
const { renderConstraintMessage, CONSTRAINT_REGISTRY } = require('../../../shared/contracts/constraint-messages');
const { halfEvenRoundBigInt, multiplyMinorByBp } = require('../../../shared/money');

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

/**
 * Goal Validator (`sentinel_validate_goal_change`, SEN-AC-06)
 * Operations: CREATE, UPDATE, SET_STATUS, SET_MONTH_OVERRIDE, ADD_FUNDS, RELEASE_FUNDS, RESTORE
 */
function validateGoalChange(state, params = {}) {
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
  const currentDateIst = state.current_date_ist || new Date().toISOString().slice(0, 10);
  const maxYear = parseInt(currentDateIst.slice(0, 4), 10) + 30;
  const maxDeadline = `${maxYear}${currentDateIst.slice(4)}`;

  const existingGoals = state.all_goals_including_archived || state.goals || [];
  const targetGoal = goal_id ? existingGoals.find((g) => g.goal_id === goal_id) : null;

  if (operation !== 'CREATE' && !targetGoal) {
    return {
      verdict: 'REJECTED',
      constraints: [],
      rule_codes: ['UNKNOWN_ENTITY'],
      warnings: [],
      error_code: 'UNKNOWN_ENTITY',
    };
  }

  if (targetGoal && targetGoal.status === 'ARCHIVED' && operation !== 'RESTORE') {
    constraints.push(makeConstraint('GOAL_ALREADY_ARCHIVED', { goal_id }));
  }

  if (operation === 'RESTORE' && targetGoal) {
    if (targetGoal.status !== 'ARCHIVED') {
      constraints.push(makeConstraint('GOAL_STATUS_TRANSITION_INVALID', { from: targetGoal.status, to: 'PAUSED' }));
    } else if (targetGoal.restore_until && new Date(currentDateIst) > new Date(targetGoal.restore_until)) {
      constraints.push(makeConstraint('GOAL_RESTORE_EXPIRED', { restore_until: targetGoal.restore_until }));
    }
  }

  if (operation === 'CREATE' || (operation === 'UPDATE' && name !== undefined)) {
    const cleanName = String(name || '').trim();
    const isDuplicate = existingGoals.some(
      (g) =>
        g.goal_id !== goal_id &&
        g.status !== 'ARCHIVED' &&
        String(g.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (!cleanName || cleanName.length > 40 || isDuplicate) {
      constraints.push(makeConstraint('GOAL_NAME_INVALID', { name: cleanName }));
    }
  }

  if (operation === 'CREATE' || (operation === 'UPDATE' && target_minor !== undefined)) {
    const tMinor = Number(target_minor);
    if (!Number.isFinite(tMinor) || tMinor <= 0) {
      constraints.push(makeConstraint('GOAL_TARGET_NOT_POSITIVE', { target_minor: tMinor }));
    } else if (targetGoal && tMinor < (Number(targetGoal.saved_minor) || 0)) {
      constraints.push(
        makeConstraint('GOAL_TARGET_BELOW_SAVED', {
          target_minor: tMinor,
          saved_minor: targetGoal.saved_minor,
        })
      );
    }
  }

  if (
    operation === 'CREATE' ||
    (operation === 'UPDATE' && monthly_add_minor !== undefined) ||
    operation === 'SET_MONTH_OVERRIDE'
  ) {
    const mMinor = Number(monthly_add_minor);
    if (!Number.isFinite(mMinor) || mMinor < 0) {
      constraints.push(makeConstraint('GOAL_MONTHLY_ADD_NEGATIVE', { monthly_add_minor: mMinor }));
    }
  }

  if ((operation === 'CREATE' || operation === 'UPDATE') && deadline != null && deadline !== '') {
    const dStr = String(deadline).slice(0, 10);
    if (dStr < currentDateIst) {
      constraints.push(makeConstraint('GOAL_DEADLINE_IN_PAST', { deadline: dStr, current_date_ist: currentDateIst }));
    } else if (dStr > maxDeadline) {
      constraints.push(makeConstraint('GOAL_DEADLINE_TOO_FAR', { deadline: dStr, max_deadline: maxDeadline }));
    }
  }

  if (operation === 'SET_STATUS' && targetGoal) {
    const nextStatus = String(status || '').toUpperCase();
    const curStatus = targetGoal.status;
    const valid =
      (curStatus === 'ACTIVE' && (nextStatus === 'PAUSED' || nextStatus === 'COMPLETED')) ||
      (curStatus === 'PAUSED' && nextStatus === 'ACTIVE') ||
      (curStatus === 'COMPLETED' && nextStatus === 'ACTIVE');
    if (!valid) {
      constraints.push(
        makeConstraint('GOAL_STATUS_TRANSITION_INVALID', { from: curStatus, to: nextStatus })
      );
    }
  }

  if (operation === 'ADD_FUNDS' && targetGoal) {
    const amt = Number(amount_minor);
    if (!Number.isFinite(amt) || amt <= 0) {
      constraints.push(makeConstraint('GOAL_TARGET_NOT_POSITIVE', { amount_minor: amt }));
    }
  }

  if (operation === 'RELEASE_FUNDS' && targetGoal) {
    const amt = Number(amount_minor);
    const saved = Number(targetGoal.saved_minor) || 0;
    if (!Number.isFinite(amt) || amt <= 0 || amt > saved) {
      constraints.push(
        makeConstraint('GOAL_RELEASE_EXCEEDS_SAVED', {
          requested_minor: amt,
          saved_minor: saved,
        })
      );
    }
  }

  const hasMandatory = constraints.some((c) => c.severity === 'MANDATORY');
  return {
    verdict: hasMandatory ? 'REJECTED' : 'PASS',
    operation,
    goal_id: goal_id || null,
    period: period || null,
    constraints,
    rule_codes: constraints.map((c) => c.code),
    warnings: constraints.filter((c) => c.severity === 'WARNING').map((c) => c.message),
  };
}

/**
 * Cap Validator (`sentinel_validate_cap_change`, SEN-AC-06)
 */
function validateCapChange(state, params = {}) {
  const {
    category_id,
    new_cap_minor,
    scope = 'STANDING',
    period = null,
    override_protected = false,
  } = params;

  const constraints = [];
  const capMinor = Number(new_cap_minor);
  const currentCapObj = (state.caps || []).find((c) => c.category_id === category_id);
  const currentCapMinor = currentCapObj ? Number(currentCapObj.effective_amount_minor ?? currentCapObj.amount_minor) : null;
  const spendToDateMinor = Number(state.spendByCategory?.[category_id]?.total_spend_minor) || 0;

  // Floor rule: For current month, floor is max(spend_to_date_minor, 10_000 paise = ₹100)
  const isCurrentOrUnspecifiedMonth = !period || period === state.current_month_ist;
  const floorMinor = isCurrentOrUnspecifiedMonth
    ? Math.max(spendToDateMinor, SENTINEL_PARAMS.min_cap_floor_minor)
    : SENTINEL_PARAMS.min_cap_floor_minor;

  if (!Number.isFinite(capMinor) || capMinor < floorMinor) {
    constraints.push(
      makeConstraint('CAP_BELOW_FLOOR', {
        category_id,
        new_cap_minor: capMinor,
        floor_minor: floorMinor,
        spend_to_date_minor: spendToDateMinor,
      })
    );
  }

  const incomeMinor = Number(state.income_minor) || 0;
  if (incomeMinor > 0 && capMinor > incomeMinor) {
    constraints.push(
      makeConstraint('CAP_EXCEEDS_INCOME', {
        category_id,
        new_cap_minor: capMinor,
        income_minor: incomeMinor,
      })
    );
  }

  // Fixed nature check
  if (isFixedCategory(category_id) && currentCapMinor != null && capMinor < currentCapMinor) {
    constraints.push(
      makeConstraint('CATEGORY_FIXED_NOT_REDUCIBLE', {
        category_id,
        category_label: getCategoryDisplayName(category_id),
      })
    );
  }

  // Protected category check
  const protectedList = state.preferences?.protected_categories || [];
  const isProtected = protectedList.some(
    (p) => p === category_id || (category_id && category_id.startsWith(`${p}.`))
  );
  if (isProtected && !override_protected && currentCapMinor != null && capMinor < currentCapMinor) {
    constraints.push(
      makeConstraint('CATEGORY_PROTECTED', {
        category_id,
        category_label: getCategoryDisplayName(category_id),
      })
    );
  }

  // Goal commitment conflict check when increasing a cap
  if (incomeMinor > 0 && (currentCapMinor == null || capMinor > currentCapMinor)) {
    const deltaIncrease = currentCapMinor != null ? capMinor - currentCapMinor : capMinor;
    const otherCapsSum = (state.caps || [])
      .filter((c) => c.category_id !== category_id)
      .reduce((acc, c) => acc + (Number(c.effective_amount_minor ?? c.amount_minor) || 0), 0);
    const fixedTotalMinor = Number(state.fixed_commitments_minor) || 0;
    const goalCommitmentsMinor = Number(state.goal_commitments_minor) || 0;
    const remainingSurplusMinor = incomeMinor - fixedTotalMinor - otherCapsSum - capMinor;

    if (goalCommitmentsMinor > 0 && remainingSurplusMinor < goalCommitmentsMinor) {
      constraints.push(
        makeConstraint('GOAL_COMMITMENT_CONFLICT', {
          category_id,
          new_cap_minor: capMinor,
          delta_increase_minor: deltaIncrease,
          remaining_surplus_minor: remainingSurplusMinor,
          goal_commitments_minor: goalCommitmentsMinor,
        })
      );
    }
  }

  const hasMandatory = constraints.some((c) => c.severity === 'MANDATORY');
  return {
    verdict: hasMandatory ? 'REJECTED' : 'PASS',
    category_id,
    new_cap_minor: capMinor,
    previous_cap_minor: currentCapMinor,
    floor_minor: floorMinor,
    scope,
    period: period || state.current_month_ist,
    constraints,
    rule_codes: constraints.map((c) => c.code),
    warnings: constraints.filter((c) => c.severity === 'WARNING').map((c) => c.message),
  };
}

/**
 * Rebalance Validator (`validateRebalance`, SEN-AC-06, SEN-AC-18)
 * Checks:
 * - Net zero sum across all transfer legs
 * - No transfer from FIXED category
 * - No transfer from protected category without override
 * - Per-leg donor cap does not drop below floor (spend to date or min floor)
 */
function validateRebalance(state, params = {}) {
  const transfers = Array.isArray(params) ? params : (params.transfers || []);
  const constraints = [];

  if (!Array.isArray(transfers) || transfers.length === 0) {
    const emptyConstraint = makeConstraint('NO_ELIGIBLE_DONOR', {});
    return {
      verdict: 'REJECTED',
      transfers: [],
      constraints: [emptyConstraint],
      rule_codes: [emptyConstraint.code],
      warnings: [],
    };
  }

  const protectedSet = new Set(state.preferences?.protected_categories || []);
  const caps = state.caps || [];

  // Track aggregated donor changes to ensure cumulative deduction doesn't breach floor
  const donorDeductions = new Map();

  for (const leg of transfers) {
    const fromId = leg.from_category_id;
    const toId = leg.to_category_id;
    const amt = Number(leg.amount_minor);

    if (!fromId || !toId || fromId === toId || !Number.isFinite(amt) || amt <= 0) {
      constraints.push(makeConstraint('DONOR_CAP_TOO_LOW', { fromId, toId, amount_minor: amt }));
      continue;
    }

    // Donor FIXED check
    if (isFixedCategory(fromId)) {
      constraints.push(
        makeConstraint('CATEGORY_FIXED_NOT_REDUCIBLE', {
          category_id: fromId,
          category_label: getCategoryDisplayName(fromId),
        })
      );
    }

    // Donor protected check
    const isProt = [...protectedSet].some(
      (p) => p === fromId || (fromId && fromId.startsWith(`${p}.`))
    );
    if (isProt && !leg.override_protected) {
      constraints.push(
        makeConstraint('CATEGORY_PROTECTED', {
          category_id: fromId,
          category_label: getCategoryDisplayName(fromId),
        })
      );
    }

    donorDeductions.set(fromId, (donorDeductions.get(fromId) || 0) + amt);
  }

  // Validate donor caps against floors
  for (const [fromId, totalDeduction] of donorDeductions.entries()) {
    const capObj = caps.find((c) => c.category_id === fromId);
    const capMinor = capObj ? Number(capObj.effective_amount_minor ?? capObj.amount_minor) : 0;
    const spendToDateMinor = Number(state.spendByCategory?.[fromId]?.total_spend_minor) || 0;
    const floorMinor = Math.max(spendToDateMinor, SENTINEL_PARAMS.min_cap_floor_minor);

    if (capMinor - totalDeduction < floorMinor) {
      constraints.push(
        makeConstraint('DONOR_CAP_TOO_LOW', {
          category_id: fromId,
          cap_minor: capMinor,
          deduction_minor: totalDeduction,
          floor_minor: floorMinor,
        })
      );
    }
  }

  const hasMandatory = constraints.some((c) => c.severity === 'MANDATORY');
  return {
    verdict: hasMandatory ? 'REJECTED' : 'PASS',
    transfers,
    constraints,
    rule_codes: constraints.map((c) => c.code),
    warnings: constraints.filter((c) => c.severity === 'WARNING').map((c) => c.message),
  };
}

/**
 * Available Balance Validator (`sentinel_check_available_balance`, SEN-AC-06)
 */
function checkAvailableBalance(state, params = {}) {
  const { amount_minor = 0 } = params;
  const requestedMinor = Number(amount_minor) || 0;
  const constraints = [];

  const liquidAccounts = (state.accounts || []).filter(
    (a) => a.is_own_account && (a.type === 'CHECKING' || a.type === 'SAVINGS')
  );

  const accountsWithBalance = liquidAccounts.filter((a) => a.balance_minor != null);
  if (accountsWithBalance.length === 0) {
    const balanceUnknown = makeConstraint('BALANCE_UNKNOWN', {});
    constraints.push(balanceUnknown);
    return {
      verdict: 'BALANCE_UNKNOWN',
      total_liquid_minor: 0,
      earmarked_minor: 0,
      available_minor: 0,
      requested_minor: requestedMinor,
      constraints,
      rule_codes: [balanceUnknown.code],
      warnings: [],
    };
  }

  const totalLiquidMinor = accountsWithBalance.reduce(
    (sum, a) => sum + (Number(a.balance_minor) || 0),
    0
  );

  // Check staleness (> 24h)
  const newestAsOf = accountsWithBalance
    .map((a) => new Date(a.balance_as_of || 0).getTime())
    .reduce((max, t) => Math.max(max, t), 0);
  if (newestAsOf > 0 && Date.now() - newestAsOf > 24 * 3600 * 1000) {
    constraints.push(makeConstraint('STALE_BALANCE', {}, 'WARNING'));
  }

  const earmarkedMinor = (state.goals || [])
    .filter((g) => g.status === 'ACTIVE' || g.status === 'PAUSED')
    .reduce((sum, g) => sum + (Number(g.saved_minor) || 0), 0);

  if (earmarkedMinor > totalLiquidMinor) {
    constraints.push(
      makeConstraint(
        'OVER_EARMARKED',
        { earmarked_minor: earmarkedMinor, total_liquid_minor: totalLiquidMinor },
        'WARNING'
      )
    );
  }

  const availableMinor = Math.max(0, totalLiquidMinor - earmarkedMinor);
  if (requestedMinor > availableMinor) {
    constraints.push(
      makeConstraint('INSUFFICIENT_BALANCE', {
        available_minor: availableMinor,
        requested_minor: requestedMinor,
      })
    );
    return {
      verdict: 'INSUFFICIENT_BALANCE',
      total_liquid_minor: totalLiquidMinor,
      earmarked_minor: earmarkedMinor,
      available_minor: availableMinor,
      requested_minor: requestedMinor,
      constraints,
      rule_codes: constraints.map((c) => c.code),
      warnings: constraints.filter((c) => c.severity === 'WARNING').map((c) => c.message),
    };
  }

  return {
    verdict: 'OK',
    total_liquid_minor: totalLiquidMinor,
    earmarked_minor: earmarkedMinor,
    available_minor: availableMinor,
    requested_minor: requestedMinor,
    constraints,
    rule_codes: constraints.map((c) => c.code),
    warnings: constraints.filter((c) => c.severity === 'WARNING').map((c) => c.message),
  };
}

/**
 * Profile Validator (`sentinel_validate_profile`, SEN-AC-06)
 */
function validateProfile(state, params = {}) {
  const { declared_income_minor, fixed_expense_lines } = params;
  const errors = [];
  if (declared_income_minor != null && Number(declared_income_minor) < 0) {
    errors.push('declared_income_minor cannot be negative');
  }
  if (Array.isArray(fixed_expense_lines)) {
    for (const line of fixed_expense_lines) {
      if (!line.label || Number(line.monthly_amount_minor) < 0) {
        errors.push('Invalid fixed expense line');
      }
    }
  }
  return {
    verdict: errors.length === 0 ? 'PASS' : 'REJECTED',
    errors,
    constraints: [],
    rule_codes: [],
    warnings: [],
  };
}

/**
 * Loads current live (not snapshot-pinned) state for Action Service execution re-validation (SEN-AC-06)
 */
function loadState(userId, conn = null) {
  const { createSnapshot } = require('../../../platform/snapshot');
  const { loadSnapshotState } = require('../index');
  const snap = createSnapshot(userId);
  return loadSnapshotState(snap, userId);
}

module.exports = {
  makeConstraint,
  // Normalized function names
  validateGoalChange,
  validateCapChange,
  validateRebalance,
  checkAvailableBalance,
  validateProfile,
  loadState,

  // Aliases kept for backwards compatibility with Action Service / existing imports
  validateGoalChangeRule: validateGoalChange,
  validateCapChangeRule: validateCapChange,
  validateRebalanceRule: validateRebalance,
  checkAvailableBalanceRule: checkAvailableBalance,
  validateProfileChangeRule: validateProfile,
};
