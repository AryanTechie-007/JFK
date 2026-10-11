/**
 * John v2.0 — Main Orchestrator and Chatbot (`agents/john`)
 * Implements the 14-step request lifecycle, 3-layer routing, parallel specialist dispatch,
 * 1-edge peer reconciliation, 11-step deterministic response validation, conflict resolution
 * via Sentinel simulation, grounded placeholder rendering, and confirmation card generation.
 * (docs/specifications/john-orchestrator-spec.md)
 */

const db = require('../../db');
const { newId, toCanonicalUserId } = require('../../shared/ids');
const { rupeesToMinor, formatInr } = require('../../shared/money');
const { getAllowedToolsForCaller, validateSpecialistResponse } = require('../../shared/contracts/validator');
const { renderGroundedText } = require('../../shared/contracts/grounding');
const { createSnapshot } = require('../../platform/snapshot');
const { getCanonicalProfile, getGoalsForUser, getCapsForUser } = require('../../platform/profile');
const { getStatus } = require('../../engines/categorizer');
const { createGatewaySession } = require('../../platform/gateway');
const { registerProposal } = require('../../platform/action-service');
const atlas = require('../atlas');
const nova = require('../nova');
const iris = require('../iris');

/**
 * 3-Layer Deterministic Router (John §B.3)
 */
