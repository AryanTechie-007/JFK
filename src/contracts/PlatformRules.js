/**
 * Shared Platform Rules & Constants — Nova: Agent Specification (V4)
 * Covers Sections 4, 5, 6, 8, 9, 10, and 14 of the V4 specification.
 */

const DEFAULT_TIER_THRESHOLDS = Object.freeze({
  warning_min_pct: 80,   // Healthy below 80%, Warning from 80% to 100%
  exceeded_min_pct: 100  // Exceeded strictly above 100% (> 100%)
});

const TASK_TYPES = Object.freeze({
  LIVE_STATUS: 'live_status',
  BREACH_EVENT: 'breach_event',
  ANOMALY_EVENT: 'anomaly_event',
  EXPLAIN_ANOMALY: 'explain_anomaly',
  PROPOSE_REBALANCE: 'propose_rebalance',
  ADJUST_CAP_REQUEST: 'adjust_cap_request'
});

const RESPONSE_STATUSES = Object.freeze({
  OK: 'ok',
  PARTIAL: 'partial',
  NEEDS_INPUT: 'needs_input',
  REJECTED: 'rejected',
  ERROR: 'error'
});

const CAP_RULE_CODES = Object.freeze({
  CAP_NEGATIVE: 'CAP_NEGATIVE',
  CATEGORY_UNKNOWN: 'CATEGORY_UNKNOWN',
  PROTECTED_CATEGORY: 'PROTECTED_CATEGORY',
  CAPS_EXCEED_SPENDABLE: 'CAPS_EXCEED_SPENDABLE',
  CAP_ON_DEPRECATED_CATEGORY: 'CAP_ON_DEPRECATED_CATEGORY'
});

const CONSTRAINT_CODES = Object.freeze({
  PROTECTED_CATEGORY: 'PROTECTED_CATEGORY',
  CAP_BELOW_SPEND: 'CAP_BELOW_SPEND',
  ZERO_SUM_VIOLATION: 'ZERO_SUM_VIOLATION',
  LOW_CATEGORIZATION_COVERAGE: 'LOW_CATEGORIZATION_COVERAGE',
  CAPS_EXCEED_SPENDABLE: 'CAPS_EXCEED_SPENDABLE',
  CAP_ON_DEPRECATED_CATEGORY: 'CAP_ON_DEPRECATED_CATEGORY'
});

const NOVA_PROPOSED_ACTIONS = Object.freeze({
  ADJUST_BUDGET_CAP: 'ADJUST_BUDGET_CAP',
  APPLY_REBALANCE: 'APPLY_REBALANCE',
  DISMISS_ALERT: 'DISMISS_ALERT',
  CREATE_ALERT: 'CREATE_ALERT'
});

const PEER_HINT_CODES = Object.freeze({
  GOAL_FUNDING_PRESSURE: 'GOAL_FUNDING_PRESSURE',           // For Atlas
  RECURRING_ANOMALY: 'RECURRING_ANOMALY',                   // For Iris
  MISCATEGORIZATION_SUSPECTED: 'MISCATEGORIZATION_SUSPECTED' // For John (review queue)
});

const SENTINEL_NOVA_ALLOWLIST = Object.freeze([
  'sentinel_get_ledger_summary',
  'sentinel_run_category_utilization',
  'sentinel_run_velocity_projection',
  'sentinel_detect_anomalies',
  'sentinel_run_rebalance_simulation',
  'sentinel_validate_cap_change'
]);

/**
 * Section 8: Conditional Execution Lifecycle ordering per task_type
 */
const CONDITIONAL_LIFECYCLE_ORDER = Object.freeze({
  [TASK_TYPES.LIVE_STATUS]: [
    'sentinel_run_category_utilization',
    'sentinel_run_velocity_projection'
  ],
  [TASK_TYPES.BREACH_EVENT]: [
    'sentinel_run_category_utilization',
    'sentinel_run_velocity_projection',
    'sentinel_run_rebalance_simulation',
    'sentinel_validate_cap_change'
  ],
  [TASK_TYPES.ANOMALY_EVENT]: [
    'sentinel_detect_anomalies',
    'sentinel_get_ledger_summary'
  ],
  [TASK_TYPES.EXPLAIN_ANOMALY]: [
    'sentinel_detect_anomalies',
    'sentinel_get_ledger_summary'
  ],
  [TASK_TYPES.PROPOSE_REBALANCE]: [
    'sentinel_run_rebalance_simulation',
    'sentinel_validate_cap_change'
  ],
  [TASK_TYPES.ADJUST_CAP_REQUEST]: [
    'sentinel_validate_cap_change',
    'sentinel_run_category_utilization'
  ]
});

/**
 * Section 14 (Page 11): Shared Action Governance & Confirmation Tiers
 */
const ACTION_GOVERNANCE_TABLE = Object.freeze({
  CREATE_GOAL: { allowedInitiators: ['Atlas', 'Iris'], tier: 'T2', requiresConfirmationToken: true },
  UPDATE_GOAL: { allowedInitiators: ['Atlas', 'Iris'], tier: 'T2', requiresConfirmationToken: true },
  ADD_FUNDS: { allowedInitiators: ['Atlas', 'Iris'], tier: 'T2', requiresConfirmationToken: true },
  DELETE_GOAL: { allowedInitiators: ['Atlas'], tier: 'T3', requiresConfirmationToken: true, explicit: true },
  ADJUST_BUDGET_CAP: { allowedInitiators: ['Nova', 'Iris'], tier: 'T2', requiresConfirmationToken: true },
  APPLY_REBALANCE: { allowedInitiators: ['Nova', 'Iris'], tier: 'T2', requiresConfirmationToken: true },
  DISMISS_ALERT: { allowedInitiators: ['Nova'], tier: 'T1', requiresConfirmationToken: false, logged: true },
  CREATE_ALERT: { allowedInitiators: ['Nova'], tier: 'T1', requiresConfirmationToken: false, logged: true },
  RECATEGORIZE_TRANSACTION_SINGLE: { allowedInitiators: ['User', 'John'], tier: 'T1', requiresConfirmationToken: false },
  RECATEGORIZE_TRANSACTION_BATCH: { allowedInitiators: ['User', 'John'], tier: 'T2', requiresConfirmationToken: true },
  CONFIRM_CATEGORY: { allowedInitiators: ['User'], tier: 'T1', requiresConfirmationToken: false },
  UPDATE_PREFERENCE: { allowedInitiators: ['John'], tier: 'T1', requiresConfirmationToken: false, explicitStatementRequired: true }
});

module.exports = {
  DEFAULT_TIER_THRESHOLDS,
  TASK_TYPES,
  RESPONSE_STATUSES,
  CAP_RULE_CODES,
  CONSTRAINT_CODES,
  NOVA_PROPOSED_ACTIONS,
  PEER_HINT_CODES,
  SENTINEL_NOVA_ALLOWLIST,
  CONDITIONAL_LIFECYCLE_ORDER,
  ACTION_GOVERNANCE_TABLE
};
