/**
 * Sentinel v5.0 Shared Rule Library Index (`rules/index.js` — Sentinel §B.6, §E, §K.1, SEN-AC-06)
 * Used identically by both Sentinel tool calls AND Action Service pre-execution re-validation.
 */

const { makeConstraint, validateGoalChange, validateGoalChangeRule } = require('./goal');
const { validateCapChange, validateCapChangeRule } = require('./cap');
const { validateRebalance, validateRebalanceRule } = require('./rebalance');
const { checkAvailableBalance, checkAvailableBalanceRule } = require('./balance');
const { validateProfile, validateProfileChangeRule } = require('./profile');

module.exports = {
  makeConstraint,
  // Canonical §E Rule Library interface
  validateGoalChange,
  validateCapChange,
  validateRebalance,
  checkAvailableBalance,
  validateProfile,
  // Backward-compatible *Rule aliases
  validateGoalChangeRule,
  validateCapChangeRule,
  validateRebalanceRule,
  checkAvailableBalanceRule,
  validateProfileChangeRule,
};
