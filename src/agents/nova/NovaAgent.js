/**
 * NovaAgent — Stateless Real-Time Sub-Agent (Budget Tracker & Category Guardian)
 *
 * Implements Nova: Agent Specification (V4):
 * - Stateless specialist: accepts `TaskPacket@1`, returns `SpecialistResponse@1`.
 * - No write tools: calls only Sentinel's 6 allowlisted functions via ToolGateway.
 * - Star topology: never messages Iris or Atlas directly; emits `peer_hints[]` for John.
 * - Grounded numbers: every figure in `findings[]` is bound via `{{placeholders}}` to a `tool_result_id`.
 * - Margin of safety: uses conservative daily spending envelope whenever `confidence !== 'high'`.
 * - Provisional & Uncategorized handling: labels provisional breaches (`provisional: true`),
 *   excludes UNCATEGORIZED from caps and displays it beside live status when material.
 * - Handles all Section 12 error states (Sentinel timeout fallback, stale snapshot re-run,
 *   ambiguous category -> `needs_input`, cap validation `REJECTED`, shortfall -> `partial` + `GOAL_FUNDING_PRESSURE`).
 */

const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const SpecialistResponseV1 = require('../../contracts/SpecialistResponseV1');
const {
  TASK_TYPES,
  RESPONSE_STATUSES,
  CONSTRAINT_CODES,
  NOVA_PROPOSED_ACTIONS,
  PEER_HINT_CODES
} = require('../../contracts/PlatformRules');
const SnapshotManager = require('../../tools/sentinel/SnapshotManager');
const TaxonomyRegistry = require('../../tools/tally/TaxonomyRegistry');
const { defaultAlertStore } = require('../../tools/threshold-job/AlertHygieneStore');
const NovaLifecycleRunner = require('./NovaLifecycleRunner');
const PlaceholderBinder = require('./PlaceholderBinder');
const UntrustedTextSanitizer = require('./UntrustedTextSanitizer');

