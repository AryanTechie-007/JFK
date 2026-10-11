/**
 * NovaAgentBrain — V4 Cognitive Synthesis & SpecialistResponse@1 Wrapper
 *
 * Bridges the V4 stateless `NovaAgent.invoke(TaskPacket@1)` contract with the
 * cognitive cycle telemetry expected by John and the Nova Budget Workspace UI.
 */

const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const { TASK_TYPES } = require('../../contracts/PlatformRules');
const {
  SentinelEngine,
  SnapshotManager,
  VelocityPredictor,
  AnomalyDetector,
  RebalanceEngine
} = require('../../tools/sentinel');
const { defaultTallyService } = require('../../tools/tally/TallyService');
const NovaAgent = require('./NovaAgent');
const NovaGuardianEngine = require('./NovaGuardianEngine');

class NovaAgentBrain {
  /**
   * Executes a full V4 cycle via Sentinel snapshot + NovaAgent.invoke(TaskPacket@1)
   */
  static async runCognitiveCycle(userId = 'user_demo_nova', db, options = {}) {
    const budgetEval = NovaGuardianEngine.evaluateBudget(userId, null, db);
    const snapshot = SnapshotManager.getSnapshot(budgetEval.snapshot_id);
    const dataQuality = defaultTallyService.computeDataQuality(userId, budgetEval.month, db, {
      categorization_version: snapshot.categorization_version
    });

    const userPersona = snapshot.user_persona || {};
    const protectedCategories = typeof userPersona.priority_categories === 'string'
      ? JSON.parse(userPersona.priority_categories || '["Housing", "Healthcare", "Bills & Utilities"]')
      : (userPersona.priority_categories || ['Housing', 'Healthcare', 'Bills & Utilities']);

    const velocityAnalysis = VelocityPredictor.analyzeVelocity(budgetEval.categories);
    const anomalyAudit = AnomalyDetector.auditTransactions(
      snapshot.transactions.slice(0, 30),
      snapshot.merchant_profiles,
      snapshot.caps
    );
    const rebalancePlan = RebalanceEngine.computeRebalancePlan(budgetEval.categories, userPersona);

    // Determine primary task_type for the stateless NovaAgent invocation
    const hasBreach = budgetEval.categories.some(c => c.status === 'exceeded' || c.status === 'warning');
    const taskType = options.task_type || (hasBreach ? TASK_TYPES.BREACH_EVENT : TASK_TYPES.LIVE_STATUS);

    const packet = TaskPacketV1.create({
      task_type: taskType,
      snapshot_id: snapshot.snapshot_id,
      user_message: options.user_message || null,
      event: options.event || null,
      data_quality: dataQuality,
      preferences: {
        protected_categories: protectedCategories,
        currency: budgetEval.cashflow.currency
      }
    });

    const specialistResponse = NovaAgent.invoke(packet);

    const diagnostics = this.orientDiagnostics({
      budgetEval,
      velocityAnalysis,
      anomalyAudit,
      recentTxns: snapshot.transactions.slice(0, 30)
    });

    const cognitiveInsight = await this.synthesizeInsight({
      budgetEval,
      velocityAnalysis,
      anomalyAudit,
      rebalancePlan,
      diagnostics,
      specialistResponse
    });

    const activeInterventions = this.generateInterventions({
      budgetEval,
      velocityAnalysis,
      anomalyAudit,
      rebalancePlan,
      specialistResponse
    });

    return {
      agent: 'Nova',
      version: '4.0.0',
      role: 'Active Real-Time Sub-Agent (Budget Tracker and Category Guardian)',
      timestamp: new Date().toISOString(),
      snapshot_id: snapshot.snapshot_id,
      task_packet: packet,
      specialist_response: specialistResponse,
      temporal_context: velocityAnalysis.temporal,
      cognitive_synthesis: cognitiveInsight,
      diagnostics,
      velocity: velocityAnalysis,
      anomalies: anomalyAudit,
      rebalance_proposal: rebalancePlan,
      active_interventions: activeInterventions,
      ground_truth_metrics: {
        income: budgetEval.cashflow.monthly_income,
        fixed_housing: budgetEval.cashflow.fixed_housing_expense,
        total_spent: budgetEval.cashflow.variable_spend,
        net_surplus: budgetEval.cashflow.net_surplus,
        savings_rate: budgetEval.cashflow.savings_rate_pct,
        overall_utilization_pct: budgetEval.summary.overall_budget_utilization_pct,
        uncategorized_spent: budgetEval.uncategorized?.spent_total || 0
      }
    };
  }

