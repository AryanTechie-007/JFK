/**
 * sentinel_validate_cap_change — Section 6 Sentinel Function #6 & Cap Rules
 *
 * Purpose: Rule check for a proposed cap
 * Inputs: category, new_cap, snapshot_id, preferences, explicit_user_request
 * Returns: PASS or REJECTED, rule_code, warnings[], constraints[], suggested_replacement, tool_result_id
 *
 * Cap Rules (Section 6, Page 6):
 * 1. CAP_NEGATIVE: Cap cannot be negative -> REJECTED
 * 2. CATEGORY_UNKNOWN: Category must exist in the taxonomy -> REJECTED
 * 3. PROTECTED_CATEGORY: A cap reduction on a protected category is blocked unless the user explicitly asked for it -> REJECTED
 * 4. CAPS_EXCEED_SPENDABLE: Sum of caps above spendable income (income minus fixed expenses minus committed goal contributions) returns a WARNING, not a block -> PASS with WARNING
 * 5. CAP_ON_DEPRECATED_CATEGORY: A cap on a deprecated category returns a WARNING and the suggested replacement -> PASS with WARNING
 */

const SnapshotManager = require('./SnapshotManager');
const TaxonomyRegistry = require('../tally/TaxonomyRegistry');
const { CAP_RULE_CODES, CONSTRAINT_CODES } = require('../../contracts/PlatformRules');

let capValSeq = 1;