class NovaAgent {
  /**
   * Main V4 Stateless Entrypoint: TaskPacket@1 -> SpecialistResponse@1
   */
  static invoke(rawPacket, options = {}) {
    // 1. Validate TaskPacket@1 (enforces NO user_id, NO raw ledger)
    TaskPacketV1.validate(rawPacket);

    // 2. Sanitize any untrusted user_message or event strings against prompt injection (Section 9 & 13 #9)
    const sanitizedUserMsg = UntrustedTextSanitizer.sanitizeText(rawPacket.user_message || '');
    const sanitizedMerchant = UntrustedTextSanitizer.sanitizeText(rawPacket.event?.merchant || '');

    // If an adversarial tool call is requested inside event/options, ToolGateway will block it
    if (options.attempt_write_tool) {
      const { SentinelEngine } = require('../../tools/sentinel');
      SentinelEngine.callTool(options.attempt_write_tool, {}, rawPacket.allowed_tools);
    }

    // 3. Section 12: Ambiguous category in a request -> return `needs_input` with candidates
    const categoryQuery =
      rawPacket.event?.category_query ||
      rawPacket.ui_context?.ambiguous_category ||
      this.extractAmbiguousCategoryFromText(sanitizedUserMsg.sanitized);

    if (categoryQuery) {
      const candidates = TaxonomyRegistry.findAmbiguousCandidates(categoryQuery);
      if (candidates.length > 1) {
        return SpecialistResponseV1.build({
          status: RESPONSE_STATUSES.NEEDS_INPUT,
          findings: [],
          candidates,
          confidence: 'high',
          tool_result_ids: []
        });
      }
    }

    // 4. Section 12: Stale snapshot -> Re-run on the new snapshot
    let activePacket = rawPacket;
    let rerunOnNewSnapshot = false;
    const requestedSnap = SnapshotManager.getSnapshot(rawPacket.snapshot_id);
    if (requestedSnap && SnapshotManager.isStale(rawPacket.snapshot_id)) {
      const latestSnap = SnapshotManager.getLatestSnapshot(requestedSnap.user_id);
      if (latestSnap && latestSnap.snapshot_id !== rawPacket.snapshot_id) {
        activePacket = TaskPacketV1.create({
          ...rawPacket,
          snapshot_id: latestSnap.snapshot_id,
          data_quality: {
            ...rawPacket.data_quality,
            categorization_version: latestSnap.categorization_version,
            data_stale: false
          }
        });
        rerunOnNewSnapshot = true;
      }
    }

    // 5. Execute Conditional Lifecycle (Section 8) with Sentinel Error/Timeout Fallback (Section 12)
    let lifecycle;
    try {
      lifecycle = NovaLifecycleRunner.run(activePacket);
    } catch (err) {
      // Section 12: Sentinel error or timeout -> Return `error`; alert from job still shows tier data from last good snapshot, labeled with its age
      const lastGood = SnapshotManager.getLastGoodSnapshot(requestedSnap?.user_id || 'user_demo_nova');
      const fallbackAlerts = defaultAlertStore.getOpenAlerts(requestedSnap?.user_id).map(a => ({
        alert_id: a.alert_id,
        category: a.category,
        tier: a.tier,
        provisional: Boolean(a.provisional),
        tool_result_id: a.tool_result_id,
        from_last_good_snapshot: true,
        snapshot_age_label: lastGood ? lastGood.age_label : 'unknown age'
      }));

      return SpecialistResponseV1.build({
        status: RESPONSE_STATUSES.ERROR,
        findings: [],
        boundary_alerts: fallbackAlerts,
        confidence: 'low',
        tool_result_ids: [],
        error_detail: {
          code: err.code || 'SENTINEL_ERROR',
          message: err.message,
          fallback_snapshot_id: lastGood?.snapshot_id || null,
          fallback_snapshot_age_label: lastGood?.age_label || null
        }
      });
    }

    const { called_tools, tool_result_ids, sentinel_results } = lifecycle;
    const utilSnap = sentinel_results.category_utilization_snapshot;
    const velProj = sentinel_results.velocity_projection;
    const anomFlags = sentinel_results.anomaly_flags;
    const rebData = sentinel_results.rebalance_proposal_data;
    const capVal = sentinel_results.cap_validation_result;
    const ledgerSum = sentinel_results.ledger_summary;

    // Determine confidence (Section 14 #6)
    let confidence = velProj?.confidence || ledgerSum?.confidence || 'high';
    if (
      activePacket.data_quality?.import_in_progress ||
      activePacket.data_quality?.data_stale ||
      (activePacket.data_quality?.coverage_by_amount ?? 1) < 0.85
    ) {
      confidence = 'low';
    } else if ((activePacket.data_quality?.needs_review_count ?? 0) > 0) {
      confidence = 'medium';
    }

    const findings = [];
    const constraints = [];
    const proposedActions = [];
    const peerHints = [];
    const boundaryAlerts = [];
    let responseStatus = RESPONSE_STATUSES.OK;

    // Check low categorization coverage constraint
    if ((activePacket.data_quality?.coverage_by_amount ?? 1) < 0.9) {
      constraints.push(CONSTRAINT_CODES.LOW_CATEGORIZATION_COVERAGE);
    }

    // Check suspected miscategorizations from event -> emit MISCATEGORIZATION_SUSPECTED hint for John (never RECATEGORIZE_TRANSACTION)
    if (Array.isArray(activePacket.event?.suspected_miscategorizations)) {
      for (const item of activePacket.event.suspected_miscategorizations) {
        peerHints.push({
          type: PEER_HINT_CODES.MISCATEGORIZATION_SUSPECTED,
          target_agent: 'John',
          transaction_id: item.transaction_id,
          assigned_category: item.assigned_category,
          suspected_category: item.suspected_category,
          note: 'Add item to John categorization review queue.'
        });
      }
    }
    if (activePacket.event?.miscategorization_suspected) {
      peerHints.push({
        type: PEER_HINT_CODES.MISCATEGORIZATION_SUSPECTED,
        target_agent: 'John',
        note: 'Suspected miscategorization flagged for John review queue.'
      });
    }

    // Build category_status_summary & boundary_alerts from utilization output
    const categoryStatusSummary = (utilSnap?.capped_categories || []).map(c => ({
      category_id: c.category_id,
      category: c.category,
      monthly_cap: c.monthly_cap,
      spent_total: c.spent_total,
      spent_settled: c.spent_settled,
      spent_provisional: c.spent_provisional,
      remaining: c.remaining,
      utilization_pct: c.utilization_pct,
      tier: c.tier,
      tier_is_provisional: c.tier_is_provisional,
      migrated: c.migrated,
      migrated_from: c.migrated_from,
      tool_result_id: c.tool_result_id
    }));

    if (utilSnap) {
      for (const c of utilSnap.capped_categories) {
        if (c.tier === 'warning' || c.tier === 'exceeded') {
          // Section 12: Import in progress or data stale -> do not present new Exceeded alerts from provisional data without provisional label
          const isProvisional = Boolean(
            c.tier_is_provisional ||
            ((activePacket.data_quality?.import_in_progress || activePacket.data_quality?.data_stale) && c.spent_provisional > 0)
          );
          boundaryAlerts.push({
            category_id: c.category_id,
            category: c.category,
            tier: c.tier,
            provisional: isProvisional,
            review_list_url: isProvisional ? '/api/transactions/review-queue' : null,
            utilization_pct: c.utilization_pct,
            tool_result_id: c.tool_result_id,
            caused_by_category_change: Boolean(activePacket.event?.is_correction || activePacket.event?.corrections?.length)
          });
        }
      }
    }

    // Task-Specific Logic
    if (activePacket.task_type === TASK_TYPES.ADJUST_CAP_REQUEST && capVal) {
      for (const code of capVal.constraints || []) {
        if (!constraints.includes(code)) constraints.push(code);
      }

      if (capVal.status === 'REJECTED') {
        // Section 12: Cap validation REJECTED -> Return the rule code; no proposal
        responseStatus = RESPONSE_STATUSES.REJECTED;
        findings.push(
          PlaceholderBinder.createGroundedFinding({
            statement_template: `Cap update for ${capVal.category || 'requested category'} was rejected under rule ${capVal.rule_code} (proposed cap: ₹{{proposed_cap}}).`,
            bindings: {
              proposed_cap: { value: capVal.proposed_cap || 0, tool_result_id: capVal.tool_result_id }
            },
            tool_result_id: capVal.tool_result_id
          })
        );
      } else {
        let template = `Proposed cap of ₹{{proposed_cap}} for ${capVal.category} passed validation.`;
        if (capVal.rule_code === 'CAP_ON_DEPRECATED_CATEGORY' && capVal.suggested_replacement) {
          template = `Warning: ${capVal.category} is deprecated; suggested replacement is ${capVal.suggested_replacement.name}. Proposed cap is ₹{{proposed_cap}}.`;
        } else if (capVal.rule_code === 'CAPS_EXCEED_SPENDABLE') {
          template = `Warning: Total category caps exceed spendable income. Proposed cap for ${capVal.category} is ₹{{proposed_cap}}.`;
        }

        findings.push(
          PlaceholderBinder.createGroundedFinding({
            statement_template: template,
            bindings: {
              proposed_cap: { value: capVal.proposed_cap, tool_result_id: capVal.tool_result_id }
            },
            tool_result_id: capVal.tool_result_id
          })
        );

        proposedActions.push({
          type: NOVA_PROPOSED_ACTIONS.ADJUST_BUDGET_CAP,
          tier: 'T2',
          requires_confirmation: true,
          payload: {
            category_id: capVal.category_id,
            category: capVal.category,
            new_cap: capVal.proposed_cap,
            suggested_replacement: capVal.suggested_replacement || null
          },
          tool_result_id: capVal.tool_result_id
        });
      }
    }

    if (activePacket.task_type === TASK_TYPES.LIVE_STATUS && utilSnap) {
      const targetCat = utilSnap.category || utilSnap.capped_categories[0];
      if (targetCat) {
        const provisionalNote = targetCat.tier_is_provisional
          ? ' (provisional tier — includes transactions under review)'
          : '';
        const staleCaveat = (activePacket.data_quality?.import_in_progress || activePacket.data_quality?.data_stale)
          ? ` [Data caveat: snapshot age {{snapshot_age}}s${activePacket.data_quality?.import_in_progress ? ', import in progress' : ''}]`
          : '';

        const bindings = {
          spent_total: { value: targetCat.spent_total, tool_result_id: targetCat.tool_result_id },
          monthly_cap: { value: targetCat.monthly_cap, tool_result_id: targetCat.tool_result_id },
          utilization_pct: { value: targetCat.utilization_pct, formatted: `${targetCat.utilization_pct}%`, tool_result_id: targetCat.tool_result_id },
          remaining_allowance: { value: Math.abs(targetCat.remaining), tool_result_id: targetCat.tool_result_id }
        };
        if (staleCaveat) {
          bindings.snapshot_age = { value: activePacket.data_quality?.snapshot_age_seconds || 0, tool_result_id: utilSnap.tool_result_id };
        }

        findings.push(
          PlaceholderBinder.createGroundedFinding({
            statement_template: `${targetCat.category} spend is ₹{{spent_total}} of ₹{{monthly_cap}} ({{utilization_pct}}, ${targetCat.tier} tier${provisionalNote}), leaving ₹{{remaining_allowance}} remaining.${staleCaveat}`,
            bindings,
            tool_result_id: targetCat.tool_result_id
          })
        );
      }

      // Section 11A & 12: Category missing (UNCATEGORIZED) -> Excluded from caps; show uncategorized total beside status; suggest review if large
      if (utilSnap.uncategorized && utilSnap.uncategorized.spent_total > 0) {
        const reviewSuggestion = utilSnap.uncategorized.is_material
          ? ' This uncategorized amount is material; reviewing those transactions is recommended.'
          : '';
        findings.push(
          PlaceholderBinder.createGroundedFinding({
            statement_template: `Uncategorized spend excluded from category caps totals ₹{{uncategorized_total}} across {{uncategorized_count}} transaction(s).${reviewSuggestion}`,
            bindings: {
              uncategorized_total: { value: utilSnap.uncategorized.spent_total, tool_result_id: utilSnap.tool_result_id },
              uncategorized_count: { value: utilSnap.uncategorized.txn_count, tool_result_id: utilSnap.tool_result_id }
            },
            tool_result_id: utilSnap.tool_result_id
          })
        );
      }
    }

    if (
      (activePacket.task_type === TASK_TYPES.BREACH_EVENT || activePacket.task_type === TASK_TYPES.PROPOSE_REBALANCE) &&
      rebData
    ) {
      // State protected category exclusion explicitly (Section 9 Guardrails)
      constraints.push(CONSTRAINT_CODES.PROTECTED_CATEGORY);

      if (utilSnap) {
        const breachedCat =
          utilSnap.category ||
          utilSnap.capped_categories.find(c => c.tier === 'exceeded' || c.tier === 'warning') ||
          utilSnap.capped_categories[0];

        if (breachedCat) {
          const isProvisional = breachedCat.tier_is_provisional;
          const isCorrection = Boolean(activePacket.event?.is_correction || activePacket.event?.corrections?.length);
          const causeText = isCorrection ? ' caused by a transaction category change' : '';
          const provisionalText = isProvisional
            ? ' This breach is provisional because it depends on NEEDS_REVIEW transactions (see review list); it is not yet certain.'
            : '';

          findings.push(
            PlaceholderBinder.createGroundedFinding({
              statement_template: `${breachedCat.category} reached {{utilization_pct}} (spent ₹{{spent_total}} vs cap ₹{{monthly_cap}})${causeText}.${provisionalText}`,
              bindings: {
                utilization_pct: { value: breachedCat.utilization_pct, formatted: `${breachedCat.utilization_pct}%`, tool_result_id: breachedCat.tool_result_id },
                spent_total: { value: breachedCat.spent_total, tool_result_id: breachedCat.tool_result_id },
                monthly_cap: { value: breachedCat.monthly_cap, tool_result_id: breachedCat.tool_result_id }
              },
              tool_result_id: breachedCat.tool_result_id
            })
          );
        }
      }

      if (rebData.has_proposals) {
        const topMove = rebData.moves[0];
        findings.push(
          PlaceholderBinder.createGroundedFinding({
            statement_template: `Zero-sum rebalance transfers ₹{{transfer_amount}} from ${topMove.from_category} (new cap ₹{{donor_new_cap}}) to ${topMove.to_category} (new cap ₹{{recipient_new_cap}}), excluding protected categories (${rebData.excluded_protected_categories.join(', ')}).`,
            bindings: {
              transfer_amount: { value: topMove.amount, tool_result_id: rebData.tool_result_id },
              donor_new_cap: { value: topMove.donor_new_cap, tool_result_id: rebData.tool_result_id },
              recipient_new_cap: { value: topMove.recipient_new_cap, tool_result_id: rebData.tool_result_id }
            },
            tool_result_id: rebData.tool_result_id
          })
        );

        proposedActions.push({
          type: NOVA_PROPOSED_ACTIONS.APPLY_REBALANCE,
          tier: 'T2',
          requires_confirmation: true,
          payload: topMove,
          tool_result_id: rebData.tool_result_id
        });
      }

      // Section 7 Pattern C & Section 12: No donor category available / shortfall -> return `partial` with shortfall and `GOAL_FUNDING_PRESSURE` hint
      if (rebData.shortfall > 0 || (!rebData.has_proposals && rebData.total_deficit_amount > 0)) {
        responseStatus = RESPONSE_STATUSES.PARTIAL;
        findings.push(
          PlaceholderBinder.createGroundedFinding({
            statement_template: `Protected categories (${rebData.excluded_protected_categories.join(', ')}) are excluded from donor transfers, leaving an unresolved deficit shortfall of ₹{{shortfall_amount}}.`,
            bindings: {
              shortfall_amount: { value: rebData.shortfall || rebData.total_deficit_amount, tool_result_id: rebData.tool_result_id }
            },
            tool_result_id: rebData.tool_result_id
          })
        );

        peerHints.push({
          type: PEER_HINT_CODES.GOAL_FUNDING_PRESSURE,
          target_agent: 'Atlas',
          shortfall_amount: rebData.shortfall || rebData.total_deficit_amount,
          tool_result_id: rebData.tool_result_id,
          note: 'No non-protected donor category can clear the full deficit; John may ask Atlas for a temporary goal pause option.'
        });
      }
    }

    if (
      (activePacket.task_type === TASK_TYPES.ANOMALY_EVENT || activePacket.task_type === TASK_TYPES.EXPLAIN_ANOMALY) &&
      anomFlags
    ) {
      if (anomFlags.anomaly_count > 0) {
        const primaryAnom =
          anomFlags.anomalies.find(a => a.type === 'SUBSCRIPTION_PRICE_CREEP') ||
          anomFlags.anomalies[0];

        if (primaryAnom.type === 'SUBSCRIPTION_PRICE_CREEP') {
          findings.push(
            PlaceholderBinder.createGroundedFinding({
              statement_template: `${primaryAnom.merchant} subscription increased by {{increase_pct}} from ₹{{historical_amount}} to ₹{{current_amount}} (delta: ₹{{delta_amount}}).`,
              bindings: {
                increase_pct: { value: primaryAnom.increase_pct, formatted: `${primaryAnom.increase_pct}%`, tool_result_id: primaryAnom.tool_result_id },
                historical_amount: { value: primaryAnom.historical_amount, tool_result_id: primaryAnom.tool_result_id },
                current_amount: { value: primaryAnom.current_amount, tool_result_id: primaryAnom.tool_result_id },
                delta_amount: { value: primaryAnom.delta, tool_result_id: primaryAnom.tool_result_id }
              },
              tool_result_id: primaryAnom.tool_result_id
            })
          );
        } else {
          findings.push(
            PlaceholderBinder.createGroundedFinding({
              statement_template: `Detected ${primaryAnom.type} in ${primaryAnom.category} with impact of ₹{{impact_amount}}.`,
              bindings: {
                impact_amount: { value: primaryAnom.impact_amount, tool_result_id: primaryAnom.tool_result_id }
              },
              tool_result_id: primaryAnom.tool_result_id
            })
          );
        }

        // Pattern B: Propose CREATE_ALERT to keep it on the dashboard and add RECURRING_ANOMALY hint for Iris
        proposedActions.push({
          type: NOVA_PROPOSED_ACTIONS.CREATE_ALERT,
          tier: 'T1',
          requires_confirmation: false,
          payload: {
            category: primaryAnom.category,
            title: primaryAnom.title,
            message: primaryAnom.description,
            tool_result_id: primaryAnom.tool_result_id
          },
          tool_result_id: primaryAnom.tool_result_id
        });

        peerHints.push({
          type: PEER_HINT_CODES.RECURRING_ANOMALY,
          target_agent: 'Iris',
          anomaly_type: primaryAnom.type,
          merchant: primaryAnom.merchant || null,
          delta: primaryAnom.delta,
          tool_result_id: primaryAnom.tool_result_id,
          note: 'Recurring subscription or spending anomaly for Iris next-month forecast.'
        });
      }
    }

    // Add velocity envelope finding when velocity was called
    let envelopePayload = null;
    if (velProj) {
      envelopePayload = {
        safe_amount: velProj.envelopes.safe_daily_envelope,
        conservative_amount: velProj.envelopes.conservative_daily_envelope,
        days_remaining: velProj.temporal.days_remaining,
        tool_result_id: velProj.tool_result_id
      };

      const headlineVal = confidence === 'high'
        ? velProj.envelopes.safe_daily_envelope
        : velProj.envelopes.conservative_daily_envelope;
      const modeLabel = confidence === 'high' ? 'safe' : 'conservative (margin of safety)';

      findings.push(
        PlaceholderBinder.createGroundedFinding({
          statement_template: `Daily spending envelope (${modeLabel}) is ₹{{headline_envelope}} per day across the remaining {{days_remaining}} days.`,
          bindings: {
            headline_envelope: { value: headlineVal, tool_result_id: velProj.tool_result_id },
            days_remaining: { value: velProj.temporal.days_remaining, tool_result_id: velProj.tool_result_id }
          },
          tool_result_id: velProj.tool_result_id
        })
      );
    }

    const response = SpecialistResponseV1.build({
      status: responseStatus,
      findings,
      category_status_summary: categoryStatusSummary,
      boundary_alerts: boundaryAlerts,
      daily_spending_envelope: envelopePayload,
      constraints,
      proposed_actions: proposedActions,
      peer_hints: peerHints,
      confidence,
      tool_result_ids,
      uncategorized_summary: utilSnap?.uncategorized || undefined
    });

    return {
      ...response,
      meta: {
        task_type: activePacket.task_type,
        snapshot_id: activePacket.snapshot_id,
        categorization_version: activePacket.data_quality?.categorization_version,
        called_tools,
        rerun_on_new_snapshot: rerunOnNewSnapshot,
        injection_sanitized: sanitizedUserMsg.injection_detected || sanitizedMerchant.injection_detected
      }
    };
  }

  static extractAmbiguousCategoryFromText(text = '') {
    const lower = text.toLowerCase();
    for (const term of ['personal', 'lifestyle', 'living']) {
      if (lower.includes(`on ${term}`) || lower.includes(`in ${term}`) || lower === term) {
        return term;
      }
    }
    return null;
  }
}

module.exports = NovaAgent;