  static orientDiagnostics({ budgetEval, velocityAnalysis, anomalyAudit, recentTxns }) {
    const exceeded = budgetEval.categories.filter(c => c.status === 'exceeded');
    const warnings = budgetEval.categories.filter(c => c.status === 'warning');
    const highBurn = velocityAnalysis.category_pacing.filter(p => p.risk_level === 'HIGH' && p.is_capped);

    const diningTxs = recentTxns.filter(t => t.category === 'Food & Dining');
    const largeDiningBills = diningTxs.filter(t => t.amount > 2000);
    const microDiningCount = diningTxs.filter(t => t.amount <= 1000).length;

    let diningRootCause = 'BALANCED';
    if (largeDiningBills.length > 0) {
      diningRootCause = `Concentrated in ${largeDiningBills.length} high-ticket event(s) totaling ₹${largeDiningBills.reduce((s, t) => s + t.amount, 0).toLocaleString()}`;
    } else if (microDiningCount >= 5) {
      diningRootCause = `Frequent micro-swipes (${microDiningCount} transactions under ₹1,000)`;
    }

    return {
      breached_category_count: exceeded.length,
      warning_category_count: warnings.length,
      accelerating_categories: highBurn.map(h => h.category),
      dining_behavioral_pattern: diningRootCause,
      total_anomalies_flagged: anomalyAudit.anomaly_count
    };
  }

  static async synthesizeInsight({ budgetEval, velocityAnalysis, anomalyAudit, rebalancePlan, diagnostics, specialistResponse }) {
    const ctx = {
      monthly_income: budgetEval.cashflow.monthly_income,
      fixed_housing: budgetEval.cashflow.fixed_housing_expense,
      net_surplus: budgetEval.cashflow.net_surplus,
      savings_rate: budgetEval.cashflow.savings_rate_pct,
      day_of_month: velocityAnalysis.temporal.current_day,
      days_remaining: velocityAnalysis.temporal.days_remaining,
      daily_envelope: specialistResponse.daily_spending_envelope?.headline_amount ?? velocityAnalysis.envelopes.headline_daily_envelope,
      exceeded_categories: budgetEval.categories.filter(c => c.status === 'exceeded').map(c => `${c.category} (${c.used_pct}%, cap ₹${c.monthly_cap})`),
      warning_categories: budgetEval.categories.filter(c => c.status === 'warning').map(c => `${c.category} (${c.used_pct}%, cap ₹${c.monthly_cap})`),
      rebalance_solution: rebalancePlan.has_proposals ? rebalancePlan.moves.map(m => `${m.from_category} -> ${m.to_category} (₹${m.amount})`).join(', ') : 'None needed',
      anomalies: anomalyAudit.anomalies.map(a => a.title)
    };

    return this.buildLocalCognitiveSynthesis(ctx, diagnostics);
  }

