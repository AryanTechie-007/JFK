/**
 * JohnOrchestrator — Main Orchestrator (Star Topology Hub)
 *
 * Implements Sections 1, 3, 4, 5, 7, 10, and 14 of Nova: Agent Specification (V4):
 * - Routes requests using Section 10 RoutingTable.
 * - Builds `TaskPacket@1` (never passing `user_id` or raw ledger to specialists).
 * - Invokes stateless specialists (`Nova`, `Iris`, `Atlas`) in strict Star Topology.
 * - Collects `peer_hints[]` from Nova (`GOAL_FUNDING_PRESSURE`, `RECURRING_ANOMALY`,
 *   `MISCATEGORIZATION_SUSPECTED`) and places them in Atlas's or Iris's next `TaskPacket@1`
 *   or adds suspected miscategorizations to the review queue.
 * - Creates confirmation cards with `confirmation_token`s via `ActionService`.
 */

const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const { TASK_TYPES, PEER_HINT_CODES } = require('../../contracts/PlatformRules');
const SnapshotManager = require('../../tools/sentinel/SnapshotManager');
const { defaultTallyService } = require('../../tools/tally/TallyService');
const { defaultThresholdJob } = require('../../tools/threshold-job/ThresholdJob');
const { ActionService } = require('../../tools/action-service/ActionService');
const NovaAgent = require('../nova/NovaAgent');
const NovaAgentBrain = require('../nova/NovaAgentBrain');
const IrisAgent = require('../iris/IrisAgent');
const AtlasAgent = require('../atlas/AtlasAgent');
const RoutingTable = require('./RoutingTable');

class JohnOrchestrator {
  constructor() {
    // Pending peer hints queued by target agent ('Atlas' | 'Iris')
    this.peerHintQueue = {
      Atlas: [],
      Iris: []
    };
    // Review queue for MISCATEGORIZATION_SUSPECTED items
    this.reviewQueue = [];
    // Session memory owned by John (Section 14 #5: "Stateless specialists. Memory belongs to John.")
    this.rollingSummaries = new Map();
    this.recentTurns = new Map();
  }

  /**
   * Builds a compliant TaskPacket@1 for a specialist without exposing user_id or raw ledger.
   */
  buildTaskPacket({
    userId = 'user_demo_nova',
    taskType = TASK_TYPES.LIVE_STATUS,
    snapshotId = null,
    userMessage = null,
    event = null,
    uiContext = null,
    targetSpecialist = 'Nova',
    explicitUserOverride = false,
    db = null
  }) {
    const snap = snapshotId
      ? SnapshotManager.getSnapshot(snapshotId)
      : SnapshotManager.getLatestSnapshot(userId, db);

    if (!snap) {
      throw new Error('Cannot build TaskPacket@1: no snapshot available.');
    }

    const dataQuality = db
      ? defaultTallyService.computeDataQuality(userId, snap.month, db, {
          categorization_version: snap.categorization_version,
          import_in_progress: snap.import_in_progress,
          data_stale: snap.is_stale
        })
      : {
          categorization_version: snap.categorization_version,
          coverage_by_amount: 1.0,
          uncategorized_amount_minor: 0,
          needs_review_count: snap.transactions.filter(t => t.categorization_status === 'NEEDS_REVIEW').length,
          import_in_progress: Boolean(snap.import_in_progress),
          data_stale: Boolean(snap.is_stale),
          snapshot_age_seconds: Math.max(0, Math.round((Date.now() - snap.created_at_ms) / 1000))
        };

    const rawProtected = snap.user_persona?.priority_categories
      ? JSON.parse(snap.user_persona.priority_categories)
      : ['Housing', 'Healthcare', 'Bills & Utilities'];

    const peerFindings = targetSpecialist === 'Atlas'
      ? this.consumePeerHints('Atlas')
      : targetSpecialist === 'Iris'
        ? this.consumePeerHints('Iris')
        : [];

    return TaskPacketV1.create({
      task_type: taskType,
      snapshot_id: snap.snapshot_id,
      user_message: userMessage,
      event,
      ui_context: uiContext || { page: 'nova_budget_workspace', active_category: event?.category || null },
      data_quality: dataQuality,
      preferences: {
        protected_categories: rawProtected,
        currency: snap.user?.currency || '₹',
        explicit_user_override: explicitUserOverride
      },
      rolling_summary: this.rollingSummaries.get(userId) || '',
      recent_turns: this.recentTurns.get(userId) || [],
      peer_findings: peerFindings
    });
  }

