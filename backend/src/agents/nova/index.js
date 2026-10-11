/**
 * Nova v5.0 — Budget Guardian (`agents/nova`)
 * Stateless specialist invoked by John with a `TaskPacket@1`.
 * Produces `SpecialistResponse@1` with `domain: NovaDomain@1` and 100% placeholder-grounded figures.
 * (docs/specifications/nova-budget-guardian-spec.md)
 */

const { validateTaskPacket } = require('../../shared/contracts/validator');
const { createGatewaySession } = require('../../platform/gateway');

const VALID_NOVA_TASKS = new Set([
  'CAP_STATUS',
  'EXPLAIN_CAP_ALERT',
  'EXPLAIN_ANOMALY_ALERT',
  'PROPOSE_REBALANCE',
  'EVALUATE_CAP_CHANGE',
  'SET_WATCH',
  'DISMISS_ALERT',
]);

async function invoke(packet, opts = {}) {
  const startMs = Date.now();
  const check = validateTaskPacket(packet);
  if (!check.valid || packet.specialist !== 'NOVA' || !VALID_NOVA_TASKS.has(packet.task_type)) {
    return {
      schema: 'SpecialistResponse@1',
      request_id: packet?.request_id || 'req_invalid',
      task_id: packet?.task_id || 'tsk_invalid',
      trace_id: packet?.trace_id || 'trc_invalid',
      specialist: 'NOVA',
      snapshot_id: packet?.snapshot_id || 'snap_invalid',
      status: 'ERROR',
      confidence: 'LOW',
      headline: { text: 'Invalid task packet for Nova.', evidence_kind: 'CAVEAT', citations: [] },
      findings: [],
      proposals: [],
      questions: [],
      constraints: [],
      data_quality_notes: [],
      peer_hints: [],
      tool_calls_made: [],
      domain: { kind: 'NovaDomain@1', category_statuses: [], rebalance_plan: null, alert_context: null },
      error: { code: 'INVALID_INPUT', message: check.errors.join('; ') || 'Invalid task_type' },
      latency_ms: Date.now() - startMs,
    };
  }

  const gateway = createGatewaySession({
    caller: 'NOVA',
    snapshot_id: packet.snapshot_id,
    user_id: packet.user_id,
    max_tool_calls: packet.budget?.max_tool_calls || 6,
    allowed_tools: packet.allowed_tools,
  });

  const tp = packet.task_params || {};
  const findings = [];
  const proposals = [];
  const questions = [];
  const constraints = [];
  const dataQualityNotes = [];
  const peerHints = [];
  const categoryStatuses = [];
  let rebalancePlan = null;
  let alertContext = null;
  let status = 'OK';
  let confidence = 'HIGH';
  let headline = {
    text: 'Budget caps evaluated.',
    evidence_kind: 'FACT',
    citations: [],
  };

  switch (packet.task_type) {
    case 'CAP_STATUS': {
      const utilRes = gateway.call('sentinel_run_category_utilization', {
        period: tp.period || undefined,
        category_id: tp.category_id || undefined,
      });
      const velRes = gateway.call('sentinel_run_velocity_projection', {
        period: tp.period || undefined,
        category_id: tp.category_id || undefined,
      });
      const uId = utilRes.tool_result_id;
      const vId = velRes.tool_result_id;
      confidence = utilRes.confidence;
      constraints.push(...utilRes.constraints_triggered, ...velRes.constraints_triggered);

      const cats = utilRes.data?.categories || [];
      cats.forEach((c, idx) => {
        categoryStatuses.push({
          category_id: c.category_id,
          utilization_tool_result_id: uId,
          velocity_tool_result_id: vId,
          tier: c.tier,
        });
        if (c.recurring_overspend) {
          peerHints.push({
            to: 'IRIS',
            hint_code: 'RECURRING_ANOMALY',
            summary: `${c.display_name} has breached its cap repeatedly in recent months.`,
            refs: { category_id: c.category_id, goal_id: null, txn_id: null },
            tool_result_ids: [uId],
          });
        }
      });

      if (cats.length === 0) {
        headline = {
          text: 'No category budget caps are configured yet. Set a monthly cap in the Nova workspace to track real-time pacing.',
          evidence_kind: 'CAVEAT',
          citations: [uId],
        };
      } else {
        const topCat = cats.find((c) => c.tier !== 'NORMAL') || cats[0];
        const idx = cats.indexOf(topCat);
        headline = {
          text: `${topCat.display_name} is at {{${uId}:/data/categories/${idx}/utilization_bp|bp_pct}} of its {{${uId}:/data/categories/${idx}/cap_minor|inr}} cap ({{${uId}:/data/categories/${idx}/total_spend_minor|inr}} spent; safe daily allowance {{${uId}:/data/categories/${idx}/safe_daily_minor|inr}}).`,
          evidence_kind: 'FACT',
          citations: [uId, vId],
        };

        if (topCat.provisional_spend_minor > 0) {
          findings.push({
            text: `Includes {{${uId}:/data/categories/${idx}/provisional_spend_minor|inr}} in provisional transactions awaiting confirmation.`,
            evidence_kind: 'CAVEAT',
            citations: [uId],
          });
        }
      }
      break;
    }

    case 'EXPLAIN_CAP_ALERT':
    case 'PROPOSE_REBALANCE': {
      const catId = tp.category_id || tp.alert?.category_id;
      const utilRes = gateway.call('sentinel_run_category_utilization', {
        category_id: catId,
      });
      const uId = utilRes.tool_result_id;
      confidence = utilRes.confidence;
      constraints.push(...utilRes.constraints_triggered);

      const catRow = utilRes.data?.categories?.[0];
      if (!catRow) {
        headline = {
          text: 'No active cap found for that category.',
          evidence_kind: 'CAVEAT',
          citations: [uId],
        };
        break;
      }

      categoryStatuses.push({
        category_id: catRow.category_id,
        utilization_tool_result_id: uId,
        velocity_tool_result_id: null,
        tier: catRow.tier,
      });

      const rebRes = gateway.call('sentinel_run_rebalance_simulation', {
        target_category_id: catRow.category_id,
      });
      const rId = rebRes.tool_result_id;
      constraints.push(...rebRes.constraints_triggered);

      if (rebRes.status === 'OK' && rebRes.data?.transfers?.length > 0) {
        const actionRef = 'act_ref_rebalance';
        proposals.push({
          action_ref: actionRef,
          action_type: 'APPLY_REBALANCE',
          tier: 'T2',
          target_entity: { type: 'CAP', id: catRow.category_id },
          params: {
            period: rebRes.data.period,
            transfers: rebRes.data.transfers.map((t) => ({
              from_category_id: t.from_category_id,
              to_category_id: t.to_category_id,
              amount_minor: t.amount_minor,
            })),
          },
          rationale: {
            text: `Rebalances {{${rId}:/data/covered_minor|inr}} from under-spent discretionary categories to cover ${catRow.display_name} for this month.`,
            evidence_kind: 'RECOMMENDATION',
            citations: [uId, rId],
          },
          validation_tool_result_id: rId,
          depends_on_action_ref: null,
        });

        rebalancePlan = {
          rebalance_tool_result_id: rId,
          action_ref: actionRef,
        };

        headline = {
          text: `${catRow.display_name} is at {{${uId}:/data/categories/0/utilization_bp|bp_pct}} ({{${uId}:/data/categories/0/total_spend_minor|inr}} of {{${uId}:/data/categories/0/cap_minor|inr}}). You can cover {{${rId}:/data/covered_minor|inr}} by rebalancing from under-spent categories this month.`,
          evidence_kind: 'CALCULATION',
          citations: [uId, rId],
        };
      } else {
        // No eligible donor -> emit GOAL_FUNDING_PRESSURE for Atlas (Nova §A.3 #4)
        peerHints.push({
          to: 'ATLAS',
          hint_code: 'GOAL_FUNDING_PRESSURE',
          summary: `No eligible discretionary donor to cover ${catRow.display_name} breach.`,
          refs: { category_id: catRow.category_id, goal_id: null, txn_id: null },
          tool_result_ids: [uId, rId],
        });

        headline = {
          text: `${catRow.display_name} is at {{${uId}:/data/categories/0/utilization_bp|bp_pct}} ({{${uId}:/data/categories/0/total_spend_minor|inr}} of {{${uId}:/data/categories/0/cap_minor|inr}}), and no discretionary donor category has sufficient headroom to rebalance.`,
          evidence_kind: 'FACT',
          citations: [uId, rId],
        };
      }

      if (tp.alert_id) {
        alertContext = { alert_id: tp.alert_id, kind: 'CAP_TIER' };
      }
      break;
    }

    case 'EXPLAIN_ANOMALY_ALERT': {
      const anomRes = gateway.call('sentinel_detect_anomalies', { lookback_days: 90 });
      const aId = anomRes.tool_result_id;
      confidence = anomRes.confidence;
      constraints.push(...anomRes.constraints_triggered);

      const first = anomRes.data?.anomalies?.[0];
      if (!first) {
        headline = {
          text: 'No unusual spending spikes were detected in the last {{' + aId + ':/data/lookback_days|days}}.',
          evidence_kind: 'FACT',
          citations: [aId],
        };
      } else {
        headline = {
          text: `Detected an unusual spend of {{${aId}:/data/anomalies/0/amount_minor|inr}} at ${first.merchant_display_name} (${first.display_name}), which is {{${aId}:/data/anomalies/0/excess_minor|inr}} above your typical {{${aId}:/data/anomalies/0/baseline_median_minor|inr}} transaction in that category.`,
          evidence_kind: 'FACT',
          citations: [aId],
        };
      }
      break;
    }

    case 'EVALUATE_CAP_CHANGE': {
      const scope = tp.scope || 'STANDING';
      const valRes = gateway.call('sentinel_validate_cap_change', {
        category_id: tp.category_id,
        new_cap_minor: tp.new_cap_minor,
        scope,
        period: tp.period || undefined,
      });
      const valId = valRes.tool_result_id;
      constraints.push(...valRes.constraints_triggered);

      if (valRes.data?.verdict !== 'PASS') {
        status = 'REJECTED';
        headline = {
          text: `Cannot set cap to {{user:/new_cap_minor|inr}} because the minimum floor for this category is {{${valId}:/data/floor_minor|inr}}.`,
          evidence_kind: 'FACT',
          citations: [valId],
        };
        break;
      }

      proposals.push({
        action_ref: 'act_ref_adjust_cap',
        action_type: 'ADJUST_BUDGET_CAP',
        tier: 'T2',
        target_entity: { type: 'CAP', id: tp.category_id },
        params: {
          category_id: tp.category_id,
          new_cap_minor: tp.new_cap_minor,
          scope,
          period: valRes.data.period,
        },
        rationale: {
          text: `Updates budget cap to {{user:/new_cap_minor|inr}} (${scope === 'MONTH' ? 'for this month only' : 'standing monthly cap'}).`,
          evidence_kind: 'RECOMMENDATION',
          citations: [valId],
        },
        validation_tool_result_id: valId,
        depends_on_action_ref: null,
      });

      headline = {
        text: `Your ${scope === 'MONTH' ? 'this-month' : 'standing'} cap change to {{user:/new_cap_minor|inr}} passed validation and is ready to confirm.`,
        evidence_kind: 'FACT',
        citations: [valId],
      };
      break;
    }

    case 'SET_WATCH': {
      const utilRes = gateway.call('sentinel_run_category_utilization', {
        category_id: tp.category_id,
      });
      const uId = utilRes.tool_result_id;
      proposals.push({
        action_ref: 'act_ref_set_watch',
        action_type: 'SET_CATEGORY_WATCH',
        tier: 'T1',
        target_entity: { type: 'CAP', id: tp.category_id },
        params: { category_id: tp.category_id, watching: Boolean(tp.watching ?? true) },
        rationale: {
          text: 'Enables watch notifications on this category.',
          evidence_kind: 'RECOMMENDATION',
          citations: [uId],
        },
        validation_tool_result_id: null,
        depends_on_action_ref: null,
      });
      headline = {
        text: 'Tap the chip below to update category watch status.',
        evidence_kind: 'RECOMMENDATION',
        citations: [uId],
      };
      break;
    }

    case 'DISMISS_ALERT': {
      proposals.push({
        action_ref: 'act_ref_dismiss_alert',
        action_type: 'DISMISS_ALERT',
        tier: 'T1',
        target_entity: { type: 'ALERT', id: tp.alert_id },
        params: { alert_id: tp.alert_id },
        rationale: {
          text: 'Dismisses the alert and snoozes repeats during cooldown.',
          evidence_kind: 'RECOMMENDATION',
          citations: [],
        },
        validation_tool_result_id: null,
        depends_on_action_ref: null,
      });
      headline = {
        text: 'Tap below to dismiss this alert.',
        evidence_kind: 'RECOMMENDATION',
        citations: [],
      };
      break;
    }

    default:
      break;
  }

  return {
    schema: 'SpecialistResponse@1',
    request_id: packet.request_id,
    task_id: packet.task_id,
    trace_id: packet.trace_id,
    specialist: 'NOVA',
    snapshot_id: packet.snapshot_id,
    status,
    confidence,
    headline,
    findings,
    proposals,
    questions,
    constraints,
    data_quality_notes: dataQualityNotes,
    peer_hints: peerHints,
    tool_calls_made: gateway.callLog.map((c) => ({
      tool_result_id: c.tool_result_id,
      function_name: c.function_name,
    })),
    domain: {
      kind: 'NovaDomain@1',
      category_statuses: categoryStatuses,
      rebalance_plan: rebalancePlan,
      alert_context: alertContext,
    },
    error: null,
    latency_ms: Date.now() - startMs,
    _tool_results: gateway.resultsById,
  };
}

module.exports = {
  invoke,
  VALID_NOVA_TASKS,
};
