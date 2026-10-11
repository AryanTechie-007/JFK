/**
 * Sentinel Cap Rule Library (`rules/cap.js` — Sentinel §B.6.9, §E, §K.1, SEN-AC-06)
 */

const { makeConstraint } = require('./goal');
const { SENTINEL_PARAMS } = require('../params');
const {
  DEPRECATED_CATEGORY_MAP,
  getCategoryDisplayName,
  isFixedCategory,
  isIncomeOrSavingCategory,
  isCappableCategory,
  getCoveredLeafIds,
  computeSpendForCategories,
} = require('../ledger/spend');
const { isValidCategoryId } = require('../../categorizer/taxonomy');

function addRuleCode(list, code) {
  if (!list.includes(code)) list.push(code);
}

/**
 * Validates a standing or month-override cap change (`sentinel_validate_cap_change`).
 */
function validateCapChange(state, params = {}, registry = SENTINEL_PARAMS) {
  const {
    category_id,
    new_cap_minor,
    scope = 'STANDING',
    period = null,
    override_protected = false,
  } = params;

  const constraints = [];
  const ruleCodes = [];
  const warnings = [];

  const targetPeriod = period || state.current_month_ist || state.currentPeriod;
  const minCapFloorMinor =
    (registry && registry.tier && registry.tier.min_cap_minor) ||
    SENTINEL_PARAMS.min_cap_floor_minor ||
    10000;

  // 1. AMOUNT_PRECISION check
  if (typeof new_cap_minor !== 'number' || !Number.isInteger(new_cap_minor)) {
    addRuleCode(ruleCodes, 'AMOUNT_PRECISION');
    constraints.push(makeConstraint('AMOUNT_PRECISION', { new_cap_minor }, 'MANDATORY'));
  }

  const capMinor = Number(new_cap_minor);

  // 2. CATEGORY_UNKNOWN & CAP_ON_DEPRECATED_CATEGORY
  let suggestedCategoryId = null;
  if (DEPRECATED_CATEGORY_MAP[category_id]) {
    suggestedCategoryId = DEPRECATED_CATEGORY_MAP[category_id];
    addRuleCode(warnings, 'CAP_ON_DEPRECATED_CATEGORY');
    constraints.push(
      makeConstraint(
        'CAP_ON_DEPRECATED_CATEGORY',
        { category_id, suggested_category_id: suggestedCategoryId },
        'WARNING'
      )
    );
  } else if (!isValidCategoryId(category_id, true)) {
    addRuleCode(ruleCodes, 'CATEGORY_UNKNOWN');
    constraints.push(makeConstraint('CATEGORY_UNKNOWN', { category_id }, 'MANDATORY'));
  }

  // 3. Current cap & spend to date
  const currentCapObj = (state.caps || []).find((c) => c.category_id === category_id);
  const currentCapMinor = currentCapObj
    ? Math.trunc(Number(currentCapObj.effective_amount_minor ?? currentCapObj.amount_minor) || 0)
    : null;

  let spendToDateMinor = 0;
  if (state.spendByCategory && state.spendByCategory[category_id]) {
    spendToDateMinor = Math.trunc(
      Number(
        state.spendByCategory[category_id].spent_total_minor ??
          state.spendByCategory[category_id].total_spend_minor
      ) || 0
    );
  } else if (state.all_txns || state.transactions) {
    const covered = getCoveredLeafIds(category_id, state, targetPeriod);
    const sp = computeSpendForCategories(
      state.all_txns || state.transactions,
      covered,
      targetPeriod,
      null,
      category_id
    );
    spendToDateMinor = sp.spent_total_minor;
  }

  // 4. CATEGORY_NOT_CAPPABLE / CATEGORY_FIXED_NOT_REDUCIBLE
  if (
    isValidCategoryId(category_id, true) &&
    (isFixedCategory(category_id, state) || isIncomeOrSavingCategory(category_id) || !isCappableCategory(category_id, state))
  ) {
    addRuleCode(ruleCodes, 'CATEGORY_NOT_CAPPABLE');
    addRuleCode(ruleCodes, 'CATEGORY_FIXED_NOT_REDUCIBLE');
    constraints.push(
      makeConstraint(
        'CATEGORY_FIXED_NOT_REDUCIBLE',
        { category_id, category_label: getCategoryDisplayName(category_id) },
        'MANDATORY'
      )
    );
    constraints.push(
      makeConstraint(
        'CATEGORY_NOT_CAPPABLE',
        { category_id, category_label: getCategoryDisplayName(category_id) },
        'MANDATORY'
      )
    );
  }

  // 5. CAP_NEGATIVE & CAP_BELOW_FLOOR & CAP_BELOW_SPEND
  const isCurrentOrUnspecifiedMonth = !period || period === (state.current_month_ist || state.currentPeriod);
  const floorMinor = isCurrentOrUnspecifiedMonth
    ? Math.max(spendToDateMinor, minCapFloorMinor)
    : minCapFloorMinor;

  if (!Number.isFinite(capMinor) || capMinor < minCapFloorMinor) {
    addRuleCode(ruleCodes, 'CAP_NEGATIVE');
    addRuleCode(ruleCodes, 'CAP_BELOW_FLOOR');
    constraints.push(
      makeConstraint(
        'CAP_NEGATIVE',
        { category_id, new_cap_minor: capMinor, floor_minor: minCapFloorMinor },
        'MANDATORY'
      )
    );
    constraints.push(
      makeConstraint(
        'CAP_BELOW_FLOOR',
        { category_id, new_cap_minor: capMinor, floor_minor: floorMinor, spend_to_date_minor: spendToDateMinor },
        'MANDATORY'
      )
    );
  } else if (isCurrentOrUnspecifiedMonth && capMinor < spendToDateMinor) {
    // Emit CAP_BELOW_SPEND warning AND CAP_BELOW_FLOOR mandatory per existing contract
    addRuleCode(warnings, 'CAP_BELOW_SPEND');
    addRuleCode(ruleCodes, 'CAP_BELOW_FLOOR');
    constraints.push(
      makeConstraint(
        'CAP_BELOW_SPEND',
        { category_id, new_cap_minor: capMinor, spend_to_date_minor: spendToDateMinor },
        'WARNING'
      )
    );
    constraints.push(
      makeConstraint(
        'CAP_BELOW_FLOOR',
        { category_id, new_cap_minor: capMinor, floor_minor: floorMinor, spend_to_date_minor: spendToDateMinor },
        'MANDATORY'
      )
    );
  }

  // 6. PROTECTED_CATEGORY / CATEGORY_PROTECTED
  const protectedList = (state.preferences && state.preferences.protected_categories) || [];
  const isProtected = protectedList.some(
    (p) => p === category_id || (category_id && category_id.startsWith(`${p}.`))
  );
  if (isProtected && !override_protected && currentCapMinor != null && capMinor < currentCapMinor) {
    addRuleCode(ruleCodes, 'PROTECTED_CATEGORY');
    addRuleCode(ruleCodes, 'CATEGORY_PROTECTED');
    constraints.push(
      makeConstraint(
        'CATEGORY_PROTECTED',
        { category_id, category_label: getCategoryDisplayName(category_id) },
        'MANDATORY'
      )
    );
    constraints.push(
      makeConstraint(
        'PROTECTED_CATEGORY',
        { category_id, category_label: getCategoryDisplayName(category_id) },
        'MANDATORY'
      )
    );
  }

  // 7. Income & Spendable Pool checks (CAP_EXCEEDS_INCOME, CAPS_EXCEED_SPENDABLE, GOAL_COMMITMENT_CONFLICT)
  const incomeMinor = Number(state.income_minor) || 0;
  if (incomeMinor > 0 && capMinor > incomeMinor) {
    addRuleCode(ruleCodes, 'CAP_EXCEEDS_INCOME');
    constraints.push(
      makeConstraint(
        'CAP_EXCEEDS_INCOME',
        { category_id, new_cap_minor: capMinor, income_minor: incomeMinor },
        'MANDATORY'
      )
    );
  }

  if (incomeMinor > 0) {
    const otherCapsSum = (state.caps || [])
      .filter((c) => c.category_id !== category_id && !isFixedCategory(c.category_id, state))
      .reduce((acc, c) => acc + (Number(c.effective_amount_minor ?? c.amount_minor) || 0), 0);
    const fixedTotalMinor = Number(state.fixed_commitments_minor ?? state.fixed_total_minor) || 0;
    const goalCommitmentsMinor = Number(state.goal_commitments_minor) || 0;
    const spendablePoolMinor = incomeMinor - fixedTotalMinor - goalCommitmentsMinor;
    const newTotalCapsMinor = otherCapsSum + Math.max(0, capMinor);
    const remainingSurplusMinor = incomeMinor - fixedTotalMinor - newTotalCapsMinor;

    if (newTotalCapsMinor > spendablePoolMinor) {
      addRuleCode(warnings, 'CAPS_EXCEED_SPENDABLE');
      constraints.push(
        makeConstraint(
          'CAPS_EXCEED_SPENDABLE',
          {
            category_id,
            new_total_caps_minor: newTotalCapsMinor,
            spendable_pool_minor: spendablePoolMinor,
          },
          'WARNING'
        )
      );
    }

    if (
      (currentCapMinor == null || capMinor > currentCapMinor) &&
      goalCommitmentsMinor > 0 &&
      remainingSurplusMinor < goalCommitmentsMinor
    ) {
      const deltaIncrease = currentCapMinor != null ? capMinor - currentCapMinor : capMinor;
      addRuleCode(ruleCodes, 'GOAL_COMMITMENT_CONFLICT');
      constraints.push(
        makeConstraint(
          'GOAL_COMMITMENT_CONFLICT',
          {
            category_id,
            new_cap_minor: capMinor,
            delta_increase_minor: deltaIncrease,
            remaining_surplus_minor: remainingSurplusMinor,
            goal_commitments_minor: goalCommitmentsMinor,
          },
          'MANDATORY'
        )
      );
    }
  }

  const hasMandatory = ruleCodes.length > 0;
  return {
    verdict: hasMandatory ? 'REJECTED' : 'PASS',
    rule_codes: ruleCodes,
    warnings,
    current_cap_minor: currentCapMinor,
    spent_total_minor: spendToDateMinor,
    ...(suggestedCategoryId ? { suggested_category_id: suggestedCategoryId } : {}),
    // Legacy compatibility fields
    category_id,
    new_cap_minor: capMinor,
    previous_cap_minor: currentCapMinor,
    floor_minor: floorMinor,
    scope,
    period: targetPeriod,
    constraints,
  };
}

module.exports = {
  validateCapChange,
  validateCapChangeRule: validateCapChange,
};
