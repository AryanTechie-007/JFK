/**
 * Iris v5.0 — Spending Advisor (`agents/iris`)
 * Stateless forward-looking specialist invoked by John with a `TaskPacket@1`.
 * Produces `SpecialistResponse@1` with `domain: IrisDomain@1` and 100% placeholder-grounded figures.
 * (docs/specifications/iris-spending-advisor-spec.md)
 */

const { validateTaskPacket } = require('../../shared/contracts/validator');
const { createGatewaySession } = require('../../platform/gateway');

const VALID_IRIS_TASKS = new Set([
  'MONTHLY_PLAN',
  'WHAT_IF_PURCHASE',
  'BILL_OUTLOOK',
  'OVERSPEND_DIAGNOSIS',
  'PLAN_REVIEW',
]);

async function invoke(packet, opts = {}) {
  const startMs = Date.now();
  const check = validateTaskPacket(packet);
  if (!check.valid || packet.specialist !== 'IRIS' || !VALID_IRIS_TASKS.has(packet.task_type)) {
    return {
      schema: 'SpecialistResponse@1',
      request_id: packet?.request_id || 'req_invalid',
      task_id: packet?.task_id || 'tsk_invalid',
      trace_id: packet?.trace_id || 'trc_invalid',
      specialist: 'IRIS',
      snapshot_id: packet?.snapshot_id || 'snap_invalid',
      status: 'ERROR',
      confidence: 'LOW',
      headline: { text: 'Invalid task packet for Iris.', evidence_kind: 'CAVEAT', citations: [] },
      findings: [],
      proposals: [],
      questions: [],
      constraints: [],
      data_quality_notes: [],
      peer_hints: [],
      tool_calls_made: [],
      domain: {
        kind: 'IrisDomain@1',
        simulation_tool_result_id: null,
        spending_plan_guide: [],
        proactive_warnings: [],
        actionable_steps: [],
      },
      error: { code: 'INVALID_INPUT', message: check.errors.join('; ') || 'Invalid task_type' },
      latency_ms: Date.now() - startMs,
    };
  }

  const gateway = createGatewaySession({
    caller: 'IRIS',
    snapshot_id: packet.snapshot_id,
    user_id: packet.user_id,
    max_tool_calls: packet.budget?.max_tool_calls || 8,
    allowed_tools: packet.allowed_tools,
  });

  const tp = packet.task_params || {};
  const dq = packet.data_quality || {};
  const riskComfort = packet.context?.preferences?.risk_comfort || 'BALANCED';
  const findings = [];
  const proposals = [];
  const questions = [];
  const constraints = [];
  const dataQualityNotes = [];
  const peerHints = [];
  const spendingPlanGuide = [];
  const proactiveWarnings = [];
  const actionableSteps = [];
  let simulationToolResultId = null;
  let status = 'OK';
  let confidence = 'HIGH';
  let headline = {
    text: 'Spending outlook evaluated.',
    evidence_kind: 'PREDICTION',
    citations: [],
  };

  switch (packet.task_type) {
    case 'MONTHLY_PLAN':
    case 'PLAN_REVIEW': {
      const targetMonth = tp.target_month || packet.context?.current_month_ist || new Date().toISOString().slice(0, 7);
      const baseRes = gateway.call('sentinel_get_surplus_baseline', {});
      const ledRes = gateway.call('sentinel_get_ledger_summary', { timeframe_months: 3 });
      const billRes = gateway.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
      const simRes = gateway.call('sentinel_run_spending_simulation', { target_month: targetMonth });

      const simId = simRes.tool_result_id;
      const billId = billRes.tool_result_id;
      const ledId = ledRes.tool_result_id;
      simulationToolResultId = simId;
      confidence = simRes.confidence;
      constraints.push(
        ...baseRes.constraints_triggered,
        ...ledRes.constraints_triggered,
        ...billRes.constraints_triggered,
        ...simRes.constraints_triggered
      );

      const useConservative = confidence !== 'HIGH' || riskComfort === 'CONSERVATIVE';
      const balField = useConservative
        ? 'conservative_end_balance_signed_minor'
        : 'expected_end_balance_signed_minor';

      headline = {
        text: `For {{${simId}:/data/target_month|month}}, your projected end-of-month balance is {{${simId}:/data/${balField}|inr}} (risk level: ${simRes.data.risk_level}) after {{${simId}:/data/fixed_commitments_minor|inr}} in fixed expenses and {{${simId}:/data/goal_commitments_minor|inr}} in goal commitments.`,
        evidence_kind: 'PREDICTION',
        citations: [simId, billId],
      };

      // Populate spending_plan_guide from simulation category_plan
      const catPlan = simRes.data?.category_plan || [];
      catPlan.slice(0, 8).forEach((line, idx) => {
        spendingPlanGuide.push({
          line: line.category_id,
          suggested_cap_text: {
            text: `{{${simId}:/data/category_plan/${idx}/planned_outflow_minor|inr}}`,
            evidence_kind: 'PREDICTION',
            citations: [simId],
          },
          rationale: {
            text: `Baseline outflow is {{${simId}:/data/category_plan/${idx}/baseline_outflow_minor|inr}} (P80 upper band: {{${simId}:/data/category_plan/${idx}/p80_outflow_minor|inr}}).`,
            evidence_kind: 'ESTIMATE',
            citations: [simId],
          },
          action_ref: null,
        });
      });

      // Data quality check (Iris §B.2 rule 6)
      if ((dq.needs_review_count || 0) > 0 || (dq.uncategorized_amount_minor || 0) > 0) {
        dataQualityNotes.push({
          text: `You have {{status:/needs_review_count|count}} transactions awaiting review and {{status:/uncategorized_amount_minor|inr}} uncategorized.`,
          evidence_kind: 'CAVEAT',
          citations: [ledId],
        });
        if ((dq.uncategorized_amount_minor || 0) > 0) {
          spendingPlanGuide.push({
            line: 'UNCATEGORIZED',
            rationale: {
              text: `Uncategorized spend of {{status:/uncategorized_amount_minor|inr}} is kept separate and never guessed.`,
              evidence_kind: 'CAVEAT',
              citations: [ledId],
            },
            action_ref: null,
          });
        }
        if ((dq.needs_review_count || 0) > 0) {
          actionableSteps.push({
            order: actionableSteps.length + 1,
            finding: {
              text: `Review {{status:/needs_review_count|count}} transactions in the Sentinel workspace to firm up your plan.`,
              evidence_kind: 'RECOMMENDATION',
              citations: [],
            },
            action_ref: null,
            navigation: 'REVIEW_LIST',
          });
        }
      }

      // Emit SAVINGS_CAPACITY hint if unallocated surplus is positive
      if ((simRes.data?.allocation_outcome?.unallocated_signed_minor || 0) > 0) {
        peerHints.push({
          to: 'ATLAS',
          hint_code: 'SAVINGS_CAPACITY',
          summary: `Positive unallocated surplus of {{${simId}:/data/allocation_outcome/unallocated_signed_minor|inr}} available.`,
          refs: { category_id: null, goal_id: null, txn_id: null },
          tool_result_ids: [simId],
        });
      }
      break;
    }

    case 'WHAT_IF_PURCHASE': {
      if (!tp.date) {
        status = 'NEEDS_INPUT';
        headline = {
          text: 'When are you planning to make this purchase?',
          evidence_kind: 'RECOMMENDATION',
          citations: [],
        };
        questions.push({
          question_id: 'q_purchase_date',
          prompt: 'When do you plan to make this purchase?',
          options: [
            { option_id: 'opt_this_week', label: 'This week', value: { date: packet.context?.current_date_ist } },
            { option_id: 'opt_next_month', label: 'Next month', value: { date: 'NEXT_MONTH' } },
          ],
          allow_free_text: true,
        });
        break;
      }

      const targetMonth = String(tp.date).slice(0, 7);
      const simRes = gateway.call('sentinel_run_spending_simulation', {
        target_month: targetMonth,
        one_off_outlays: [
          {
            label: tp.label || 'Planned purchase',
            amount_minor: tp.amount_minor,
            date: tp.date,
          },
        ],
      });
      const simId = simRes.tool_result_id;
      simulationToolResultId = simId;
      confidence = simRes.confidence;
      constraints.push(...simRes.constraints_triggered);

      const riskRes = gateway.call('sentinel_flag_cashflow_risk', { horizon_days: 30 });
      const riskId = riskRes.tool_result_id;
      constraints.push(...riskRes.constraints_triggered);

      const useCons = confidence !== 'HIGH' || riskComfort === 'CONSERVATIVE';
      const balField = useCons
        ? 'conservative_end_balance_signed_minor'
        : 'expected_end_balance_signed_minor';

      headline = {
        text: `With "${tp.label || 'this purchase'}" ({{user:/amount_minor|inr}} on {{user:/date|date}}), your projected end-of-month balance for {{${simId}:/data/target_month|month}} is {{${simId}:/data/${balField}|inr}} (risk level: ${simRes.data.risk_level}).`,
        evidence_kind: 'PREDICTION',
        citations: [simId, riskId],
      };

      if (simRes.data.risk_level !== 'LOW') {
        findings.push({
          text: `Option A (advice only): Moving "${tp.label || 'the purchase'}" to next month or splitting the payment keeps your current month buffer intact.`,
          evidence_kind: 'RECOMMENDATION',
          citations: [simId],
        });

        // Option B: temporary goal override on lowest-priority active goal
        const activeGoals = (packet.context?.goals || []).filter(
          (g) => g.status === 'ACTIVE' && (Number(g.monthly_add_minor) || 0) > 0
        );
        if (activeGoals.length > 0) {
          const lowestGoal = [...activeGoals].sort((a, b) => (b.priority_rank || 2) - (a.priority_rank || 2))[0];
          const valRes = gateway.call('sentinel_validate_goal_change', {
            operation: 'SET_MONTH_OVERRIDE',
            goal_id: lowestGoal.goal_id,
            period: targetMonth,
            monthly_add_minor: 0,
          });
          const valId = valRes.tool_result_id;
          if (valRes.data?.verdict === 'PASS') {
            const actionRef = 'act_ref_temp_goal_override';
            proposals.push({
              action_ref: actionRef,
              action_type: 'SET_GOAL_MONTH_OVERRIDE',
              tier: 'T2',
              target_entity: { type: 'GOAL', id: lowestGoal.goal_id },
              params: {
                goal_id: lowestGoal.goal_id,
                period: targetMonth,
                monthly_add_minor: 0,
              },
              rationale: {
                text: `Temporarily sets "${lowestGoal.name}" monthly contribution to ₹0 for {{${simId}:/data/target_month|month}} to cushion the purchase.`,
                evidence_kind: 'RECOMMENDATION',
                citations: [simId, valId],
              },
              validation_tool_result_id: valId,
              depends_on_action_ref: null,
            });
            actionableSteps.push({
              order: 1,
              finding: {
                text: `Pause "${lowestGoal.name}" for {{${simId}:/data/target_month|month}} only.`,
                evidence_kind: 'RECOMMENDATION',
                citations: [simId, valId],
              },
              action_ref: actionRef,
              navigation: null,
            });
          }
        }
      }
      break;
    }

    case 'BILL_OUTLOOK': {
      const horizonDays = Number(tp.horizon_days) || 30;
      const billRes = gateway.call('sentinel_forecast_bill_outlays', { horizon_days: horizonDays });
      const bId = billRes.tool_result_id;
      const riskRes = gateway.call('sentinel_flag_cashflow_risk', {
        horizon_days: horizonDays,
        outlays: { $ref: `${bId}:/data/outlays` },
      });
      const rId = riskRes.tool_result_id;
      confidence = riskRes.confidence;
      constraints.push(...billRes.constraints_triggered, ...riskRes.constraints_triggered);

      headline = {
        text: `Over the next {{${bId}:/data/horizon_days|days}}, you have {{${bId}:/data/outlay_count|count}} upcoming bills totalling {{${bId}:/data/total_outlays_minor|inr}} (cash-flow risk level: ${riskRes.data.risk_level}; projected lowest balance: {{${rId}:/data/projected_lowest_balance_signed_minor|inr}}).`,
        evidence_kind: 'PREDICTION',
        citations: [bId, rId],
      };

      if (riskRes.data.risk_level !== 'LOW') {
        proactiveWarnings.push({
          finding: {
            text: `Upcoming bills of {{${bId}:/data/total_outlays_minor|inr}} bring your projected balance to {{${rId}:/data/projected_lowest_balance_signed_minor|inr}}.`,
            evidence_kind: 'PREDICTION',
            citations: [bId, rId],
          },
          tool_result_id: rId,
          severity: riskRes.data.risk_level,
        });
      }
      break;
    }

    case 'OVERSPEND_DIAGNOSIS': {
      const catId = tp.category_id || 'FOOD.DINING';
      const ledRes = gateway.call('sentinel_get_ledger_summary', {
        timeframe_months: 6,
        category_scope: [catId],
      });
      const anomRes = gateway.call('sentinel_detect_anomalies', { lookback_days: 90 });
      const simRes = gateway.call('sentinel_run_spending_simulation', {});
      const lId = ledRes.tool_result_id;
      const aId = anomRes.tool_result_id;
      const sId = simRes.tool_result_id;
      simulationToolResultId = sId;
      confidence = ledRes.confidence;
      constraints.push(
        ...ledRes.constraints_triggered,
        ...anomRes.constraints_triggered,
        ...simRes.constraints_triggered
      );

      const catSummary = ledRes.data?.categories?.[0];
      if (!catSummary) {
        headline = {
          text: 'No recent spending history found in that category over the last {{' + lId + ':/data/timeframe_months|months}}.',
          evidence_kind: 'FACT',
          citations: [lId],
        };
        break;
      }

      headline = {
        text: `In ${catSummary.display_name}, your average monthly spend over the last {{${lId}:/data/timeframe_months|months}} is {{${lId}:/data/categories/0/monthly_avg_minor|inr}} (total {{${lId}:/data/categories/0/total_spend_minor|inr}} across {{${lId}:/data/categories/0/txn_count|count}} transactions).`,
        evidence_kind: 'FACT',
        citations: [lId, aId, sId],
      };

      // Only propose a standing cap if no GOAL_COMMITMENT_CONFLICT (Iris §B.2 rule 5)
      const hasConflict = simRes.constraints_triggered.some(
        (c) => c.code === 'GOAL_COMMITMENT_CONFLICT'
      );
      const planIdx = (simRes.data?.category_plan || []).findIndex((p) => p.category_id === catId);
      if (!hasConflict && planIdx >= 0) {
        const suggestedCapMinor = simRes.data.category_plan[planIdx].p80_outflow_minor;
        const valRes = gateway.call('sentinel_validate_cap_change', {
          category_id: catId,
          new_cap_minor: suggestedCapMinor,
          scope: 'STANDING',
        });
        const vId = valRes.tool_result_id;
        if (valRes.data?.verdict === 'PASS' && !valRes.constraints_triggered.some((c) => c.code === 'GOAL_COMMITMENT_CONFLICT')) {
          const actionRef = 'act_ref_standing_cap_fix';
          proposals.push({
            action_ref: actionRef,
            action_type: 'ADJUST_BUDGET_CAP',
            tier: 'T2',
            target_entity: { type: 'CAP', id: catId },
            params: {
              category_id: catId,
              new_cap_minor: suggestedCapMinor,
              scope: 'STANDING',
            },
            rationale: {
              text: `Aligns your standing ${catSummary.display_name} cap with your P80 historical spend of {{${sId}:/data/category_plan/${planIdx}/p80_outflow_minor|inr}}.`,
              evidence_kind: 'RECOMMENDATION',
              citations: [lId, sId, vId],
            },
            validation_tool_result_id: vId,
            depends_on_action_ref: null,
          });
        }
      }
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
    specialist: 'IRIS',
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
      kind: 'IrisDomain@1',
      simulation_tool_result_id: simulationToolResultId,
      spending_plan_guide: spendingPlanGuide,
      proactive_warnings: proactiveWarnings,
      actionable_steps: actionableSteps,
    },
    error: null,
    latency_ms: Date.now() - startMs,
    _tool_results: gateway.resultsById,
  };
}

module.exports = {
  invoke,
  VALID_IRIS_TASKS,
};