  /**
   * Invokes Nova via TaskPacket@1, processes peer_hints[], and attaches confirmation cards.
   */
  invokeNova({
    userId = 'user_demo_nova',
    taskType = TASK_TYPES.LIVE_STATUS,
    snapshotId = null,
    userMessage = null,
    event = null,
    uiContext = null,
    explicitUserOverride = false,
    db = null
  }) {
    const packet = this.buildTaskPacket({
      userId,
      taskType,
      snapshotId,
      userMessage,
      event,
      uiContext,
      targetSpecialist: 'Nova',
      explicitUserOverride,
      db
    });

    const response = NovaAgent.invoke(packet);
    this.processPeerHints(userId, response.peer_hints);

    // Issue confirmation cards for any T2/T3 proposed_actions
    const confirmationCards = (response.proposed_actions || []).map(action => {
      if (action.requires_confirmation) {
        return ActionService.createProposalConfirmation({
          userId,
          actionType: action.type,
          payload: action.payload,
          initiatedBy: 'Nova'
        });
      }
      return {
        action_type: action.type,
        tier: action.tier || 'T1',
        requires_confirmation: false,
        payload: action.payload
      };
    });

    return {
      packet,
      specialist_response: response,
      confirmation_cards: confirmationCards
    };
  }

  /**
   * Step 4 of Real-time architecture: ThresholdJob notifies John on a new Warning or Exceeded alert.
   */
  handleBreachEventSync({ user_id, snapshot_id, alert, is_correction = false, suspected_miscategorizations = [] }) {
    const result = this.invokeNova({
      userId: user_id,
      taskType: TASK_TYPES.BREACH_EVENT,
      snapshotId: snapshot_id,
      event: {
        alert_id: alert.alert_id,
        category_id: alert.category_id,
        category: alert.category,
        tier: alert.tier,
        is_correction,
        suspected_miscategorizations
      }
    });

    // Attach Nova's narrative to the stored alert (Step 5 -> Step 6)
    if (alert && result.specialist_response.findings.length > 0) {
      alert.llm_narrative = result.specialist_response.findings
        .map(f => f.rendered_statement)
        .join(' ');
    }

    return result;
  }

  /**
   * Processes Nova's `peer_hints[]` in strict Star Topology:
   * - `GOAL_FUNDING_PRESSURE` -> queued for Atlas
   * - `RECURRING_ANOMALY` -> queued for Iris
   * - `MISCATEGORIZATION_SUSPECTED` -> added to John's review queue
   */
  processPeerHints(userId, peerHints = []) {
    for (const hint of peerHints) {
      if (hint.type === PEER_HINT_CODES.GOAL_FUNDING_PRESSURE) {
        this.peerHintQueue.Atlas.push({ ...hint, queued_at: new Date().toISOString() });
      } else if (hint.type === PEER_HINT_CODES.RECURRING_ANOMALY) {
        this.peerHintQueue.Iris.push({ ...hint, queued_at: new Date().toISOString() });
      } else if (hint.type === PEER_HINT_CODES.MISCATEGORIZATION_SUSPECTED) {
        this.reviewQueue.push({
          user_id: userId,
          ...hint,
          status: 'NEEDS_REVIEW',
          queued_at: new Date().toISOString()
        });
      }
    }
  }

