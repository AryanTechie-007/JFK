/**
 * Constraint Code Registry & Plain-Language Templates (SC §12.1, §12.2)
 */

const { formatInr, formatBpPct } = require('../money');

const CONSTRAINT_REGISTRY = Object.freeze({
  // Goal validation codes (Sentinel §B.6.12 & SC §12)
  GOAL_NAME_INVALID: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Empty, > 40 chars, or duplicates an existing active/paused goal' },
  NAME_INVALID: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Name is empty, > 40 chars, or duplicates an active/paused goal' },
  GOAL_TARGET_NOT_POSITIVE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'target_minor <= 0' },
  TARGET_NOT_POSITIVE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'target_minor <= 0' },
  GOAL_TARGET_BELOW_SAVED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'New target_minor < saved_minor' },
  TARGET_BELOW_SAVED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'New target_minor < saved_minor' },
  CONTRIBUTION_EXCEEDS_TARGET: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'monthly_add_minor > target_minor' },
  FUNDS_EXCEED_TARGET: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'saved_minor + amount_minor > target_minor' },
  GOAL_MONTHLY_ADD_NEGATIVE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'monthly_add_minor < 0' },
  GOAL_DEADLINE_IN_PAST: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'deadline < current_date_ist' },
  DEADLINE_IN_PAST: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'deadline <= current_date_ist' },
  GOAL_DEADLINE_TOO_FAR: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'deadline > current_date_ist + 30 years' },
  AMOUNT_PRECISION: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Money field not an integer paise value' },
  GOAL_LIMIT: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'More than max_active_goals (20) active/paused goals' },
  GOAL_STATUS_TRANSITION_INVALID: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Violates state machine (SC §5.6)' },
  GOAL_NOT_ACTIVE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Goal is not in an active/valid state for the requested operation' },
  GOAL_RELEASE_EXCEEDS_SAVED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'amount_minor > saved_minor' },
  RELEASE_EXCEEDS_SAVED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'amount_minor > saved_minor' },
  GOAL_ALREADY_ARCHIVED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Mutation on an archived goal other than RESTORE_GOAL' },
  GOAL_RESTORE_EXPIRED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Now > restore_until' },
  RESTORE_WINDOW_EXPIRED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Now > restore_until' },

  // Surplus, Balance & Earmark codes
  SURPLUS_SHORTFALL: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Proposed goal monthly add exceeds available surplus' },
  FEASIBILITY_TIGHT: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Remaining surplus after commitment < buffer floor' },
  INSUFFICIENT_BALANCE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'available_minor < amount_minor for ADD_FUNDS' },
  OVER_EARMARKED: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Sum of active/paused saved_minor exceeds total liquid balance' },
  BALANCE_UNKNOWN: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'No liquid account balance on file' },
  STALE_BALANCE: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Newest balance_as_of older than 24 h' },

  // Cap & Rebalance validation codes (Sentinel §B.6.8, §B.6.9 & SC §12)
  CAP_NEGATIVE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'new_cap_minor < min_cap_minor (10000 paise)' },
  CAP_BELOW_FLOOR: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'new_cap_minor < max(spend_to_date_minor, 10_000)' },
  CAP_BELOW_SPEND: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'new_cap_minor < spend_to_date_minor' },
  CAP_EXCEEDS_INCOME: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'new_cap_minor > income_minor (when income_minor > 0)' },
  CAPS_EXCEED_SPENDABLE: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Sum of discretionary caps exceeds spendable pool' },
  CATEGORY_UNKNOWN: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Category ID not found in taxonomy' },
  CATEGORY_NOT_CAPPABLE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Category is FIXED or SAVING and cannot carry a discretionary cap' },
  CATEGORY_FIXED_NOT_REDUCIBLE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Category has nature = FIXED' },
  CATEGORY_PROTECTED: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Category is in preferences.protected_categories and new_cap_minor < current_cap_minor' },
  PROTECTED_CATEGORY: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Protected category cap cannot be reduced by rebalance or auto-adjustment' },
  CAP_ON_DEPRECATED_CATEGORY: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Category is deprecated in taxonomy' },
  ZERO_SUM_VIOLATION: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Rebalance donor cuts do not equal target increase' },
  NO_ELIGIBLE_DONOR: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'No donor category satisfies rebalance eligibility rules' },
  REBALANCE_NOT_COVERED: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Eligible donors cover only part of the breach' },
  DONOR_CAP_TOO_LOW: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Transfer would leave a donor below its floor or projected spend' },
  GOAL_COMMITMENT_CONFLICT: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'Cap increase or plan leaves less surplus than active goal monthly adds require' },

  // Cashflow & Velocity codes
  CASHFLOW_RISK_HIGH: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Projected lowest balance in horizon < 0 or < buffer floor' },
  NEGATIVE_BALANCE_RISK: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Projected lowest balance in horizon < 0 or < buffer floor' },
  RECURRING_OVERSPEND_PATTERN: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Category breached in >= 2 of the last 3 completed months' },

  // Data quality & Profile codes
  LOW_CATEGORIZATION_COVERAGE: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'coverage_bp < 7000' },
  PROVISIONAL_DATA_DOMINANT: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'provisional_share_bp > 2500' },
  PROVISIONAL_DATA: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'provisional_share_bp > 2000' },
  INCOME_BASIS_UNCERTAIN: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'Income taken from observed credits with < 2 months or low confidence' },
  IMPORT_IN_PROGRESS: { owner: 'SENTINEL', default_severity: 'WARNING', desc: 'DataQuality.complete = false' },
  PROFILE_INCOME_NEGATIVE: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'self_reported_income_minor < 0 or fixed_obligations_minor < 0' },
  PROFILE_OBLIGATIONS_EXCEED_INCOME: { owner: 'SENTINEL', default_severity: 'MANDATORY', desc: 'fixed_obligations_minor > self_reported_income_minor' },
  CONFLICTING_PROPOSALS: { owner: 'JOHN', default_severity: 'WARNING', desc: 'Two specialists proposed incompatible changes in the same turn' },
});