function routeRequest(message = '', uiContext = {}, stateContext = {}) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const workspace = uiContext?.workspace || 'JOHN';

  // 1. Out-of-scope check (John §A.3: real money transfer, investment advice, tax, credit score)
  if (
    /\b(transfer\s+money\s+to|wire\s+funds|auto[-\s]?sweep|buy\s+stocks|which\s+mutual\s+fund|best\s+stock|crypto|bitcoin|file\s+my\s+itr)\b/i.test(
      lower
    ) &&
    !/\bsip\b/i.test(lower)
  ) {
    return {
      mode: 'OUT_OF_SCOPE',
      tasks: [],
      direct_tool: null,
      reason: 'OUT_OF_SCOPE_FINANCIAL_EXECUTION_OR_ADVICE',
    };
  }

  // 2. On-demand Financial Health Score (D-024, John §B.3)
  if (/\b(health\s*score|financial\s*health|wellness\s*score|how\s*healthy\s*are\s*my\s*finances)\b/i.test(lower)) {
    return {
      mode: 'DIRECT_SENTINEL',
      direct_tool: 'sentinel_compute_health_score',
      tasks: [],
      reason: 'HEALTH_SCORE_ON_DEMAND',
    };
  }

  // 3. SIP Projection (D-024, Atlas §B.2)
  if (/\b(sip\b|systematic\s*investment|compound\s*projection)/i.test(lower)) {
    const amtMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i);
    const rateMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    const yearsMatch = text.match(/(\d+)\s*(?:years?|yrs?)/i);
    const monthsMatch = text.match(/(\d+)\s*(?:months?|mos?)/i);

    const monthlyMinor = amtMatch
      ? rupeesToMinor(Number(amtMatch[1].replace(/,/g, '')))
      : 500000; // default ₹5,000 if not specified
    const annualRateBp = rateMatch ? Math.round(Number(rateMatch[1]) * 100) : undefined;
    const months = yearsMatch
      ? Number(yearsMatch[1]) * 12
      : monthsMatch
      ? Number(monthsMatch[1])
      : 60;

    return {
      mode: 'SPECIALISTS',
      tasks: [
        {
          specialist: 'ATLAS',
          task_type: 'SIP_PROJECTION',
          task_params: {
            monthly_amount_minor: monthlyMinor,
            ...(annualRateBp !== undefined ? { annual_rate_bp: annualRateBp } : {}),
            months,
          },
        },
      ],
      reason: 'SIP_PROJECTION_QUERY',
    };
  }

  // 4. Purchase What-If ("Can I afford a ₹1,20,000 laptop...")
  if (/\b(can\s+i\s+afford|what\s+if\s+i\s+buy|afford\s+a|buying\s+a)\b/i.test(lower)) {
    const amtMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i);
    const amountMinor = amtMatch ? rupeesToMinor(Number(amtMatch[1].replace(/,/g, ''))) : 5000000;
    return {
      mode: 'SPECIALISTS',
      tasks: [
        {
          specialist: 'IRIS',
          task_type: 'WHAT_IF_PURCHASE',
          task_params: {
            amount_minor: amountMinor,
            date: stateContext.current_date_ist,
            label: 'Planned purchase',
          },
        },
      ],
      reason: 'WHAT_IF_PURCHASE_QUERY',
    };
  }

  // 5. Create Goal ("create a goal", "save ₹50,000 for Emergency Fund")
  if (/\b(create\s+(?:a\s+)?goal|new\s+goal|start\s+saving\s+for|save\s+for)\b/i.test(lower)) {
    const numbers = [...text.matchAll(/(\d[\d,]*)/g)].map((m) =>
      rupeesToMinor(Number(m[1].replace(/,/g, '')))
    );
    const targetMinor = numbers[0] || 10000000; // ₹1,00,000
    const monthlyMinor = numbers[1] || Math.round(targetMinor / 12);
    const nameMatch = text.match(/for\s+([A-Za-z0-9\s]{2,25})/i);
    const goalName = nameMatch ? nameMatch[1].trim() : 'Savings Goal';
    return {
      mode: 'SPECIALISTS',
      tasks: [
        {
          specialist: 'ATLAS',
          task_type: 'CREATE_GOAL',
          task_params: {
            name: goalName,
            target_minor: targetMinor,
            monthly_add_minor: monthlyMinor,
            priority_tier: 'MEDIUM',
          },
        },
      ],
      reason: 'CREATE_GOAL_INTENT',
    };
  }

  // 6. Delete Goal
  if (/\b(delete|remove)\s+(?:my\s+)?goal\b/i.test(lower)) {
    const firstGoal = stateContext.goals?.[0];
    if (firstGoal) {
      return {
        mode: 'SPECIALISTS',
        tasks: [
          {
            specialist: 'ATLAS',
            task_type: 'DELETE_GOAL',
            task_params: {
              goal_id: firstGoal.goal_id,
              explicit: /\bdelete\b/i.test(lower),
            },
          },
        ],
        reason: 'DELETE_GOAL_INTENT',
      };
    }
  }

  // 7. Rebalance / Over-budget / Breach
  if (/\b(rebalance|over\s*budget|breach|exceeded\s*cap|cover\s*overspend)\b/i.test(lower)) {
    const firstCap = stateContext.caps?.[0];
    return {
      mode: 'SPECIALISTS',
      tasks: [
        {
          specialist: 'NOVA',
          task_type: firstCap ? 'PROPOSE_REBALANCE' : 'CAP_STATUS',
          task_params: firstCap ? { category_id: firstCap.category_id } : {},
        },
      ],
      reason: 'REBALANCE_OR_BREACH_QUERY',
    };
  }

  // 8. Upcoming bills / cashflow outlook
  if (/\b(upcoming\s+bills|bills\s+due|cash\s*flow\s+risk|any\s+big\s+bills|subscriptions\s+due)\b/i.test(lower)) {
    return {
      mode: 'SPECIALISTS',
      tasks: [
        {
          specialist: 'IRIS',
          task_type: 'BILL_OUTLOOK',
          task_params: { horizon_days: 30 },
        },
      ],
      reason: 'BILL_OUTLOOK_QUERY',
    };
  }

  // 9. Workspace-contextual default routing (Layer 1 + Layer 2)
  if (workspace === 'ATLAS' || /\b(goal|saving|earmark|target)\b/i.test(lower)) {
    return {
      mode: 'SPECIALISTS',
      tasks: [{ specialist: 'ATLAS', task_type: 'GOAL_PLAN_REVIEW', task_params: {} }],
      reason: 'ATLAS_GOAL_REVIEW',
    };
  }

  if (workspace === 'NOVA' || /\b(cap|budget\s+limit|daily\s+allowance|utilization|burn\s+rate)\b/i.test(lower)) {
    return {
      mode: 'SPECIALISTS',
      tasks: [{ specialist: 'NOVA', task_type: 'CAP_STATUS', task_params: {} }],
      reason: 'NOVA_CAP_STATUS',
    };
  }

  if (workspace === 'IRIS' || /\b(next\s+month|plan|simulate|forecast|overspending)\b/i.test(lower)) {
    return {
      mode: 'SPECIALISTS',
      tasks: [
        {
          specialist: 'IRIS',
          task_type: 'MONTHLY_PLAN',
          task_params: { target_month: stateContext.current_month_ist },
        },
      ],
      reason: 'IRIS_MONTHLY_PLAN',
    };
  }

  // Default holistic coaching: dispatch Atlas + Nova + Iris in parallel!
  return {
    mode: 'SPECIALISTS',
    tasks: [
      { specialist: 'NOVA', task_type: 'CAP_STATUS', task_params: {} },
      { specialist: 'ATLAS', task_type: 'GOAL_PLAN_REVIEW', task_params: {} },
      {
        specialist: 'IRIS',
        task_type: 'MONTHLY_PLAN',
        task_params: { target_month: stateContext.current_month_ist },
      },
    ],
    reason: 'HOLISTIC_MULTI_SPECIALIST_REVIEW',
  };
}