function sentinel_validate_cap_change({
  snapshot_id = null,
  category,
  new_cap,
  preferences = null,
  explicit_user_request = false
} = {}) {
  const snapshot = snapshot_id ? SnapshotManager.getSnapshot(snapshot_id) : null;
  if (snapshot_id && !snapshot) {
    const err = new Error(`Sentinel snapshot "${snapshot_id}" not found.`);
    err.code = 'SNAPSHOT_NOT_FOUND';
    throw err;
  }
  if (snapshot?.simulate_timeout) {
    const err = new Error('Sentinel timeout while validating cap change.');
    err.code = 'SENTINEL_TIMEOUT';
    throw err;
  }

  const toolResultId = `res_cap_val_${snapshot_id || 'inline'}_${capValSeq++}`;
  const numericCap = Number(new_cap);

  // Rule 1: CAP_NEGATIVE
  if (isNaN(numericCap) || numericCap < 0) {
    return {
      tool_result_id: toolResultId,
      status: 'REJECTED',
      result: 'REJECTED',
      rule_code: CAP_RULE_CODES.CAP_NEGATIVE,
      warnings: [],
      constraints: [CAP_RULE_CODES.CAP_NEGATIVE],
      message: 'Cap cannot be negative.'
    };
  }

  // Rule 2: CATEGORY_UNKNOWN
  const taxonomyNode = TaxonomyRegistry.resolve(category);
  if (!taxonomyNode) {
    return {
      tool_result_id: toolResultId,
      status: 'REJECTED',
      result: 'REJECTED',
      rule_code: CAP_RULE_CODES.CATEGORY_UNKNOWN,
      warnings: [],
      constraints: [CAP_RULE_CODES.CATEGORY_UNKNOWN],
      message: `Category "${category}" does not exist in the taxonomy.`
    };
  }

  const warnings = [];
  const constraints = [];
  let suggestedReplacement = null;

  // Rule 5: CAP_ON_DEPRECATED_CATEGORY (returns WARNING and suggested replacement, not a block)
  if (taxonomyNode.deprecated) {
    const repNode = TaxonomyRegistry.resolve(taxonomyNode.suggested_replacement);
    suggestedReplacement = {
      category_id: taxonomyNode.suggested_replacement,
      name: repNode ? repNode.name : taxonomyNode.SuggestedReplacementName
    };
    warnings.push({
      code: CAP_RULE_CODES.CAP_ON_DEPRECATED_CATEGORY,
      message: `Category "${taxonomyNode.name}" is deprecated. Suggested replacement: "${suggestedReplacement.name}" (${suggestedReplacement.category_id}).`,
      suggested_replacement: suggestedReplacement
    });
    constraints.push(CAP_RULE_CODES.CAP_ON_DEPRECATED_CATEGORY);
  }

  // Check existing cap and protected category status
  const rawProtected =
    preferences?.protected_categories ||
    (snapshot?.user_persona?.priority_categories
      ? JSON.parse(snapshot.user_persona.priority_categories)
      : ['Housing', 'Healthcare', 'Bills & Utilities']);

  const isProtected = rawProtected.some(p => {
    const res = TaxonomyRegistry.resolve(p);
    return (
      p === category ||
      p === taxonomyNode.category_id ||
      p === taxonomyNode.name ||
      (res && res.category_id === taxonomyNode.category_id)
    );
  });

  const existingCapRecord = snapshot?.caps?.find(
    c => c.category_id === taxonomyNode.category_id || c.category === taxonomyNode.name
  );
  const existingCap = existingCapRecord ? Number(existingCapRecord.monthly_cap) : null;

  // Rule 3: PROTECTED_CATEGORY (cap reduction on a protected category is blocked unless user explicitly asked for it)
  const explicitOverride = Boolean(explicit_user_request || preferences?.explicit_user_override);
  if (isProtected && existingCap !== null && numericCap < existingCap && !explicitOverride) {
    return {
      tool_result_id: toolResultId,
      status: 'REJECTED',
      result: 'REJECTED',
      rule_code: CAP_RULE_CODES.PROTECTED_CATEGORY,
      category_id: taxonomyNode.category_id,
      category: taxonomyNode.name,
      existing_cap: existingCap,
      proposed_cap: numericCap,
      warnings,
      constraints: [...constraints, CONSTRAINT_CODES.PROTECTED_CATEGORY],
      message: `A cap reduction on protected category "${taxonomyNode.name}" (from ₹${existingCap.toLocaleString()} to ₹${numericCap.toLocaleString()}) is blocked unless the user explicitly asked for it.`
    };
  }

  // Check if new cap is below already-incurred spend (CAP_BELOW_SPEND constraint)
  if (snapshot) {
    const monthSpend = snapshot.transactions
      .filter(t => (!snapshot.month || (t.txn_date || '').startsWith(snapshot.month)))
      .filter(t => t.category === taxonomyNode.name || t.category_id === taxonomyNode.category_id)
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    if (numericCap < monthSpend) {
      constraints.push(CONSTRAINT_CODES.CAP_BELOW_SPEND);
      warnings.push({
        code: CONSTRAINT_CODES.CAP_BELOW_SPEND,
        message: `Proposed cap ₹${numericCap.toLocaleString()} is below current month-to-date spend of ₹${monthSpend.toLocaleString()}.`
      });
    }

    // Rule 4: CAPS_EXCEED_SPENDABLE
    const spendableIncome =
      (snapshot.user.monthly_income || 0) -
      (snapshot.user.fixed_housing_expense || 0) -
      (snapshot.user.committed_goal_contributions || 0);

    const otherCapsSum = snapshot.caps
      .filter(c => c.category_id !== taxonomyNode.category_id && c.category !== taxonomyNode.name)
      .reduce((s, c) => s + (Number(c.monthly_cap) || 0), 0);

    const projectedTotalCaps = otherCapsSum + numericCap;
    if (spendableIncome > 0 && projectedTotalCaps > spendableIncome) {
      warnings.push({
        code: CAP_RULE_CODES.CAPS_EXCEED_SPENDABLE,
        message: `Sum of category caps (₹${projectedTotalCaps.toLocaleString()}) exceeds spendable income (₹${spendableIncome.toLocaleString()}).`,
        projected_total_caps: projectedTotalCaps,
        spendable_income: spendableIncome
      });
      constraints.push(CAP_RULE_CODES.CAPS_EXCEED_SPENDABLE);
    }
  }

  const primaryRuleCode = warnings.length > 0 ? warnings[0].code : 'PASS';

  return {
    tool_result_id: toolResultId,
    status: 'PASS',
    result: 'PASS',
    rule_code: primaryRuleCode,
    category_id: taxonomyNode.category_id,
    category: taxonomyNode.name,
    existing_cap: existingCap,
    proposed_cap: numericCap,
    warnings,
    constraints,
    suggested_replacement: suggestedReplacement,
    message: warnings.length > 0
      ? warnings.map(w => w.message).join(' ')
      : `Proposed cap of ₹${numericCap.toLocaleString()} for "${taxonomyNode.name}" passed all validation rules.`
  };
}

module.exports = sentinel_validate_cap_change;
