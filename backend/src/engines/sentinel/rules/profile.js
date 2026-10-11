/**
 * Sentinel Profile Rule Library (`rules/profile.js` — Sentinel §C.5, §E, §K.1, SEN-AC-06)
 */

const { makeConstraint } = require('./goal');

/**
 * Validates profile income and fixed expense obligations (`sentinel_validate_profile`).
 */
function validateProfile(state, params = {}) {
  const incomeMinor =
    params.declared_income_minor !== undefined
      ? params.declared_income_minor
      : params.self_reported_income_minor;
  const fixedExpenseLines =
    params.fixed_expense_lines !== undefined
      ? params.fixed_expense_lines
      : params.fixed_obligations;
  const fixedTotalParam = params.fixed_obligations_minor;

  const errors = [];
  const ruleCodes = [];
  const warnings = [];
  const constraints = [];

  if (incomeMinor !== undefined && incomeMinor !== null) {
    if (typeof incomeMinor !== 'number' || !Number.isInteger(incomeMinor)) {
      errors.push('declared_income_minor must be an integer');
      ruleCodes.push('AMOUNT_PRECISION');
      constraints.push(makeConstraint('AMOUNT_PRECISION', { field: 'declared_income_minor' }, 'MANDATORY'));
    } else if (incomeMinor < 0) {
      errors.push('declared_income_minor cannot be negative');
      ruleCodes.push('PROFILE_INCOME_NEGATIVE');
      constraints.push(makeConstraint('PROFILE_INCOME_NEGATIVE', { declared_income_minor: incomeMinor }, 'MANDATORY'));
    }
  }

  let fixedSumMinor = 0;
  if (fixedTotalParam !== undefined && fixedTotalParam !== null) {
    if (typeof fixedTotalParam !== 'number' || !Number.isInteger(fixedTotalParam) || fixedTotalParam < 0) {
      errors.push('fixed_obligations_minor cannot be negative');
      ruleCodes.push('PROFILE_INCOME_NEGATIVE');
      constraints.push(makeConstraint('PROFILE_INCOME_NEGATIVE', { fixed_obligations_minor: fixedTotalParam }, 'MANDATORY'));
    } else {
      fixedSumMinor = fixedTotalParam;
    }
  }

  if (Array.isArray(fixedExpenseLines)) {
    for (const line of fixedExpenseLines) {
      const amt = Number(line.monthly_amount_minor ?? line.amount_minor);
      if ((!line.label && !line.category_id) || !Number.isFinite(amt) || amt < 0) {
        errors.push('Invalid fixed expense line');
        ruleCodes.push('PROFILE_INCOME_NEGATIVE');
        constraints.push(makeConstraint('PROFILE_INCOME_NEGATIVE', { line }, 'MANDATORY'));
      } else {
        fixedSumMinor += amt;
      }
    }
  }

  const effectiveIncome =
    incomeMinor !== undefined && incomeMinor !== null
      ? Number(incomeMinor)
      : state && state.profile && state.profile.declared_income_minor != null
      ? Number(state.profile.declared_income_minor)
      : null;

  if (effectiveIncome !== null && effectiveIncome > 0 && fixedSumMinor > effectiveIncome) {
    errors.push('Fixed obligations exceed declared income');
    ruleCodes.push('PROFILE_OBLIGATIONS_EXCEED_INCOME');
    constraints.push(
      makeConstraint(
        'PROFILE_OBLIGATIONS_EXCEED_INCOME',
        { fixed_obligations_minor: fixedSumMinor, declared_income_minor: effectiveIncome },
        'MANDATORY'
      )
    );
  }

  return {
    verdict: errors.length === 0 && ruleCodes.length === 0 ? 'PASS' : 'REJECTED',
    rule_codes: ruleCodes,
    warnings,
    errors,
    constraints,
  };
}

module.exports = {
  validateProfile,
  validateProfileChangeRule: validateProfile,
};
