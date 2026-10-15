/**
 * Action Registry & Governance Rules (SC §13.1, §13.2)
 */

const ACTION_REGISTRY = Object.freeze({
  // Goal domain (Plan Store)
  CREATE_GOAL: {
    tier: 'T2',
    proposers: ['ATLAS', 'IRIS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'CREATE',
    reversible: true,
    undo_window_s: 300,
  },
  UPDATE_GOAL: {
    tier: 'T2',
    proposers: ['ATLAS', 'IRIS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'UPDATE',
    reversible: true,
    undo_window_s: 300,
  },
  SET_GOAL_STATUS: {
    tier: 'T2',
    proposers: ['ATLAS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'SET_STATUS',
    reversible: true,
    undo_window_s: 300,
  },
  SET_GOAL_MONTH_OVERRIDE: {
    tier: 'T2',
    proposers: ['ATLAS', 'IRIS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'SET_MONTH_OVERRIDE',
    reversible: true,
    undo_window_s: 300,
  },
  ADD_FUNDS: {
    tier: 'T2',
    proposers: ['ATLAS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'ADD_FUNDS',
    extra_validator: 'sentinel_check_available_balance',
    reversible: true,
    undo_window_s: 300,
  },
  RELEASE_FUNDS: {
    tier: 'T2',
    proposers: ['ATLAS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'RELEASE_FUNDS',
    reversible: true,
    undo_window_s: 300,
  },
  DELETE_GOAL: {
    tier: 'T3',
    proposers: ['ATLAS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 2592000, // 30 days
  },
  RESTORE_GOAL: {
    tier: 'T2',
    proposers: ['USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_goal_change',
    validator_op: 'RESTORE',
    reversible: true,
    undo_window_s: 300,
  },

  // Cap & alert domain (Plan Store)
  ADJUST_BUDGET_CAP: {
    tier: 'T2',
    proposers: ['NOVA', 'IRIS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_validate_cap_change',
    reversible: true,
    undo_window_s: 300,
  },
  APPLY_REBALANCE: {
    tier: 'T2',
    proposers: ['NOVA', 'IRIS', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: 'sentinel_run_rebalance_simulation',
    reversible: true,
    undo_window_s: 300,
  },
  SET_CATEGORY_WATCH: {
    tier: 'T1',
    proposers: ['NOVA', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },
  DISMISS_ALERT: {
    tier: 'T1',
    proposers: ['NOVA', 'USER'],
    domain_store: 'PLAN_STORE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },

  // Categorization domain (Categorizer)
  CORRECT_TRANSACTION_CATEGORY: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  CONFIRM_PROVISIONAL_CATEGORY: {
    tier: 'T1',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  SET_TRANSACTION_MOVEMENT_TYPE: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  LINK_REFUND_TO_EXPENSE: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  LINK_TRANSFER_PAIR: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  MARK_OWN_ACCOUNT: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  MARK_DUPLICATE_TRANSACTION: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  CREATE_CATEGORY_RULE: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  UPDATE_CATEGORY_RULE: {
    tier: 'T2',
    proposers: ['USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  DELETE_CATEGORY_RULE: {
    tier: 'T2',
    proposers: ['USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },

  // Manual transactions (Ingestion -> Categorizer)
  CREATE_MANUAL_TRANSACTION: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },

  // Profile, bills & preferences (Profile Service)
  UPDATE_USER_PROFILE: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'PROFILE',
    sentinel_validator: 'sentinel_validate_profile',
    reversible: true,
    undo_window_s: 300,
  },
  UPDATE_USER_PREFERENCES: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'PROFILE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },
  CREATE_DECLARED_BILL: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'PROFILE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },
  UPDATE_DECLARED_BILL: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'PROFILE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },
  DELETE_DECLARED_BILL: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'PROFILE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },

  // Undo & Memory (Action Service / Profile)
  UNDO_ACTION: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'ACTION_SERVICE',
    sentinel_validator: null,
    reversible: false,
    undo_window_s: 0,
  },
  CONFIRM_TRANSACTION_CATEGORY: {
    tier: 'T1',
    proposers: ['JOHN', 'USER'],
    domain_store: 'CATEGORIZER',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 86400,
  },
  UPDATE_PROFILE: {
    tier: 'T2',
    proposers: ['JOHN', 'USER'],
    domain_store: 'PROFILE',
    sentinel_validator: null,
    reversible: true,
    undo_window_s: 300,
  },
  DELETE_MEMORY_FACT: {
    tier: 'T1',
    proposers: ['JOHN', 'USER'],
    domain_store: 'MEMORY',
    sentinel_validator: null,
    reversible: false,
    undo_window_s: 0,
  },
});

const T4_PROHIBITED_ACTIONS = new Set([
  'INITIATE_PAYMENT',
  'EXTERNAL_TRANSFER',
  'SWEEP_FUNDS',
  'AUTO_DEBIT_SETUP',
  'CLOSE_ACCOUNT',
  'BUY_INVESTMENT',
]);

function getActionSpec(actionType) {
  return ACTION_REGISTRY[actionType] || null;
}

function canPropose(proposer, actionType) {
  const spec = ACTION_REGISTRY[actionType];
  if (!spec) return false;
  return spec.proposers.includes(proposer);
}

function isProhibitedT4(actionType) {
  return T4_PROHIBITED_ACTIONS.has(actionType);
}

module.exports = {
  ACTION_REGISTRY,
  T4_PROHIBITED_ACTIONS,
  getActionSpec,
  canPropose,
  isProhibitedT4,
};
