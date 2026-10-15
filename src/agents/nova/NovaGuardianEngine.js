/**
 * NovaGuardianEngine — V4 Facade Integrating Tally, Sentinel, ThresholdJob & NovaAgent
 *
 * Delegates all mathematical calculations to Sentinel (`sentinel_run_category_utilization`,
 * `sentinel_run_velocity_projection`) and routes ingestion through Tally (`categorization.updated`)
 * and the deterministic `ThresholdJob`.
 */

const {
  SentinelEngine,
  SnapshotManager,
  determineTier,
  VelocityPredictor
} = require('../../tools/sentinel');
const { defaultTallyService, TallyCategorizer } = require('../../tools/tally/TallyService');
const { defaultThresholdJob } = require('../../tools/threshold-job/ThresholdJob');

// Ensure ThresholdJob is bound to Tally's categorization.updated events
if (defaultTallyService.listenerCount('categorization.updated') === 0) {
  defaultThresholdJob.bindToTally(defaultTallyService);
}

class NovaGuardianEngine {
  /**
   * V4 Tier Thresholds (Section 4):
   * - Healthy: below 80% (< 80%)
   * - Warning: from 80% to 100% (80% <= pct <= 100%)
   * - Exceeded: above 100% (> 100%)
   */
  static determineStatus(pct) {
    return determineTier(pct);
  }

  static getCurrentMonth() {
    return new Date().toISOString().slice(0, 7);
  }

  /**
   * Computes complete budget evaluation by creating a Sentinel snapshot and invoking
   * `sentinel_run_category_utilization`.
   */
  static evaluateBudget(userId, month = null, db) {
    const targetMonth = month || this.getCurrentMonth();
    const snapshot = SnapshotManager.createSnapshot(userId, db, { month: targetMonth });
    const util = SentinelEngine.runCategoryUtilization({ snapshot_id: snapshot.snapshot_id });

    const alerts = [];
    util.capped_categories.forEach(cat => {
      const provTag = cat.tier_is_provisional ? ' [PROVISIONAL — Needs Review]' : '';
      if (cat.tier === 'exceeded') {
        alerts.push({
          severity: 'CRITICAL',
          type: 'LIMIT_EXCEEDED',
          category_id: cat.category_id,
          category: cat.category,
          provisional: Boolean(cat.tier_is_provisional),
          review_queue_url: cat.tier_is_provisional ? '/api/transactions/review-queue' : null,
          tool_result_id: cat.tool_result_id,
          message: `Nova Alert${provTag}: Spending in "${cat.category}" is at ${cat.used_pct}% (Spent: ₹${cat.spent_total.toLocaleString()} / Limit: ₹${cat.monthly_cap.toLocaleString()}). Cap breached by ₹${Math.abs(cat.remaining).toLocaleString()}.`,
          actionRequired: cat.tier_is_provisional
            ? 'Review provisional transactions in the review queue before confirming breach.'
            : 'Propose zero-sum rebalance or freeze non-essential expenses in this bucket.'
        });
      } else if (cat.tier === 'warning') {
        alerts.push({
          severity: 'WARNING',
          type: 'APPROACHING_LIMIT',
          category_id: cat.category_id,
          category: cat.category,
          provisional: Boolean(cat.tier_is_provisional),
          review_queue_url: cat.tier_is_provisional ? '/api/transactions/review-queue' : null,
          tool_result_id: cat.tool_result_id,
          message: `Nova Warning${provTag}: "${cat.category}" has reached ${cat.used_pct}% of its monthly allocation with ₹${cat.remaining.toLocaleString()} remaining.`,
          actionRequired: 'Monitor upcoming purchases closely.'
        });
      }
    });

    return {
      agent: 'Nova',
      version: '4.0.0',
      role: 'Active Real-Time Sub-Agent (Budget Tracker and Category Guardian)',
      snapshot_id: snapshot.snapshot_id,
      categorization_version: snapshot.categorization_version,
      month: targetMonth,
      summary: util.summary,
      cashflow: util.cashflow,
      uncategorized: util.uncategorized,
      categories: util.categories,
      alerts
    };
  }