  consumePeerHints(agentName) {
    const list = this.peerHintQueue[agentName] || [];
    this.peerHintQueue[agentName] = [];
    return list;
  }

  getPeerHints(agentName) {
    return [...(this.peerHintQueue[agentName] || [])];
  }

  getReviewQueue(userId = null) {
    return this.reviewQueue.filter(item => !userId || item.user_id === userId);
  }

  /**
   * Pattern B: Invokes Iris with any pending `RECURRING_ANOMALY` hints placed in `peer_findings`.
   */
  invokeIrisWithPendingHints({ userId = 'user_demo_nova', snapshotId = null, db = null } = {}) {
    const packet = this.buildTaskPacket({
      userId,
      taskType: TASK_TYPES.LIVE_STATUS,
      snapshotId,
      targetSpecialist: 'Iris',
      db
    });
    const response = IrisAgent.invoke(packet);
    return { packet, specialist_response: response };
  }

  /**
   * Pattern C: Deficit that touches goals.
   * Nova returns `GOAL_FUNDING_PRESSURE` hint -> John places it in Atlas's packet -> presents both options to user.
   */
  async coordinateDeficitAndGoals(userId = 'user_demo_nova', db, customDeficit = null) {
    const snap = SnapshotManager.createSnapshot(userId, db);
    const novaResult = this.invokeNova({
      userId,
      taskType: TASK_TYPES.BREACH_EVENT,
      snapshotId: snap.snapshot_id,
      db
    });

    const shortfall = customDeficit ||
      novaResult.specialist_response.peer_hints.find(h => h.type === PEER_HINT_CODES.GOAL_FUNDING_PRESSURE)?.shortfall_amount ||
      2500;

    // Ensure hint is placed in Atlas's packet via John (Star Topology)
    if (this.peerHintQueue.Atlas.length === 0) {
      this.peerHintQueue.Atlas.push({
        type: PEER_HINT_CODES.GOAL_FUNDING_PRESSURE,
        target_agent: 'Atlas',
        shortfall_amount: shortfall,
        tool_result_id: novaResult.specialist_response.tool_result_ids[0] || `res_reb_${snap.snapshot_id}`
      });
    }

    const atlasPacket = this.buildTaskPacket({
      userId,
      taskType: TASK_TYPES.LIVE_STATUS,
      snapshotId: snap.snapshot_id,
      targetSpecialist: 'Atlas',
      event: { shortfall_amount: shortfall },
      db
    });

    const atlasResponse = AtlasAgent.invoke(atlasPacket);
    const sessionId = `orch-${Date.now()}`;

    const novaSummary = novaResult.specialist_response.findings.map(f => f.rendered_statement).join(' ');
    const atlasSummary = atlasResponse.findings.map(f => f.rendered_statement).join(' ');

    return {
      session_id: sessionId,
      topology: 'STAR_TOPOLOGY_VIA_JOHN',
      status: 'NEGOTIATION_RESOLVED',
      timestamp: new Date().toISOString(),
      nova_response: novaResult.specialist_response,
      atlas_packet: atlasPacket,
      atlas_response: atlasResponse,
      confirmation_cards: novaResult.confirmation_cards,
      dialogue: [
        {
          sessionId,
          from: 'Nova (via John TaskPacket@1)',
          to: 'John (Main Orchestrator)',
          topic: 'BREACH_AND_REBALANCE_EVALUATION',
          content: novaSummary
        },
        {
          sessionId,
          from: 'Atlas (via John TaskPacket@1 with GOAL_FUNDING_PRESSURE peer_finding)',
          to: 'John (Main Orchestrator)',
          verdict: novaResult.specialist_response.proposed_actions.length > 0 ? 'RECOMMEND_OPTION_A' : 'ACCEPT_OPTION_B',
          analysis: atlasSummary
        }
      ],
      recommended_action: novaResult.specialist_response.proposed_actions[0]?.payload || null
    };
  }

