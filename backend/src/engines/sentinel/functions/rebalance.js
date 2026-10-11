/**
 * 8 & 9. `sentinel_run_rebalance_simulation` & `sentinel_validate_cap_change` (Sentinel §B.6.8, §B.6.9, §C.3, §K.1, SEN-AC-18)
 */

const { multiplyMinorByBp } = require('../../../shared/money');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState } = require('../inputs/load');
const { isFixedCategory } = require('../ledger/spend');
const { makeConstraint } = require('../rules/goal');
const { validateCapChange } = require('../rules/cap');
const { sentinel_run_category_utilization } = require('./utilization');
const { sentinel_run_velocity_projection } = require('./velocity');
const { buildEnvelope } = require('./envelope');

function sentinel_run_rebalance_simulation(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const period = args.period || state.current_month_ist;
  const targetCategoryId = args.deficit_category_id || args.target_category_id;

  const utilRes = sentinel_run_category_utilization(state, { period }, registry);
  const velRes = sentinel_run_velocity_projection(state, { period }, registry);

  const targetRow = utilRes.data.categories.find((c) => c.category_id === targetCategoryId);
  if (!targetRow) {
    return buildEnvelope(
      state,
      'sentinel_run_rebalance_simulation',
      null,
      'LOW',
      [],
      'ERROR',
      { code: 'UNKNOWN_ENTITY', message: `Cap for category ${targetCategoryId} not found.` },
      { registry, params: args }
    );
  }

  const targetVel = velRes.data.projections.find((p) => p.category_id === targetCategoryId);
  const projectedTargetSpend =
    state.day_of_month <= 1 || !targetVel
      ? targetRow.total_spend_minor
      : Math.max(targetRow.total_spend_minor, targetVel.projected_month_end_minor);
  const computedDeficitMinor = Math.max(
    targetRow.excess_minor,
    Math.max(0, projectedTargetSpend - targetRow.cap_minor)
  );

  const neededMinor =
    args.needed_minor != null
      ? Number(args.needed_minor)
      : Math.max(computedDeficitMinor, registry.min_cap_floor_minor || 10000);

  const protectedSet = new Set((state.preferences && state.preferences.protected_categories) || []);
  const excludedProtected = [];
  const excludedFixed = [];
  const eligibleDonors = [];

  const maxUtilBp =
    (registry.rebalance && registry.rebalance.donor_max_utilization_bp) ||
    registry.donor_max_utilization_bp ||
    7000;
  const maxShareBp =
    (registry.rebalance && registry.rebalance.donor_max_share_bp) ||
    registry.donor_max_share_bp ||
    5000;
  const minCutMinor =
    (registry.rebalance && registry.rebalance.min_donor_cut_minor) ||
    registry.min_donor_transfer_minor ||
    5000;
  const maxDonors =
    (registry.rebalance && registry.rebalance.max_donors) || registry.max_donors || 3;

  for (const cat of utilRes.data.categories) {
    if (cat.category_id === targetCategoryId) continue;
    if (isFixedCategory(cat.category_id, state)) {
      excludedFixed.push(cat.category_id);
      continue;
    }
    const isProt = [...protectedSet].some(
      (p) => p === cat.category_id || cat.category_id.startsWith(`${p}.`)
    );
    if (isProt) {
      excludedProtected.push(cat.category_id);
      continue;
    }
    if (cat.utilization_bp >= maxUtilBp) continue;

    const vel = velRes.data.projections.find((p) => p.category_id === cat.category_id);
    const projectedSpendMinor =
      state.day_of_month <= 1 || !vel
        ? cat.total_spend_minor
        : Math.max(cat.total_spend_minor, vel.projected_month_end_minor);
    const safeHeadroomMinor = Math.max(0, cat.cap_minor - projectedSpendMinor);
    const maxTransferMinor = multiplyMinorByBp(safeHeadroomMinor, maxShareBp);

    if (maxTransferMinor >= minCutMinor) {
      eligibleDonors.push({
        category_id: cat.category_id,
        display_name: cat.display_name,
        current_cap_minor: cat.cap_minor,
        spend_to_date_minor: cat.total_spend_minor,
        max_transfer_minor: maxTransferMinor,
      });
    }
  }

  // §B.6.8: Order donors by capacity descending, then category_id ascending
  eligibleDonors.sort(
    (a, b) =>
      b.max_transfer_minor - a.max_transfer_minor || a.category_id.localeCompare(b.category_id)
  );

  const constraints = [];
  if (eligibleDonors.length === 0) {
    constraints.push(
      makeConstraint('NO_ELIGIBLE_DONOR', { target_category_id: targetCategoryId })
    );
    return buildEnvelope(
      state,
      'sentinel_run_rebalance_simulation',
      {
        period,
        deficit_category_id: targetCategoryId,
        target_category_id: targetCategoryId,
        deficit_minor: neededMinor,
        needed_minor: neededMinor,
        covered_minor: 0,
        shortfall_minor: neededMinor,
        unmet_minor: neededMinor,
        fully_covered: false,
        transfers: [],
        updated_caps: [],
        net_cap_change_minor: 0,
        excluded_protected: excludedProtected,
        excluded_fixed: excludedFixed,
      },
      'HIGH',
      constraints,
      'OK',
      null,
      { registry, params: args }
    );
  }

  let remainingNeed = neededMinor;
  const transfers = [];
  const updatedCaps = [];

  for (const donor of eligibleDonors.slice(0, maxDonors)) {
    if (remainingNeed <= 0) break;
    const transferAmt = Math.min(remainingNeed, donor.max_transfer_minor);
    if (transferAmt < minCutMinor) continue;
    transfers.push({
      from_category_id: donor.category_id,
      from_display_name: donor.display_name,
      to_category_id: targetCategoryId,
      to_display_name: targetRow.display_name,
      amount_minor: transferAmt,
      donor_cap_before_minor: donor.current_cap_minor,
      donor_cap_after_minor: donor.current_cap_minor - transferAmt,
    });
    updatedCaps.push({
      category_id: donor.category_id,
      new_cap_minor: donor.current_cap_minor - transferAmt,
    });
    remainingNeed -= transferAmt;
  }

  const coveredMinor = neededMinor - remainingNeed;
  if (coveredMinor > 0) {
    updatedCaps.push({
      category_id: targetCategoryId,
      new_cap_minor: targetRow.cap_minor + coveredMinor,
    });
  }

  const fullyCovered = remainingNeed === 0;
  if (!fullyCovered) {
    constraints.push(
      makeConstraint(
        'REBALANCE_NOT_COVERED',
        { covered_minor: coveredMinor, unmet_minor: remainingNeed },
        'WARNING'
      )
    );
  }

  return buildEnvelope(
    state,
    'sentinel_run_rebalance_simulation',
    {
      // Canonical §C.3 fields
      period,
      deficit_minor: neededMinor,
      transfers,
      covered_minor: coveredMinor,
      shortfall_minor: remainingNeed,
      updated_caps: updatedCaps,
      net_cap_change_minor: 0,
      excluded_protected: excludedProtected,
      excluded_fixed: excludedFixed,
      // Legacy compatibility fields
      deficit_category_id: targetCategoryId,
      target_category_id: targetCategoryId,
      target_cap_before_minor: targetRow.cap_minor,
      target_cap_after_minor: targetRow.cap_minor + coveredMinor,
      needed_minor: neededMinor,
      unmet_minor: remainingNeed,
      fully_covered: fullyCovered,
    },
    'HIGH',
    constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

function sentinel_validate_cap_change(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const res = validateCapChange(state, args, registry);
  return buildEnvelope(
    state,
    'sentinel_validate_cap_change',
    {
      verdict: res.verdict,
      rule_codes: res.rule_codes,
      warnings: res.warnings,
      current_cap_minor: res.current_cap_minor,
      spent_total_minor: res.spent_total_minor,
      ...(res.suggested_category_id ? { suggested_category_id: res.suggested_category_id } : {}),
      // Legacy compatibility fields
      category_id: res.category_id,
      new_cap_minor: res.new_cap_minor,
      previous_cap_minor: res.previous_cap_minor,
      floor_minor: res.floor_minor,
      scope: res.scope,
      period: res.period,
    },
    null,
    res.constraints,
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_run_rebalance_simulation,
  sentinel_validate_cap_change,
};