function renderConstraintMessage(code, details = {}) {
  switch (code) {
    case 'GOAL_NAME_INVALID':
    case 'NAME_INVALID':
      return 'Goal name must be between 1 and 40 characters and distinct from your existing goals.';
    case 'GOAL_TARGET_NOT_POSITIVE':
    case 'TARGET_NOT_POSITIVE':
      return 'Goal target amount must be greater than ₹0.';
    case 'GOAL_TARGET_BELOW_SAVED':
    case 'TARGET_BELOW_SAVED':
      return `Target cannot be lower than the ${formatInr(details.saved_minor || 0)} already saved in this goal.`;
    case 'CONTRIBUTION_EXCEEDS_TARGET':
      return 'Monthly contribution cannot exceed the goal target amount.';
    case 'FUNDS_EXCEED_TARGET':
      return 'Adding this amount would exceed the goal target.';
    case 'GOAL_MONTHLY_ADD_NEGATIVE':
      return 'Monthly contribution cannot be negative.';
    case 'GOAL_DEADLINE_IN_PAST':
    case 'DEADLINE_IN_PAST':
      return 'Goal deadline must be a future date.';
    case 'GOAL_DEADLINE_TOO_FAR':
      return 'Goal deadline must be within 30 years from today.';
    case 'AMOUNT_PRECISION':
      return 'Monetary amounts must be exact integer paise values.';
    case 'GOAL_LIMIT':
      return 'You can have at most 20 active or paused goals at a time.';
    case 'GOAL_STATUS_TRANSITION_INVALID':
    case 'GOAL_NOT_ACTIVE':
      return 'That status change or operation is not valid for the current state of this goal.';
    case 'GOAL_RELEASE_EXCEEDS_SAVED':
    case 'RELEASE_EXCEEDS_SAVED':
      return `Cannot release more than the ${formatInr(details.saved_minor || 0)} currently earmarked in this goal.`;
    case 'GOAL_ALREADY_ARCHIVED':
      return 'This goal is archived. Restore it first before making changes.';
    case 'GOAL_RESTORE_EXPIRED':
    case 'RESTORE_WINDOW_EXPIRED':
      return 'The 30-day restore window for this deleted goal has expired.';
    case 'SURPLUS_SHORTFALL':
      return `Your available monthly surplus (${formatInr(details.available_surplus_minor || 0)}) is less than the requested ${formatInr(details.proposed_monthly_add_minor || 0)} monthly goal contribution.`;
    case 'FEASIBILITY_TIGHT':
      return `This plan leaves ${formatInr(details.remaining_buffer_minor || 0)} above your safety buffer floor.`;
    case 'INSUFFICIENT_BALANCE':
      return `Available un-earmarked liquid balance (${formatInr(details.available_minor || 0)}) is lower than ${formatInr(details.requested_minor || 0)}.`;
    case 'OVER_EARMARKED':
      return 'Your total goal earmarks currently exceed your liquid account balance.';
    case 'BALANCE_UNKNOWN':
      return 'No liquid account balance is on file yet. Add or update your account balance first.';
    case 'STALE_BALANCE':
      return 'Your account balance was last updated more than 24 hours ago.';
    case 'CAP_NEGATIVE':
    case 'CAP_BELOW_FLOOR':
      return `The new cap (${formatInr(details.new_cap_minor || 0)}) cannot be set below the minimum cap floor (${formatInr(details.floor_minor || 10000)}).`;
    case 'CAP_BELOW_SPEND':
      return `The new cap (${formatInr(details.new_cap_minor || 0)}) is below your current spend to date (${formatInr(details.spend_to_date_minor || 0)}).`;
    case 'CAP_EXCEEDS_INCOME':
      return `The cap (${formatInr(details.new_cap_minor || 0)}) exceeds your monthly income (${formatInr(details.income_minor || 0)}).`;
    case 'CAPS_EXCEED_SPENDABLE':
      return 'Total discretionary caps exceed your spendable monthly pool.';
    case 'CATEGORY_UNKNOWN':
      return 'Unknown spending category.';
    case 'CATEGORY_NOT_CAPPABLE':
    case 'CATEGORY_FIXED_NOT_REDUCIBLE':
      return `${details.category_label || details.category_id || 'This category'} is a fixed or saving category and cannot be capped as discretionary spend.`;
    case 'CATEGORY_PROTECTED':
    case 'PROTECTED_CATEGORY':
      return `${details.category_label || details.category_id || 'This category'} is marked as protected in your settings and cannot be reduced automatically.`;
    case 'CAP_ON_DEPRECATED_CATEGORY':
      return 'This category is deprecated; consider setting a cap on its replacement category.';
    case 'ZERO_SUM_VIOLATION':
      return 'Rebalance transfers must sum to zero across donor and recipient categories.';
    case 'NO_ELIGIBLE_DONOR':
      return 'No discretionary category has enough headroom above its projected spend to cover this breach.';
    case 'REBALANCE_NOT_COVERED':
      return `Eligible donor categories can cover ${formatInr(details.covered_minor || 0)}, leaving ${formatInr(details.unmet_minor || 0)} uncovered.`;
    case 'DONOR_CAP_TOO_LOW':
      return 'Transferring that amount would push the donor category below its safe floor.';
    case 'GOAL_COMMITMENT_CONFLICT':
      return `Raising this cap leaves ${formatInr(details.remaining_surplus_minor || 0)} in surplus, which is less than your active goal commitments of ${formatInr(details.goal_commitments_minor || 0)}.`;
    case 'CASHFLOW_RISK_HIGH':
    case 'NEGATIVE_BALANCE_RISK':
      return `Upcoming bills could bring your balance to ${formatInr(details.lowest_balance_minor || 0)} within the next 30 days.`;
    case 'RECURRING_OVERSPEND_PATTERN':
      return 'Spending in this category has exceeded its cap in at least 2 of the last 3 months.';
    case 'LOW_CATEGORIZATION_COVERAGE':
      return `Categorization coverage is ${formatBpPct(details.coverage_bp || 0)}; figures may shift once pending transactions are reviewed.`;
    case 'PROVISIONAL_DATA_DOMINANT':
    case 'PROVISIONAL_DATA':
      return `${formatBpPct(details.provisional_share_bp || 0)} of spend in this view comes from unconfirmed transactions.`;
    case 'INCOME_BASIS_UNCERTAIN':
      return 'Monthly income is estimated from recent credits; confirm your income in Settings or the Sentinel review list for firmer projections.';
    case 'IMPORT_IN_PROGRESS':
      return 'A statement import is still being processed; recent totals may update shortly.';
    case 'PROFILE_INCOME_NEGATIVE':
      return 'Income and fixed obligations must be zero or positive.';
    case 'PROFILE_OBLIGATIONS_EXCEED_INCOME':
      return 'Fixed obligations cannot exceed your reported monthly income.';
    case 'CONFLICTING_PROPOSALS':
      return 'Multiple options were evaluated to keep your budget caps and savings goals in balance.';
    default:
      return 'A financial validation rule flagged this action.';
  }
}

function isValidConstraintCode(code) {
  return Boolean(CONSTRAINT_REGISTRY[code]);
}

module.exports = {
  CONSTRAINT_REGISTRY,
  renderConstraintMessage,
  isValidConstraintCode,
};