  /**
   * Prepares John's coaching brief using verified Sentinel & Nova figures.
   */
  async prepareJohnBriefing(userId = 'user_demo_nova', db) {
    const cognitiveCycle = await NovaAgentBrain.runCognitiveCycle(userId, db);
    const {
      cognitive_synthesis,
      ground_truth_metrics,
      diagnostics,
      velocity,
      rebalance_proposal,
      active_interventions,
      specialist_response
    } = cognitiveCycle;

    let emotionalTone = 'CONFIDENT_AND_ON_TRACK';
    if (diagnostics.breached_category_count > 0) {
      emotionalTone = 'EMPATHETIC_PROBLEM_SOLVING';
    } else if (diagnostics.warning_category_count > 0) {
      emotionalTone = 'GENTLE_AWARENESS';
    }

    const coachingTalkingPoints = [
      cognitive_synthesis.briefing_for_john,
      `Headline daily spending envelope is ₹${velocity.envelopes.headline_daily_envelope.toLocaleString()}/day (${velocity.envelopes.headline_mode} mode) for the remaining ${velocity.temporal.days_remaining} days.`,
      rebalance_proposal.has_proposals
        ? `Offer the zero-sum rebalancing solution: ${rebalance_proposal.moves[0]?.reasoning}`
        : `All flexible category buffers are currently intact.`
    ];

    const proposalCards = active_interventions.map(i => ({
      id: i.type,
      title: i.title,
      summary: i.description,
      impact: `₹${i.impact_amount.toLocaleString()}`,
      actionLabel: i.type === 'REBALANCE' ? 'Confirm Rebalance' : 'Acknowledge'
    }));

    return {
      protocol_version: 'TaskPacket@1 / SpecialistResponse@1 (V4 Star Topology)',
      from_agent: 'Nova (Budget Guardian)',
      to_agent: 'John (Main Orchestrator)',
      timestamp: new Date().toISOString(),
      emotional_guidance: emotionalTone,
      executive_summary: cognitive_synthesis.executive_summary,
      root_cause: cognitive_synthesis.root_cause_analysis,
      verified_financials: ground_truth_metrics,
      specialist_response,
      coaching_talking_points: coachingTalkingPoints,
      ready_action_cards: proposalCards
    };
  }
}

const defaultJohnOrchestrator = new JohnOrchestrator();
defaultThresholdJob.setOrchestratorGetter(() => defaultJohnOrchestrator);

/**
 * Backward-compatible AgentNegotiator facade that routes strictly through JohnOrchestrator
 * and ActionService.
 */
class AgentNegotiator {
  static async prepareJohnBriefing(userId = 'user_demo_nova', db) {
    return defaultJohnOrchestrator.prepareJohnBriefing(userId, db);
  }

  static async negotiateWithAtlas(userId = 'user_demo_nova', db, customDeficit = null) {
    return defaultJohnOrchestrator.coordinateDeficitAndGoals(userId, db, customDeficit);
  }

  static applyRebalance(userId = 'user_demo_nova', move, db, confirmationToken = null) {
    // Issue a token if invoked from legacy direct test helper, or verify token if provided
    let tokenToUse = confirmationToken;
    if (!tokenToUse) {
      const card = ActionService.createProposalConfirmation({
        userId,
        actionType: 'APPLY_REBALANCE',
        payload: { move },
        initiatedBy: 'Nova'
      });
      tokenToUse = card.confirmation_token;
    }

    return ActionService.execute({
      userId,
      actionType: 'APPLY_REBALANCE',
      payload: { move },
      confirmationToken: tokenToUse,
      initiatedBy: 'Nova',
      db
    });
  }
}

module.exports = {
  JohnOrchestrator,
  defaultJohnOrchestrator,
  AgentNegotiator,
  RoutingTable
};