function buildTaskPacket({
  requestId,
  traceId,
  snapshot,
  dataQuality,
  userId,
  userMessage,
  trigger = 'USER_MESSAGE',
  uiContext = { workspace: 'JOHN' },
  specTask,
  context,
  peerFindings = [],
}) {
  return {
    schema: 'TaskPacket@1',
    request_id: requestId,
    task_id: newId('tsk'),
    trace_id: traceId,
    user_id: userId,
    specialist: specTask.specialist,
    task_type: specTask.task_type,
    trigger,
    snapshot_id: snapshot.snapshot_id,
    data_quality: dataQuality,
    user_message: userMessage,
    ui_context: uiContext,
    task_params: specTask.task_params || {},
    context: {
      ...context,
      peer_findings: peerFindings,
    },
    allowed_tools: getAllowedToolsForCaller(specTask.specialist),
    budget: {
      max_tool_calls: 8,
      deadline_ms: 4000,
    },
  };
}

async function dispatchSpecialist(packet) {
  switch (packet.specialist) {
    case 'ATLAS':
      return atlas.invoke(packet);
    case 'NOVA':
      return nova.invoke(packet);
    case 'IRIS':
      return iris.invoke(packet);
    default:
      throw new Error(`Unknown specialist: ${packet.specialist}`);
  }
}

/**
 * Main entry point: handles a user chat request and returns ChatResponse@1
 * plus backward-compatible fields (`reply`, `text`, `traces`, `proposals`) for the React UI.
 */
