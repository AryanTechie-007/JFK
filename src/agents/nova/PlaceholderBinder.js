/**
 * PlaceholderBinder — Binds Every Numeric Figure in Nova's Findings to a Sentinel tool_result_id
 *
 * Implements Section 5.3 ("findings[]: Statements with bound {{placeholders}}"),
 * Section 9 ("No local computations. Every figure is bound to a Sentinel result."),
 * Section 13 #3 ("Zero ungrounded numbers in Nova's eval set."),
 * and Section 14 #3 ("Grounded numbers. Every figure is a placeholder bound to a Sentinel tool_result_id.").
 */

class PlaceholderBinder {
  /**
   * Creates a grounded finding statement where every numeric figure is represented
   * by a `{{placeholder}}` in `statement_template` and bound to a Sentinel `tool_result_id`.
   */
  static createGroundedFinding({
    statement_template,
    bindings = {},
    tool_result_id
  }) {
    if (!statement_template || typeof statement_template !== 'string') {
      throw new Error('PlaceholderBinder requires a non-empty statement_template.');
    }
    if (!tool_result_id) {
      throw new Error('PlaceholderBinder requires a Sentinel tool_result_id.');
    }

    // Verify that the template itself contains NO raw ungrounded numbers outside {{placeholders}}
    const strippedTemplate = statement_template.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');
    const strayDigits = strippedTemplate.match(/\d+/g);
    if (strayDigits && strayDigits.length > 0) {
      throw new Error(
        `Ungrounded number detected in statement_template: "${strayDigits.join(', ')}" in "${statement_template}". All numbers must use {{placeholders}}.`
      );
    }

    const normalizedBindings = {};
    let rendered = statement_template;

    for (const [key, entry] of Object.entries(bindings)) {
      const isObj = entry && typeof entry === 'object' && 'value' in entry;
      const rawVal = isObj ? entry.value : entry;
      const formattedVal = isObj && entry.formatted !== undefined
        ? String(entry.formatted)
        : typeof rawVal === 'number'
          ? rawVal.toLocaleString()
          : String(rawVal);
      const sourceToolId = (isObj && entry.tool_result_id) || tool_result_id;

      normalizedBindings[key] = {
        placeholder: `{{${key}}}`,
        value: rawVal,
        formatted: formattedVal,
        tool_result_id: sourceToolId
      };

      rendered = rendered.split(`{{${key}}}`).join(formattedVal);
    }

    return {
      statement: statement_template,
      rendered_statement: rendered,
      bindings: normalizedBindings,
      tool_result_id
    };
  }

  /**
   * Audits an array of findings to verify 0 ungrounded numbers exist (Section 13 #3).
   */
  static auditFindingsForUngroundedNumbers(findings = [], validToolResultIds = []) {
    const validSet = new Set(validToolResultIds);
    let ungroundedCount = 0;
    const violations = [];

    for (const f of findings) {
      const template = f.statement || '';
      const withoutPlaceholders = template.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');
      const rawNumbers = withoutPlaceholders.match(/\d+/g);
      if (rawNumbers && rawNumbers.length > 0) {
        ungroundedCount += rawNumbers.length;
        violations.push(`Raw number(s) [${rawNumbers.join(', ')}] in template: "${template}"`);
      }

      const placeholderMatches = template.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
      for (const token of placeholderMatches) {
        const key = token.slice(2, -2);
        const b = f.bindings?.[key];
        if (!b || !b.tool_result_id || (validSet.size > 0 && !validSet.has(b.tool_result_id) && !validToolResultIds.some(id => b.tool_result_id.startsWith(id)))) {
          ungroundedCount++;
          violations.push(`Unbound placeholder ${token} in template: "${template}"`);
        }
      }
    }

    return {
      ungrounded_number_count: ungroundedCount,
      is_fully_grounded: ungroundedCount === 0,
      violations
    };
  }
}

module.exports = PlaceholderBinder;
