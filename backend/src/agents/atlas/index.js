/**
 * Atlas v5.0 — Savings Strategist (`agents/atlas`)
 * Stateless specialist invoked by John with a `TaskPacket@1`.
 * Produces `SpecialistResponse@1` with `domain: AtlasDomain@1` and 100% placeholder-grounded figures.
 * (docs/specifications/atlas-savings-strategist-spec.md)
 */

const { validateTaskPacket } = require('../../shared/contracts/validator');
const { createGatewaySession } = require('../../platform/gateway');

const VALID_ATLAS_TASKS = new Set([
  'GOAL_PROGRESS',
  'CREATE_GOAL',
  'UPDATE_GOAL',
  'SET_GOAL_STATUS',
  'EVALUATE_FUND_ADDITION',
  'EVALUATE_FUND_RELEASE',
  'DELETE_GOAL',
  'GOAL_PLAN_REVIEW',
  'HANDLE_PEER_FINDING',
  'SIP_PROJECTION',
]);

async function invoke(packet, opts = {}) {
  const startMs = Date.now();
  const check = validateTaskPacket(packet);
  if (!check.valid || packet.specialist !== 'ATLAS' || !VALID_ATLAS_TASKS.has(packet.task_type)) {
    return {
      schema: 'SpecialistResponse@1',
      request_id: packet?.request_id || 'req_invalid',
      task_id: packet?.task_id || 'tsk_invalid',
      trace_id: packet?.trace_id || 'trc_invalid',
      specialist: 'ATLAS',
      snapshot_id: packet?.snapshot_id || 'snap_invalid',
      status: 'ERROR',
      confidence: 'LOW',
      headline: { text: 'Invalid task packet for Atlas.', evidence_kind: 'CAVEAT', citations: [] },
      findings: [],
      proposals: [],
      questions: [],
      constraints: [],
      data_quality_notes: [],
      peer_hints: [],
      tool_calls_made: [],
      domain: { kind: 'AtlasDomain@1', goal_cards: [], plan_recommendation: null, sip_projection_tool_result_id: null },
      error: { code: 'INVALID_INPUT', message: check.errors.join('; ') || 'Invalid task_type' },
      latency_ms: Date.now() - startMs,
    };
  }

  const gateway = createGatewaySession({
    caller: 'ATLAS',
    snapshot_id: packet.snapshot_id,
    user_id: packet.user_id,
    max_tool_calls: packet.budget?.max_tool_calls || 8,
    allowed_tools: packet.allowed_tools,
  });

  const tp = packet.task_params || {};
  const riskComfort = packet.context?.preferences?.risk_comfort || 'BALANCED';
  const findings = [];
  const proposals = [];
  const questions = [];
  const constraints = [];
  const dataQualityNotes = [];
  const peerHints = [];
  const goalCards = [];
  let planRecommendation = null;
  let sipToolResultId = null;
  let status = 'OK';
  let confidence = 'HIGH';
  let headline = {
    text: 'Goal strategy evaluated.',
    evidence_kind: 'FACT',
    citations: [],
  };

  // Ambiguous goal reference -> NEEDS_INPUT (Atlas §B.3)
  if (Array.isArray(tp.candidate_goal_ids) && tp.candidate_goal_ids.length >= 2) {
    const goalsList = packet.context?.goals || [];
    return {
      schema: 'SpecialistResponse@1',
      request_id: packet.request_id,
      task_id: packet.task_id,
      trace_id: packet.trace_id,
      specialist: 'ATLAS',
      snapshot_id: packet.snapshot_id,
      status: 'NEEDS_INPUT',
      confidence: 'HIGH',
      headline: {
        text: 'Which savings goal would you like to work on?',
        evidence_kind: 'RECOMMENDATION',
        citations: [],
      },
      findings: [],
      proposals: [],
      questions: [
        {
          question_id: 'q_select_goal',
          prompt: 'Please select which goal you meant:',
          options: tp.candidate_goal_ids.slice(0, 5).map((gid) => {
            const g = goalsList.find((x) => x.goal_id === gid);
            return {
              option_id: `opt_${gid}`,
              label: g ? g.name : gid,
              value: { goal_id: gid },
            };
          }),
          allow_free_text: false,
        },
      ],
      constraints: [],
      data_quality_notes: [],
      peer_hints: [],
      tool_calls_made: [],
      domain: { kind: 'AtlasDomain@1', goal_cards: [], plan_recommendation: null, sip_projection_tool_result_id: null },
      error: null,
      latency_ms: Date.now() - startMs,
    };
  }

  switch (packet.task_type) {
    case 'GOAL_PROGRESS': {
      const prog = gateway.call('sentinel_run_goal_progress', { goal_id: tp.goal_id });
      if (prog.status === 'ERROR') {
        status = 'ERROR';
        break;
      }
      const trsId = prog.tool_result_id;
      confidence = prog.confidence;
      constraints.push(...prog.constraints_triggered);
      goalCards.push({
        goal_id: tp.goal_id,
        progress_tool_result_id: trsId,
        priority_tier: prog.data.priority_tier,
      });

      const useConservativeDate = confidence !== 'HIGH' || riskComfort === 'CONSERVATIVE';
      const dateField = useConservativeDate ? 'conservative_date' : 'projected_date';
      if (prog.data[dateField]) {
        headline = {
          text: `${prog.data.name} is at {{${trsId}:/data/progress_bp|bp_pct}} ({{${trsId}:/data/saved_minor|inr}} of {{${trsId}:/data/target_minor|inr}}), projected to reach target by {{${trsId}:/data/${dateField}|date}}.`,
          evidence_kind: 'PREDICTION',
          citations: [trsId],
        };
      } else {
        headline = {
          text: `${prog.data.name} has {{${trsId}:/data/saved_minor|inr}} saved toward {{${trsId}:/data/target_minor|inr}} ({{${trsId}:/data/progress_bp|bp_pct}}).`,
          evidence_kind: 'FACT',
          citations: [trsId],
        };
        findings.push({
          text: 'Set a positive monthly contribution to project a target completion date.',
          evidence_kind: 'CAVEAT',
          citations: [trsId],
        });
      }
      break;
    }

    case 'CREATE_GOAL': {
      const valParams = {
        operation: 'CREATE',
        name: tp.name,
        target_minor: tp.target_minor,
        monthly_add_minor: tp.monthly_add_minor,
        deadline: tp.deadline || null,
        priority_tier: tp.priority_tier || 'MEDIUM',
      };
      const valRes = gateway.call('sentinel_validate_goal_change', valParams);
      const valId = valRes.tool_result_id;
      constraints.push(...valRes.constraints_triggered);

      if (valRes.data?.verdict !== 'PASS') {
        status = 'REJECTED';
        headline = {
          text: `Could not create goal "${tp.name}" due to validation rules.`,
          evidence_kind: 'FACT',
          citations: [valId],
        };
        break;
      }

      const feasRes = gateway.call('sentinel_run_goal_feasibility', {
        goal_id: null,
        proposed_monthly_add_minor: tp.monthly_add_minor,
        target_minor: tp.target_minor,
        deadline: tp.deadline || null,
      });
      const feasId = feasRes.tool_result_id;
      confidence = feasRes.confidence;
      constraints.push(...feasRes.constraints_triggered);

      if (feasRes.data.verdict === 'SHORTFALL') {
        status = 'REJECTED';
        headline = {
          text: `A monthly contribution of {{user:/monthly_add_minor|inr}} for "${tp.name}" exceeds your available monthly surplus of {{${feasId}:/data/available_surplus_minor|inr}}.`,
          evidence_kind: 'CALCULATION',
          citations: [feasId],
        };
        findings.push({
          text: `Consider starting "${tp.name}" with {{${feasId}:/data/available_surplus_minor|inr}} per month or pausing a lower-priority goal.`,
          evidence_kind: 'RECOMMENDATION',
          citations: [feasId],
        });
      } else {
        const actionRef = 'act_ref_create_goal';
        proposals.push({
          action_ref: actionRef,
          action_type: 'CREATE_GOAL',
          tier: 'T2',
          target_entity: { type: 'GOAL', id: null },
          params: {
            name: tp.name,
            target_minor: tp.target_minor,
            monthly_add_minor: tp.monthly_add_minor,
            deadline: tp.deadline || null,
            priority_tier: tp.priority_tier || 'MEDIUM',
          },
          rationale: {
            text: `Creates "${tp.name}" with target {{user:/target_minor|inr}} and monthly contribution {{user:/monthly_add_minor|inr}}, leaving {{${feasId}:/data/headroom_vs_surplus_signed_minor|inr}} in monthly surplus.`,
            evidence_kind: 'RECOMMENDATION',
            citations: [valId, feasId],
          },
          validation_tool_result_id: valId,
          depends_on_action_ref: null,
        });

        headline = {
          text: `"${tp.name}" ({{user:/target_minor|inr}} target, {{user:/monthly_add_minor|inr}} per month) is feasible and ready for your confirmation.`,
          evidence_kind: 'CALCULATION',
          citations: [valId, feasId],
        };

        if (tp.monthly_add_minor > 0) {
          peerHints.push({
            to: 'IRIS',
            hint_code: 'GOAL_COMMITMENT',
            summary: `New goal commitment of {{user:/monthly_add_minor|inr}} per month proposed.`,
            refs: { category_id: null, goal_id: null, txn_id: null },
            tool_result_ids: [feasId],
          });
        }
      }
      break;
    }

    case 'UPDATE_GOAL': {
      const valParams = {
        operation: 'UPDATE',
        goal_id: tp.goal_id,
        ...(tp.name !== undefined ? { name: tp.name } : {}),
        ...(tp.target_minor !== undefined ? { target_minor: tp.target_minor } : {}),
        ...(tp.monthly_add_minor !== undefined ? { monthly_add_minor: tp.monthly_add_minor } : {}),
        ...(tp.deadline !== undefined ? { deadline: tp.deadline } : {}),
        ...(tp.priority_tier !== undefined ? { priority_tier: tp.priority_tier } : {}),
      };
      const valRes = gateway.call('sentinel_validate_goal_change', valParams);
      const valId = valRes.tool_result_id;
      constraints.push(...valRes.constraints_triggered);

      if (valRes.data?.verdict !== 'PASS') {
        status = 'REJECTED';
        headline = {
          text: 'The requested goal update did not pass validation.',
          evidence_kind: 'FACT',
          citations: [valId],
        };
        break;
      }

      let feasId = null;
      if (tp.monthly_add_minor !== undefined) {
        const feasRes = gateway.call('sentinel_run_goal_feasibility', {
          goal_id: tp.goal_id,
          proposed_monthly_add_minor: tp.monthly_add_minor,
        });
        feasId = feasRes.tool_result_id;
        constraints.push(...feasRes.constraints_triggered);
        if (feasRes.data.verdict === 'SHORTFALL') {
          status = 'REJECTED';
          headline = {
            text: `Raising this goal's monthly contribution to {{user:/monthly_add_minor|inr}} exceeds your available surplus of {{${feasId}:/data/available_surplus_minor|inr}}.`,
            evidence_kind: 'CALCULATION',
            citations: [feasId],
          };
          break;
        }
      }

      const progRes = gateway.call('sentinel_run_goal_progress', { goal_id: tp.goal_id });
      const progId = progRes.tool_result_id;
      goalCards.push({
        goal_id: tp.goal_id,
        progress_tool_result_id: progId,
        priority_tier: progRes.data.priority_tier,
      });

      const proposalParams = { ...valParams };
      delete proposalParams.operation;

      proposals.push({
        action_ref: 'act_ref_update_goal',
        action_type: 'UPDATE_GOAL',
        tier: 'T2',
        target_entity: { type: 'GOAL', id: tp.goal_id },
        params: proposalParams,
        rationale: {
          text: `Updates "${progRes.data.name}" after passing validation.`,
          evidence_kind: 'RECOMMENDATION',
          citations: feasId ? [valId, feasId, progId] : [valId, progId],
        },
        validation_tool_result_id: valId,
        depends_on_action_ref: null,
      });

      headline = {
        text: `Your update to "${progRes.data.name}" is validated and ready to confirm.`,
        evidence_kind: 'FACT',
        citations: [valId, progId],
      };
      break;
    }

    case 'SET_GOAL_STATUS': {
      const valRes = gateway.call('sentinel_validate_goal_change', {
        operation: 'SET_STATUS',
        goal_id: tp.goal_id,
        status: tp.status,
      });
      const valId = valRes.tool_result_id;
      constraints.push(...valRes.constraints_triggered);

      if (valRes.data?.verdict !== 'PASS') {
        status = 'REJECTED';
        headline = {
          text: 'Cannot change goal status due to state transition rules.',
          evidence_kind: 'FACT',
          citations: [valId],
        };
        break;
      }

      const progRes = gateway.call('sentinel_run_goal_progress', { goal_id: tp.goal_id });
      const progId = progRes.tool_result_id;
      goalCards.push({
        goal_id: tp.goal_id,
        progress_tool_result_id: progId,
        priority_tier: progRes.data.priority_tier,
      });

      proposals.push({
        action_ref: 'act_ref_goal_status',
        action_type: 'SET_GOAL_STATUS',
        tier: 'T2',
        target_entity: { type: 'GOAL', id: tp.goal_id },
        params: { goal_id: tp.goal_id, status: tp.status },
        rationale: {
          text: `Sets "${progRes.data.name}" status to ${tp.status}.`,
          evidence_kind: 'RECOMMENDATION',
          citations: [valId, progId],
        },
        validation_tool_result_id: valId,
        depends_on_action_ref: null,
      });

      headline = {
        text: `Ready to set "${progRes.data.name}" to ${tp.status}.`,
        evidence_kind: 'FACT',
        citations: [valId, progId],
      };
      break;
    }

    case 'EVALUATE_FUND_ADDITION': {
      const valRes = gateway.call('sentinel_validate_goal_change', {
        operation: 'ADD_FUNDS',
        goal_id: tp.goal_id,
        amount_minor: tp.amount_minor,
      });
      const valId = valRes.tool_result_id;
      constraints.push(...valRes.constraints_triggered);

      const balRes = gateway.call('sentinel_check_available_balance', {
        amount_minor: tp.amount_minor,
      });
      const balId = balRes.tool_result_id;
      constraints.push(...balRes.constraints_triggered);

      const progRes = gateway.call('sentinel_run_goal_progress', { goal_id: tp.goal_id });
      const progId = progRes.tool_result_id;
      goalCards.push({
        goal_id: tp.goal_id,
        progress_tool_result_id: progId,
        priority_tier: progRes.data?.priority_tier || 'MEDIUM',
      });

      if (valRes.data?.verdict !== 'PASS' || balRes.data?.verdict !== 'OK') {
        status = 'REJECTED';
        headline = {
          text: `Cannot earmark {{user:/amount_minor|inr}} because available un-earmarked balance is {{${balId}:/data/available_minor|inr}}.`,
          evidence_kind: 'FACT',
          citations: [valId, balId],
        };
        break;
      }

      proposals.push({
        action_ref: 'act_ref_add_funds',
        action_type: 'ADD_FUNDS',
        tier: 'T2',
        target_entity: { type: 'GOAL', id: tp.goal_id },
        params: { goal_id: tp.goal_id, amount_minor: tp.amount_minor },
        rationale: {
          text: `Adds {{user:/amount_minor|inr}} to "${progRes.data.name}" (available liquid balance: {{${balId}:/data/available_minor|inr}}).`,
          evidence_kind: 'RECOMMENDATION',
          citations: [valId, balId, progId],
        },
        validation_tool_result_id: valId,
        depends_on_action_ref: null,
      });

      headline = {
        text: `Ready to add {{user:/amount_minor|inr}} to "${progRes.data.name}".`,
        evidence_kind: 'FACT',
        citations: [valId, balId, progId],
      };
      break;
    }

    case 'EVALUATE_FUND_RELEASE': {
      const valRes = gateway.call('sentinel_validate_goal_change', {
        operation: 'RELEASE_FUNDS',
        goal_id: tp.goal_id,
        amount_minor: tp.amount_minor,
      });
      const valId = valRes.tool_result_id;
      constraints.push(...valRes.constraints_triggered);

      const progRes = gateway.call('sentinel_run_goal_progress', { goal_id: tp.goal_id });
      const progId = progRes.tool_result_id;
      goalCards.push({
        goal_id: tp.goal_id,
        progress_tool_result_id: progId,
        priority_tier: progRes.data?.priority_tier || 'MEDIUM',
      });

      if (valRes.data?.verdict !== 'PASS') {
        status = 'REJECTED';
        headline = {
          text: `Cannot release {{user:/amount_minor|inr}} because "${progRes.data?.name || 'this goal'}" only has {{${progId}:/data/saved_minor|inr}} earmarked.`,
          evidence_kind: 'FACT',
          citations: [valId, progId],
        };
        break;
      }

      proposals.push({
        action_ref: 'act_ref_release_funds',
        action_type: 'RELEASE_FUNDS',
        tier: 'T2',
        target_entity: { type: 'GOAL', id: tp.goal_id },
        params: { goal_id: tp.goal_id, amount_minor: tp.amount_minor },
        rationale: {
          text: `Releases {{user:/amount_minor|inr}} from "${progRes.data.name}" back to un-earmarked available balance.`,
          evidence_kind: 'RECOMMENDATION',
          citations: [valId, progId],
        },
        validation_tool_result_id: valId,
        depends_on_action_ref: null,
      });

      headline = {
        text: `Ready to release {{user:/amount_minor|inr}} from "${progRes.data.name}".`,
        evidence_kind: 'FACT',
        citations: [valId, progId],
      };
      break;
    }

    case 'DELETE_GOAL': {
      const progRes = gateway.call('sentinel_run_goal_progress', { goal_id: tp.goal_id });
      const progId = progRes.tool_result_id;
      goalCards.push({
        goal_id: tp.goal_id,
        progress_tool_result_id: progId,
        priority_tier: progRes.data?.priority_tier || 'MEDIUM',
      });

      if (!tp.explicit) {
        status = 'NEEDS_INPUT';
        headline = {
          text: `Do you want to delete "${progRes.data?.name || 'this goal'}" or pause it instead?`,
          evidence_kind: 'RECOMMENDATION',
          citations: [progId],
        };
        questions.push({
          question_id: 'q_confirm_delete_goal',
          prompt: `Do you want to delete "${progRes.data?.name || 'this goal'}"?`,
          options: [
            { option_id: 'opt_delete', label: 'Delete goal', value: { action: 'DELETE', goal_id: tp.goal_id, explicit: true } },
            { option_id: 'opt_pause', label: 'Pause instead', value: { action: 'PAUSE', goal_id: tp.goal_id } },
            { option_id: 'opt_keep', label: 'Keep as is', value: { action: 'KEEP', goal_id: tp.goal_id } },
          ],
          allow_free_text: false,
        });
        break;
      }

      proposals.push({
        action_ref: 'act_ref_delete_goal',
        action_type: 'DELETE_GOAL',
        tier: 'T3',
        target_entity: { type: 'GOAL', id: tp.goal_id },
        params: { goal_id: tp.goal_id },
        rationale: {
          text: `Archives "${progRes.data.name}" and releases its earmarked balance of {{${progId}:/data/saved_minor|inr}}.`,
          evidence_kind: 'RECOMMENDATION',
          citations: [progId],
        },
        validation_tool_result_id: null,
        depends_on_action_ref: null,
      });

      headline = {
        text: `Deleting "${progRes.data.name}" will release {{${progId}:/data/saved_minor|inr}} of earmarked savings. Confirm below if you want to proceed.`,
        evidence_kind: 'FACT',
        citations: [progId],
      };
      break;
    }

    case 'GOAL_PLAN_REVIEW': {
      const baseRes = gateway.call('sentinel_get_surplus_baseline', {});
      const feasRes = gateway.call('sentinel_run_goal_feasibility', {
        goal_id: null,
        proposed_monthly_add_minor: 0,
      });
      const baseId = baseRes.tool_result_id;
      const feasId = feasRes.tool_result_id;
      confidence = feasRes.confidence;
      constraints.push(...baseRes.constraints_triggered, ...feasRes.constraints_triggered);

      const activeGoals = (packet.context?.goals || []).filter((g) => g.status === 'ACTIVE');
      for (const g of activeGoals.slice(0, 5)) {
        const pRes = gateway.call('sentinel_run_goal_progress', { goal_id: g.goal_id });
        if (pRes.status === 'OK') {
          goalCards.push({
            goal_id: g.goal_id,
            progress_tool_result_id: pRes.tool_result_id,
            priority_tier: pRes.data.priority_tier,
          });
        }
      }

      const useCons = confidence !== 'HIGH' || riskComfort === 'CONSERVATIVE';
      const surpField = useCons ? 'conservative_surplus_signed_minor' : 'expected_surplus_signed_minor';

      headline = {
        text: `Your active goals commit {{${baseId}:/data/goal_commitments_minor|inr}} per month out of {{${baseId}:/data/income_minor|inr}} income, leaving {{${baseId}:/data/${surpField}|inr}} in unassigned monthly surplus.`,
        evidence_kind: 'CALCULATION',
        citations: [baseId, feasId],
      };
      break;
    }

    case 'HANDLE_PEER_FINDING': {
      const pf = tp.peer_finding || {};
      const activeGoals = (packet.context?.goals || []).filter(
        (g) => g.status === 'ACTIVE' && (Number(g.monthly_add_minor) || 0) > 0
      );
      const feasRes = gateway.call('sentinel_run_goal_feasibility', {
        goal_id: null,
        proposed_monthly_add_minor: 0,
      });
      const feasId = feasRes.tool_result_id;
      constraints.push(...feasRes.constraints_triggered);

      if (activeGoals.length === 0) {
        headline = {
          text: 'No active funded goals require adjustment right now.',
          evidence_kind: 'FACT',
          citations: [feasId],
        };
        break;
      }

      // Target lowest priority active goal for pressure, or highest priority for capacity
      const sortedGoals = [...activeGoals].sort((a, b) => (b.priority_rank || 2) - (a.priority_rank || 2));
      const targetGoal =
        pf.hint_code === 'SAVINGS_CAPACITY'
          ? sortedGoals[sortedGoals.length - 1]
          : sortedGoals[0];

      const progRes = gateway.call('sentinel_run_goal_progress', { goal_id: targetGoal.goal_id });
      const progId = progRes.tool_result_id;
      goalCards.push({
        goal_id: targetGoal.goal_id,
        progress_tool_result_id: progId,
        priority_tier: progRes.data.priority_tier,
      });

      if (pf.hint_code === 'GOAL_FUNDING_PRESSURE') {
        const valRes = gateway.call('sentinel_validate_goal_change', {
          operation: 'SET_MONTH_OVERRIDE',
          goal_id: targetGoal.goal_id,
          period: packet.context?.current_month_ist || new Date().toISOString().slice(0, 7),
          monthly_add_minor: 0,
        });
        const valId = valRes.tool_result_id;
        if (valRes.data?.verdict === 'PASS') {
          proposals.push({
            action_ref: 'act_ref_pause_goal_month',
            action_type: 'SET_GOAL_MONTH_OVERRIDE',
            tier: 'T2',
            target_entity: { type: 'GOAL', id: targetGoal.goal_id },
            params: {
              goal_id: targetGoal.goal_id,
              period: valRes.data.period,
              monthly_add_minor: 0,
            },
            rationale: {
              text: `Temporarily pauses this month's contribution to "${progRes.data.name}" ({{${progId}:/data/monthly_add_minor|inr}}) to relieve budget pressure.`,
              evidence_kind: 'RECOMMENDATION',
              citations: [feasId, progId, valId, ...(pf.tool_result_ids || [])],
            },
            validation_tool_result_id: valId,
            depends_on_action_ref: null,
          });
        }
        headline = {
          text: `You can pause "${progRes.data.name}" ({{${progId}:/data/monthly_add_minor|inr}}) for this month only to free up cash flow.`,
          evidence_kind: 'RECOMMENDATION',
          citations: [feasId, progId],
        };
      } else {
        headline = {
          text: `"${progRes.data.name}" is at {{${progId}:/data/progress_bp|bp_pct}} ({{${progId}:/data/saved_minor|inr}} of {{${progId}:/data/target_minor|inr}}).`,
          evidence_kind: 'FACT',
          citations: [feasId, progId],
        };
      }
      break;
    }

    case 'SIP_PROJECTION': {
      if (tp.annual_rate_bp == null) {
        status = 'NEEDS_INPUT';
        headline = {
          text: 'What annual return rate would you like to assume for this illustrative SIP projection?',
          evidence_kind: 'RECOMMENDATION',
          citations: [],
        };
        questions.push({
          question_id: 'q_sip_rate',
          prompt: 'Enter the annual return rate you want to assume (for arithmetic illustration only):',
          options: [
            { option_id: 'opt_enter_rate', label: 'Enter a rate', value: { action: 'ENTER_RATE' } },
            { option_id: 'opt_skip_sip', label: 'Skip the projection', value: { action: 'SKIP' } },
          ],
          allow_free_text: true,
        });
        break;
      }

      const sipRes = gateway.call('sentinel_project_sip', {
        monthly_amount_minor: tp.monthly_amount_minor,
        annual_rate_bp: tp.annual_rate_bp,
        months: tp.months,
        annual_step_up_bp: tp.annual_step_up_bp || 0,
      });
      const sipId = sipRes.tool_result_id;
      sipToolResultId = sipId;

      headline = {
        text: `Illustrative arithmetic projection: contributing {{${sipId}:/data/monthly_amount_minor|inr}} monthly for {{${sipId}:/data/months|months}} at your assumed rate of {{${sipId}:/data/annual_rate_bp|bp_pct}} totals {{${sipId}:/data/total_contributed_minor|inr}} in contributions and projects to {{${sipId}:/data/projected_corpus_minor|inr}} (illustrative only, not investment advice).`,
        evidence_kind: 'CALCULATION',
        citations: [sipId],
      };
      findings.push({
        text: 'This SIP projection is purely mathematical based on the rate you supplied and is not financial or investment advice.',
        evidence_kind: 'CAVEAT',
        citations: [sipId],
      });
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
    specialist: 'ATLAS',
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
      kind: 'AtlasDomain@1',
      goal_cards: goalCards,
      plan_recommendation: planRecommendation,
      sip_projection_tool_result_id: sipToolResultId,
    },
    error: null,
    latency_ms: Date.now() - startMs,
    _tool_results: gateway.resultsById,
  };
}

module.exports = {
  invoke,
  VALID_ATLAS_TASKS,
};
