/**
 * SpecialistResponse@1 — Output Data Contract from Nova to John (Section 5.3 & 14)
 *
 * Validates:
 * - status: 'ok' | 'partial' | 'needs_input' | 'rejected' | 'error'
 * - findings[]: Statements with bound {{placeholders}}
 * - category_status_summary: Utilization and tier per category from Sentinel
 * - boundary_alerts[]: Alert references with tier, provisional flag, and Sentinel tool_result_id
 * - daily_spending_envelope: Safe & conservative daily envelope (headline uses conservative when confidence !== 'high')
 * - constraints[]: Constraint codes (PROTECTED_CATEGORY, CAP_BELOW_SPEND, ZERO_SUM_VIOLATION, LOW_CATEGORIZATION_COVERAGE, etc.)
 * - proposed_actions[]: Only ADJUST_BUDGET_CAP, APPLY_REBALANCE, DISMISS_ALERT, CREATE_ALERT (never RECATEGORIZE_TRANSACTION)
 * - peer_hints[]: GOAL_FUNDING_PRESSURE, RECURRING_ANOMALY, MISCATEGORIZATION_SUSPECTED
 * - confidence, tool_result_ids[]
 */

const {
  RESPONSE_STATUSES,
  NOVA_PROPOSED_ACTIONS,
  PEER_HINT_CODES
} = require('./PlatformRules');

class SpecialistResponseV1 {
  static build(payload = {}) {
    const status = payload.status || RESPONSE_STATUSES.OK;
    if (!Object.values(RESPONSE_STATUSES).includes(status)) {
      throw new Error(`Invalid SpecialistResponse@1 status: ${status}`);
    }

    const proposedActions = Array.isArray(payload.proposed_actions) ? payload.proposed_actions : [];
    for (const action of proposedActions) {
      if (action.type === 'RECATEGORIZE_TRANSACTION') {
        throw new Error('Guardrail violation: RECATEGORIZE_TRANSACTION is forbidden in Nova proposed_actions.');
      }
      if (!Object.values(NOVA_PROPOSED_ACTIONS).includes(action.type)) {
        throw new Error(`Unsupported Nova proposed action type: ${action.type}`);
      }
    }

    const peerHints = Array.isArray(payload.peer_hints) ? payload.peer_hints : [];
    for (const hint of peerHints) {
      if (!Object.values(PEER_HINT_CODES).includes(hint.type)) {
        throw new Error(`Unsupported Nova peer_hint type: ${hint.type}`);
      }
    }

    const confidence = payload.confidence || 'high';
    const envelopeInput = payload.daily_spending_envelope || null;
    let formattedEnvelope = null;

    if (envelopeInput) {
      const safeVal = Number(envelopeInput.safe_amount ?? envelopeInput.safe_daily_envelope ?? 0);
      const conservativeVal = Number(
        envelopeInput.conservative_amount ??
        envelopeInput.conservative_daily_envelope ??
        Math.floor(safeVal * 0.8)
      );
      // Section 9 & 13 #8: With non-high confidence, the conservative envelope is the headline in 100% of cases.
      const headlineVal = confidence === 'high' ? safeVal : conservativeVal;
      formattedEnvelope = {
        headline_amount: headlineVal,
        headline_mode: confidence === 'high' ? 'safe' : 'conservative',
        safe_amount: safeVal,
        conservative_amount: conservativeVal,
        days_remaining: envelopeInput.days_remaining ?? null,
        confidence,
        tool_result_id: envelopeInput.tool_result_id || null
      };
    }

    return {
      schema: 'SpecialistResponse@1',
      agent: 'Nova',
      status,
      findings: Array.isArray(payload.findings) ? payload.findings : [],
      category_status_summary: Array.isArray(payload.category_status_summary)
        ? payload.category_status_summary
        : [],
      boundary_alerts: Array.isArray(payload.boundary_alerts)
        ? payload.boundary_alerts
        : [],
      daily_spending_envelope: formattedEnvelope,
      constraints: Array.isArray(payload.constraints) ? payload.constraints : [],
      proposed_actions: proposedActions,
      peer_hints: peerHints,
      confidence,
      tool_result_ids: Array.isArray(payload.tool_result_ids) ? payload.tool_result_ids : [],
      candidates: Array.isArray(payload.candidates) ? payload.candidates : undefined,
      uncategorized_summary: payload.uncategorized_summary || undefined,
      error_detail: payload.error_detail || undefined
    };
  }
}

module.exports = SpecialistResponseV1;
