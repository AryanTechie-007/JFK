/**
 * Sentinel Rebalance Rule Library (`rules/rebalance.js` — Sentinel §B.6.8, §B.6.9, §E, §K.1, SEN-AC-06, SEN-AC-18)
 */

const { makeConstraint } = require('./goal');
const { validateCapChange } = require('./cap');
const { SENTINEL_PARAMS } = require('../params');
const {
  isFixedCategory,
  getEffectiveCapMap,
  getCoveredLeafIds,
  computeSpendForCategories,
} = require('../ledger/spend');

/**
 * Validates a set of rebalance transfers (`transfers[] {from_category_id, to_category_id, amount_minor}`)
 * or `{ target_category_id, transfers: [{donor_category_id, transfer_minor}] }`.
 * Ensures:
 * 1. Every donor leg passes cap rules (not FIXED, not protected, integer precision, >= floor).
 * 2. Transfers are strictly positive and sum of donor cuts equals sum of recipient increases (`net_cap_change_minor === 0`, `ZERO_SUM_VIOLATION`).
 * 3. No donor reduction exceeds its available headroom (`DONOR_CAP_TOO_LOW`).
 */
function validateRebalance(state, rebalanceInput = {}, registry = SENTINEL_PARAMS) {
  const constraints = [];
  const ruleCodes = [];
  const warnings = [];

  const addCode = (code, details = {}, severity = 'MANDATORY') => {
    if (severity === 'WARNING') {
      if (!warnings.includes(code)) warnings.push(code);
    } else if (!ruleCodes.includes(code)) {
      ruleCodes.push(code);
    }
    if (!constraints.some((c) => c.code === code)) {
      constraints.push(makeConstraint(code, details, severity));
    }
  };

  const rawTransfers = Array.isArray(rebalanceInput)
    ? rebalanceInput
    : Array.isArray(rebalanceInput.transfers)
    ? rebalanceInput.transfers
    : [];

  const defaultTargetCat =
    rebalanceInput.deficit_category_id || rebalanceInput.target_category_id || null;
  const period = rebalanceInput.period || state.current_month_ist || state.currentPeriod;
  const capMap = getEffectiveCapMap(state, period);

  if (rawTransfers.length === 0) {
    addCode('NO_ELIGIBLE_DONOR', {});
    return {
      verdict: 'REJECTED',
      rule_codes: ruleCodes,
      warnings,
      constraints,
    };
  }

  const deltaByCategory = new Map();
  let totalCutMinor = 0;
  let totalAddMinor = 0;

  for (const leg of rawTransfers) {
    const fromCat = leg.from_category_id || leg.donor_category_id;
    const toCat = leg.to_category_id || defaultTargetCat;
    const amt = leg.amount_minor !== undefined ? leg.amount_minor : leg.transfer_minor;

    if (typeof amt !== 'number' || !Number.isInteger(amt) || amt <= 0) {
      addCode('ZERO_SUM_VIOLATION', { leg });
      continue;
    }
    if (!fromCat || !toCat || fromCat === toCat) {
      addCode('ZERO_SUM_VIOLATION', { leg });
      continue;
    }

    deltaByCategory.set(fromCat, (deltaByCategory.get(fromCat) || 0) - amt);
    deltaByCategory.set(toCat, (deltaByCategory.get(toCat) || 0) + amt);
    totalCutMinor += amt;
    totalAddMinor += amt;
  }

  // Check explicit updated_caps if supplied for zero-sum integrity
  if (Array.isArray(rebalanceInput.updated_caps) && rebalanceInput.updated_caps.length > 0) {
    let netUpdatedDiff = 0;
    for (const uc of rebalanceInput.updated_caps) {
      const oldCap = capMap.get(uc.category_id);
      if (oldCap === undefined || typeof uc.new_cap_minor !== 'number') {
        addCode('ZERO_SUM_VIOLATION', { updated_cap: uc });
      } else {
        netUpdatedDiff += uc.new_cap_minor - oldCap;
      }
    }
    if (netUpdatedDiff !== 0) {
      addCode('ZERO_SUM_VIOLATION', { net_cap_change_minor: netUpdatedDiff });
    }
  }

  if (totalCutMinor !== totalAddMinor || totalCutMinor <= 0) {
    addCode('ZERO_SUM_VIOLATION', { totalCutMinor, totalAddMinor });
  }

  const protectedList = (state.preferences && state.preferences.protected_categories) || [];

  for (const [catId, delta] of deltaByCategory.entries()) {
    const currentCap = capMap.get(catId);
    if (currentCap === undefined) {
      addCode('DONOR_CAP_TOO_LOW', { category_id: catId });
      continue;
    }
    const newCapMinor = currentCap + delta;

    if (delta < 0) {
      // Donor checks: never FIXED, never protected
      if (isFixedCategory(catId, state)) {
        addCode('CATEGORY_FIXED_NOT_REDUCIBLE', { category_id: catId });
        addCode('CATEGORY_NOT_CAPPABLE', { category_id: catId });
      }
      const isProt = protectedList.some(
        (p) => p === catId || (catId && catId.startsWith(`${p}.`))
      );
      if (isProt) {
        addCode('PROTECTED_CATEGORY', { category_id: catId });
        addCode('CATEGORY_PROTECTED', { category_id: catId });
      }

      // Check donor floor and current spend
      const covered = getCoveredLeafIds(catId, state, period, capMap);
      const sp = computeSpendForCategories(
        state.all_txns || state.transactions,
        covered,
        period,
        null,
        catId
      );
      const minFloor = Math.max(
        sp.spent_total_minor,
        (registry && registry.tier && registry.tier.min_cap_minor) || 10000
      );
      if (newCapMinor < minFloor) {
        addCode('DONOR_CAP_TOO_LOW', {
          category_id: catId,
          new_cap_minor: newCapMinor,
          floor_minor: minFloor,
        });
      }
    }

    // Run standard cap rule check on each leg
    const legCheck = validateCapChange(
      state,
      {
        category_id: catId,
        new_cap_minor: newCapMinor,
        scope: 'MONTH',
        period,
        override_protected: false,
      },
      registry
    );
    for (const rc of legCheck.rule_codes) {
      // Zero-sum rebalance does not change total caps so ignore GOAL_COMMITMENT_CONFLICT
      if (rc === 'GOAL_COMMITMENT_CONFLICT') continue;
      addCode(rc, { category_id: catId, new_cap_minor: newCapMinor }, 'MANDATORY');
    }
  }

  return {
    verdict: ruleCodes.length === 0 ? 'PASS' : 'REJECTED',
    rule_codes: ruleCodes,
    warnings,
    net_cap_change_minor: totalAddMinor - totalCutMinor,
    constraints,
  };
}

module.exports = {
  validateRebalance,
  validateRebalanceRule: validateRebalance,
};