async function handleChatRequest(userId, body = {}) {
  const canonicalUserId = toCanonicalUserId(userId);
  const requestId = newId('req');
  const traceId = newId('trc');
  const message = String(body.message || body.userQuery || '').trim();
  const uiContext = body.ui_context || { workspace: body.workspace || 'JOHN' };
  const trigger = body.trigger || 'USER_MESSAGE';

  // Step 1 & 2: Create pinned Snapshot@1 and read DataQuality@1
  const snapshot = createSnapshot(canonicalUserId);
  const dataQuality = getStatus(canonicalUserId, snapshot.ledger_version);
  const profile = getCanonicalProfile(canonicalUserId);
  const goals = getGoalsForUser(canonicalUserId, false, snapshot.current_month_ist);
  const caps = getCapsForUser(canonicalUserId, snapshot.current_month_ist);

  const sharedContext = {
    current_date_ist: snapshot.current_date_ist,
    current_month_ist: snapshot.current_month_ist,
    preferences: profile.preferences,
    goals,
    caps,
  };

  // Step 3: Route
  const route = routeRequest(message, uiContext, sharedContext);
  const blocks = [];
  const traces = [];
  const registeredProposals = [];
  const allToolResults = {};

  // Data quality notice block if coverage < 8500 or needs_review_count > 0
  if (dataQuality.needs_review_count > 0 || dataQuality.coverage_bp < 8500) {
    blocks.push({
      kind: 'NOTICE',
      severity: dataQuality.coverage_bp < 7000 ? 'WARNING' : 'INFO',
      text: `${dataQuality.needs_review_count} transaction(s) in Sentinel need review (${(dataQuality.coverage_bp / 100).toFixed(0)}% categorization coverage).`,
      link_workspace: 'SENTINEL',
    });
  }

  if (route.mode === 'OUT_OF_SCOPE') {
    const scopeText =
      'I can help you plan your budget, track spending, simulate purchases, and manage savings goals, but I cannot move real money, execute bank transfers, or recommend specific investment products or funds.';
    blocks.push({ kind: 'TEXT', text: scopeText });
    return {
      schema: 'ChatResponse@1',
      request_id: requestId,
      trace_id: traceId,
      snapshot_id: snapshot.snapshot_id,
      blocks,
      proposals: [],
      traces: [
        {
          agent: 'john',
          role: 'Main Orchestrator',
          title: 'Scope Boundary Check',
          thought: 'Declined out-of-scope money movement or investment product request per SC §13.1.',
        },
      ],
      reply: scopeText,
      text: scopeText,
      success: true,
    };
  }

  if (route.mode === 'DIRECT_SENTINEL' && route.direct_tool === 'sentinel_compute_health_score') {
    const gw = createGatewaySession({
      caller: 'JOHN',
      snapshot_id: snapshot.snapshot_id,
      user_id: canonicalUserId,
      max_tool_calls: 4,
    });
    const hRes = gw.call('sentinel_compute_health_score', {});
    allToolResults[hRes.tool_result_id] = hRes;
    const d = hRes.data;
    const replyText = `Your **Financial Health Score** is **${d.score}/100** (${d.grade}):\n\n` +
      `- **Saving Behaviour**: ${d.sub_scores.saving_behaviour}/25 (Savings rate: ${(d.metrics.savings_rate_bp / 100).toFixed(1)}%)\n` +
      `- **Budget Discipline**: ${d.sub_scores.budget_discipline}/25 (${d.metrics.caps_within_limit_count}/${d.metrics.caps_total_count} capped categories within limit)\n` +
      `- **Spending Control**: ${d.sub_scores.spending_control}/25 (Outflow ratio: ${(d.metrics.outflow_ratio_bp / 100).toFixed(1)}%)\n` +
      `- **Future Planning**: ${d.sub_scores.future_planning}/25 (${d.metrics.funded_goals_count} funded active goal(s))`;

    blocks.push({ kind: 'TEXT', text: replyText, health_score: d });
    traces.push({
      agent: 'sentinel',
      role: 'Financial Observer v5.0',
      title: 'On-Demand Health Score (`sentinel_compute_health_score`)',
      thought: `Computed deterministic score ${d.score}/100 (${d.grade}) at snapshot ${snapshot.snapshot_id}.`,
    });

    return {
      schema: 'ChatResponse@1',
      request_id: requestId,
      trace_id: traceId,
      snapshot_id: snapshot.snapshot_id,
      blocks,
      proposals: [],
      traces,
      reply: replyText,
      text: replyText,
      success: true,
    };
  }

  // Step 4-5: Parallel Specialist Dispatch
  const packets = route.tasks.map((specTask) =>
    buildTaskPacket({
      requestId,
      traceId,
      snapshot,
      dataQuality,
      userId: canonicalUserId,
      userMessage: message,
      trigger,
      uiContext,
      specTask,
      context: sharedContext,
    })
  );

  const responses = await Promise.all(packets.map((pkt) => dispatchSpecialist(pkt)));

  // Step 6: Check for 1-edge peer hint reconciliation (e.g., Nova GOAL_FUNDING_PRESSURE -> Atlas HANDLE_PEER_FINDING)
  const peerHintsForAtlas = [];
  for (const r of responses) {
    if (r._tool_results) Object.assign(allToolResults, r._tool_results);
    for (const hint of r.peer_hints || []) {
      if (hint.to === 'ATLAS' && !responses.some((x) => x.specialist === 'ATLAS')) {
        peerHintsForAtlas.push(hint);
      }
    }
  }

  if (peerHintsForAtlas.length > 0) {
    const reconcilePkt = buildTaskPacket({
      requestId,
      traceId,
      snapshot,
      dataQuality,
      userId: canonicalUserId,
      userMessage: message,
      trigger,
      uiContext,
      specTask: {
        specialist: 'ATLAS',
        task_type: 'HANDLE_PEER_FINDING',
        task_params: { peer_finding: peerHintsForAtlas[0] },
      },
      context: sharedContext,
      peerFindings: peerHintsForAtlas,
    });
    const reconcileRes = await dispatchSpecialist(reconcilePkt);
    if (reconcileRes._tool_results) Object.assign(allToolResults, reconcileRes._tool_results);
    responses.push(reconcileRes);
  }

  // Step 7-10: Validate responses, resolve placeholders, register proposals & mint confirmation tokens
  const renderedParagraphs = [];

  for (const idx of responses.keys()) {
    const resp = responses[idx];
    const pkt = packets[idx] || null;
    const valCheck = validateSpecialistResponse(resp, pkt);

    const groundingContext = {
      toolResults: allToolResults,
      dataQuality,
      taskParams: pkt?.task_params || {},
      proposalsByRef: Object.fromEntries((resp.proposals || []).map((p) => [p.action_ref, p])),
    };

    const headlineRender = renderGroundedText(resp.headline?.text || '', groundingContext);
    const cleanHeadline = headlineRender.rendered;

    traces.push({
      agent: resp.specialist.toLowerCase(),
      role:
        resp.specialist === 'ATLAS'
          ? 'Savings Strategist v5.0'
          : resp.specialist === 'NOVA'
          ? 'Budget Guardian v5.0'
          : 'Spending Advisor v5.0',
      title: `${resp.specialist} (${pkt?.task_type || resp.status})`,
      thought: cleanHeadline,
      tool_calls: resp.tool_calls_made,
      valid: valCheck.valid && headlineRender.ok,
    });

    if (cleanHeadline) {
      renderedParagraphs.push(`**${resp.specialist}**: ${cleanHeadline}`);
      blocks.push({
        kind: 'TEXT',
        specialist: resp.specialist,
        text: cleanHeadline,
        confidence: resp.confidence,
      });
    }

    for (const f of resp.findings || []) {
      const fRender = renderGroundedText(f.text, groundingContext);
      if (fRender.rendered) {
        renderedParagraphs.push(`- ${fRender.rendered}`);
        blocks.push({
          kind: 'TEXT',
          specialist: resp.specialist,
          text: fRender.rendered,
          evidence_kind: f.evidence_kind,
        });
      }
    }

    for (const q of resp.questions || []) {
      blocks.push({
        kind: 'QUESTION',
        question_id: q.question_id,
        prompt: q.prompt,
        options: q.options,
        allow_free_text: q.allow_free_text,
      });
    }

    // Register validated proposals in Action Service
    for (const prop of resp.proposals || []) {
      const ratRender = renderGroundedText(prop.rationale?.text || '', groundingContext);
      const registered = registerProposal({
        userId: canonicalUserId,
        requestId,
        snapshotId: snapshot.snapshot_id,
        origin: 'AGENT',
        proposer: resp.specialist,
        actionType: prop.action_type,
        targetEntityType: prop.target_entity?.type || 'PLAN',
        targetEntityId: prop.target_entity?.id || null,
        params: prop.params,
        rationale: {
          ...prop.rationale,
          text: ratRender.rendered || prop.rationale?.text || '',
        },
        validationToolResultId: prop.validation_tool_result_id,
      });
      registeredProposals.push(registered);

      blocks.push({
        kind: prop.tier === 'T1' ? 'CHIP' : 'CARD',
        proposal_id: registered.proposal_id,
        confirmation_token: registered.confirmation_token,
        action_type: registered.action_type,
        tier: registered.tier,
        proposer: registered.proposer,
        params: registered.params,
        rationale: registered.rationale.text,
        reversible: registered.reversible,
        undo_window_s: registered.undo_window_s,
        expires_at: registered.expires_at,
      });
    }
  }

  const finalReply =
    renderedParagraphs.join('\n\n') ||
    `I have reviewed your financial snapshot (${snapshot.current_month_ist}). How can I help you adjust your budget caps, spending plan, or savings goals?`;

  // Also provide backward-compatible `proposedGoal` if a CREATE_GOAL proposal was registered
  const createGoalProp = registeredProposals.find((p) => p.action_type === 'CREATE_GOAL');
  const proposedGoal = createGoalProp
    ? {
        proposal_id: createGoalProp.proposal_id,
        confirmation_token: createGoalProp.confirmation_token,
        name: createGoalProp.params.name,
        target: Math.round((createGoalProp.params.target_minor || 0) / 100),
        targetAmount: Math.round((createGoalProp.params.target_minor || 0) / 100),
        monthlyAdd: Math.round((createGoalProp.params.monthly_add_minor || 0) / 100),
        monthlyAllocation: Math.round((createGoalProp.params.monthly_add_minor || 0) / 100),
        priority: createGoalProp.params.priority_tier || 'MEDIUM',
      }
    : null;

  return {
    schema: 'ChatResponse@1',
    request_id: requestId,
    trace_id: traceId,
    snapshot_id: snapshot.snapshot_id,
    data_quality: dataQuality,
    blocks,
    proposals: registeredProposals,
    proposedGoal,
    traces,
    reply: finalReply,
    text: finalReply,
    success: true,
  };
}

async function handleChat(opts = {}) {
  const userId = opts.userId || opts.user_id;
  return handleChatRequest(userId, {
    message: opts.message,
    thread_id: opts.threadId || opts.thread_id,
    ui_context: opts.uiContext || opts.ui_context || { workspace: opts.workspace || 'JOHN' },
  });
}

module.exports = {
  routeRequest,
  handleChatRequest,
  handleChat,
};