  static buildLocalCognitiveSynthesis(ctx, diag) {
    const hasBreaches = ctx.exceeded_categories.length > 0;
    const hasWarnings = ctx.warning_categories.length > 0;

    let verdict = 'HEALTHY';
    let execSummary = '';
    let rootCause = '';
    const actions = [];
    let johnBrief = '';

    if (hasBreaches) {
      verdict = 'GUARDED';
      execSummary = `Nova has identified active budget cap breaches in ${ctx.exceeded_categories.join(', ')}. Discretionary cash flow buffer is currently at ₹${ctx.net_surplus.toLocaleString()} (${ctx.savings_rate}% savings rate).`;
      rootCause = `Spending acceleration is primarily driven by ${diag.dining_behavioral_pattern}. With ${ctx.days_remaining} days remaining in the billing cycle, pacing requires immediate reallocation.`;

      if (ctx.rebalance_solution !== 'None needed') {
        actions.push(`Propose zero-sum rebalance: ${ctx.rebalance_solution} (requires user confirmation token via Action Service).`);
      }
      actions.push(`Cap daily variable spending at ₹${ctx.daily_envelope}/day across flexible categories for the next ${ctx.days_remaining} days.`);

      johnBrief = `Present the verified Sentinel figures plainly. While ${ctx.exceeded_categories[0]} exceeded cap, net surplus of ₹${ctx.net_surplus.toLocaleString()} remains intact. Present the APPLY_REBALANCE confirmation card.`;
    } else if (hasWarnings) {
      verdict = 'MONITORING';
      execSummary = `Nova warns that ${ctx.warning_categories.join(', ')} has entered the Warning tier (80%–100%). Overall monthly budget remains on track with ₹${ctx.net_surplus.toLocaleString()} in projected surplus.`;
      rootCause = `Mid-month consumption pace is elevated on discretionary categories.`;
      actions.push(`Maintain daily discretionary spend within ₹${ctx.daily_envelope}/day.`);
      johnBrief = `Share the 80% warning boundary status and safe daily spending envelope of ₹${ctx.daily_envelope}/day.`;
    } else {
      verdict = 'HEALTHY';
      execSummary = `Nova confirms all budget categories are strictly within Healthy limits (<80%). Projected month-end surplus is ₹${ctx.net_surplus.toLocaleString()} (${ctx.savings_rate}% savings rate).`;
      rootCause = `Spending velocity is well below critical thresholds across all tracked categories.`;
      actions.push(`Continue current daily spending envelope of ₹${ctx.daily_envelope}/day.`);
      johnBrief = `Confirm healthy status across all caps and reinforce progress toward monthly savings goals.`;
    }

    return {
      executive_summary: execSummary,
      root_cause_analysis: rootCause,
      guardian_verdict: verdict,
      actionable_recommendations: actions,
      briefing_for_john: johnBrief
    };
  }

  static generateInterventions({ budgetEval, velocityAnalysis, anomalyAudit, rebalancePlan, specialistResponse }) {
    const interventions = [];
    const envelopeAmount = specialistResponse?.daily_spending_envelope?.headline_amount ?? velocityAnalysis.envelopes.headline_daily_envelope;

    interventions.push({
      type: 'DAILY_ENVELOPE',
      title: `Daily Spending Envelope: ₹${envelopeAmount.toLocaleString()}/day`,
      description: `To preserve your ₹${budgetEval.cashflow.net_surplus.toLocaleString()} monthly savings surplus, maintain daily discretionary spend under ₹${envelopeAmount.toLocaleString()} for the remaining ${velocityAnalysis.temporal.days_remaining} days.`,
      impact_amount: envelopeAmount,
      category: 'Global',
      action_payload: JSON.stringify({ dailyLimit: envelopeAmount, daysRemaining: velocityAnalysis.temporal.days_remaining })
    });

    if (rebalancePlan.has_proposals) {
      const topMove = rebalancePlan.moves[0];
      interventions.push({
        type: 'REBALANCE',
        title: `Propose Rebalance: Shift ₹${topMove.amount.toLocaleString()} from ${topMove.from_category}`,
        description: topMove.reasoning,
        impact_amount: topMove.amount,
        category: topMove.to_category,
        action_payload: JSON.stringify(topMove)
      });
    }

    for (const anom of anomalyAudit.anomalies) {
      interventions.push({
        type: anom.type,
        title: anom.title,
        description: anom.description,
        impact_amount: anom.impact_amount,
        category: anom.merchant || anom.category || 'Discretionary',
        action_payload: JSON.stringify(anom)
      });
    }

    return interventions;
  }
}

module.exports = NovaAgentBrain;