  /**
   * Ingests a transaction via Tally (`categorization.updated` event) so the deterministic
   * ThresholdJob recomputes touched categories and deduplicates alerts.
   */
  static processNewExpense(userId, payload, db) {
    const { rawDescription, amount, category, categorization_status, txnDate } = payload || {};
    if (!rawDescription || amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error('Valid rawDescription and positive numeric amount are required.');
    }

    const batchRes = defaultTallyService.ingestBatch(
      userId,
      [
        {
          rawDescription,
          amount: Number(amount),
          category: category || TallyCategorizer.categorize(rawDescription),
          categorization_status: categorization_status || 'SETTLED',
          txnDate
        }
      ],
      db
    );

    const txId = batchRes.event.transaction_ids[0];
    const insertedTxn = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(txId);
    const resolvedCategory = insertedTxn ? insertedTxn.category : (category || TallyCategorizer.categorize(rawDescription));

    const util = SentinelEngine.runCategoryUtilization({
      snapshot_id: batchRes.snapshot.snapshot_id,
      category: resolvedCategory
    });

    let thresholdAlert = null;
    const catEval = util.category;
    if (catEval && catEval.is_capped) {
      if (catEval.tier === 'exceeded') {
        thresholdAlert = {
          triggered: true,
          level: 'EXCEEDED',
          provisional: Boolean(catEval.tier_is_provisional),
          tool_result_id: catEval.tool_result_id,
          message: `🚨 [Nova Guardian] Transaction of ₹${Number(amount).toLocaleString()} in "${resolvedCategory}" has breached budget cap! Current: ${catEval.utilization_pct}% (₹${catEval.spent_total.toLocaleString()}/₹${catEval.monthly_cap.toLocaleString()}).`
        };
      } else if (catEval.tier === 'warning') {
        thresholdAlert = {
          triggered: true,
          level: 'WARNING',
          provisional: Boolean(catEval.tier_is_provisional),
          tool_result_id: catEval.tool_result_id,
          message: `⚠️ [Nova Guardian] Transaction of ₹${Number(amount).toLocaleString()} puts "${resolvedCategory}" into warning zone at ${catEval.utilization_pct}% (₹${catEval.spent_total.toLocaleString()}/₹${catEval.monthly_cap.toLocaleString()}).`
        };
      }
    }

    return {
      success: true,
      transaction: insertedTxn,
      derived_category: resolvedCategory,
      snapshot_id: batchRes.snapshot.snapshot_id,
      categorization_event: batchRes.event,
      thresholdAlert
    };
  }

  /**
   * Generates Nova Telemetry Trace to share with John
   */
  static generateTelemetry(userId, db) {
    const evaluation = this.evaluateBudget(userId, null, db);
    const exceeded = evaluation.categories.filter(c => c.status === 'exceeded');
    const warnings = evaluation.categories.filter(c => c.status === 'warning');

    let insightText = '';
    if (exceeded.length > 0) {
      const names = exceeded.map(e => `${e.category} (${e.used_pct}%)`).join(', ');
      insightText = `Nova flags that ${exceeded.length} category cap(s) are breached: ${names}. Remaining discretionary buffer is ₹${evaluation.cashflow.net_surplus.toLocaleString()}.`;
    } else if (warnings.length > 0) {
      const names = warnings.map(w => `${w.category} (${w.used_pct}%)`).join(', ');
      insightText = `Nova warns that ${warnings.length} category cap(s) are in warning tier: ${names}.`;
    } else {
      insightText = `Nova confirmed all ${evaluation.summary.capped_categories} category budgets are operating within healthy limits. Surplus: ₹${evaluation.cashflow.net_surplus.toLocaleString()}.`;
    }

    const velocity = VelocityPredictor.analyzeVelocity(evaluation.categories);

    return {
      agent: 'Nova',
      version: '4.0.0',
      badgeClass: 'badge-nova',
      title: 'Nova Real-Time Budget Guardian Check',
      timestamp: new Date().toISOString(),
      snapshot_id: evaluation.snapshot_id,
      activeAlertsCount: evaluation.alerts.length,
      metrics: {
        surplus: evaluation.cashflow.net_surplus,
        utilizationPct: evaluation.summary.overall_budget_utilization_pct,
        exceededCategories: exceeded.map(c => c.category),
        warningCategories: warnings.map(c => c.category),
        dailyEnvelope: velocity.envelopes.headline_daily_envelope,
        safeDailyEnvelope: velocity.envelopes.safe_daily_envelope,
        conservativeDailyEnvelope: velocity.envelopes.conservative_daily_envelope,
        daysRemaining: velocity.temporal.days_remaining
      },
      reasoningTrace: insightText,
      velocity: {
        dailyBurnRate: velocity.overall.daily_burn_rate,
        projectedSpend: velocity.overall.projected_month_end_spend,
        status: velocity.overall.status,
        confidence: velocity.confidence
      }
    };
  }

  static async evaluateAgentState(userId, db) {
    const NovaAgentBrain = require('./NovaAgentBrain');
    return await NovaAgentBrain.runCognitiveCycle(userId, db);
  }
}

module.exports = NovaGuardianEngine;
