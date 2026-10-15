/**
 * sentinel_run_velocity_projection — Section 6 Sentinel Function #3
 *
 * Purpose: Burn rate, projected month-end spend, pacing, safe and conservative envelopes, confidence.
 * Inputs: category_scope, days_remaining, snapshot_id, category_evaluations (optional)
 * Returns: Burn rate, projection, pacing, envelopes (safe & conservative), confidence, tool_result_id
 *
 * V4 Margin of Safety Rule (Section 5.3, 6, 9, 13 #8, 14 #6):
 * - Computes both `safe_daily_spend_envelope` and `conservative_daily_spend_envelope` (20% safety buffer).
 * - Supplies `confidence` ('high' | 'medium' | 'low').
 * - When `confidence !== 'high'`, the conservative envelope is the headline value in 100% of cases.
 */

const SnapshotManager = require('./SnapshotManager');
const { sentinel_run_category_utilization } = require('./runCategoryUtilization');

let velSeq = 1;

function analyzeVelocityFromCategories(categoryEvaluations = [], options = {}) {
  const now = options.currentDate ? new Date(options.currentDate) : new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayOfMonth = options.dayOfMonth || now.getDate();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const daysRemaining = options.days_remaining != null
    ? Math.max(1, Number(options.days_remaining))
    : Math.max(1, totalDaysInMonth - dayOfMonth);
  const monthProgressPct = Math.round((dayOfMonth / totalDaysInMonth) * 100);

  const confidence = options.confidence || 'high';
  const safetyFactor = 0.8; // 20% margin of safety for conservative envelope

  const pacingResults = categoryEvaluations.map(cat => {
    const spent = Number(cat.spent_total ?? cat.spent ?? 0);
    const cap = Number(cat.monthly_cap || 0);
    const usedPct = cat.utilization_pct ?? cat.used_pct ?? (cap > 0 ? Math.round((spent / cap) * 100) : 0);

    if (!cap || cap <= 0) {
      return {
        category_id: cat.category_id || cat.category,
        category: cat.category,
        is_capped: false,
        spent,
        daily_burn_rate: Number((spent / Math.max(1, dayOfMonth)).toFixed(2)),
        projected_month_end_spend: Math.round((spent / Math.max(1, dayOfMonth)) * totalDaysInMonth),
        velocity_status: 'UNCAPPED'
      };
    }

    const dailyBurnRate = Number((spent / Math.max(1, dayOfMonth)).toFixed(2));
    const projectedMonthEnd = Math.round(dailyBurnRate * totalDaysInMonth);
    const projectedUsedPct = Math.round((projectedMonthEnd / cap) * 100);
    const remainingAllowance = Math.max(0, cap - spent);
    const safeDailySpend = Number((remainingAllowance / daysRemaining).toFixed(2));
    const conservativeDailySpend = Number((safeDailySpend * safetyFactor).toFixed(2));

    let velocityStatus = 'ON_TRACK';
    let riskLevel = 'LOW';

    if (projectedUsedPct >= 120 || usedPct > 100) {
      velocityStatus = 'CRITICAL_ACCELERATION';
      riskLevel = 'HIGH';
    } else if (projectedUsedPct >= 95 || usedPct >= 80) {
      velocityStatus = 'ELEVATED_PACING';
      riskLevel = 'MEDIUM';
    }

    return {
      category_id: cat.category_id || cat.category,
      category: cat.category,
      is_capped: true,
      monthly_cap: cap,
      spent,
      used_pct: usedPct,
      daily_burn_rate: dailyBurnRate,
      projected_month_end_spend: projectedMonthEnd,
      projected_used_pct: projectedUsedPct,
      projected_overrun: Math.max(0, projectedMonthEnd - cap),
      safe_daily_spend: safeDailySpend,
      conservative_daily_spend: conservativeDailySpend,
      headline_daily_spend: confidence === 'high' ? safeDailySpend : conservativeDailySpend,
      days_until_breach: dailyBurnRate > 0 ? Math.max(0, Math.floor(remainingAllowance / dailyBurnRate)) : daysRemaining,
      velocity_status: velocityStatus,
      risk_level: riskLevel
    };
  });

  const highRiskCategories = pacingResults.filter(p => p.risk_level === 'HIGH' && p.is_capped);
  const elevatedCategories = pacingResults.filter(p => p.risk_level === 'MEDIUM' && p.is_capped);

  const totalCappedSpend = pacingResults.filter(p => p.is_capped).reduce((sum, p) => sum + p.spent, 0);
  const totalCappedLimit = pacingResults.filter(p => p.is_capped).reduce((sum, p) => sum + p.monthly_cap, 0);
  const overallDailyBurnRate = Number((totalCappedSpend / Math.max(1, dayOfMonth)).toFixed(2));
  const overallProjectedSpend = Math.round(overallDailyBurnRate * totalDaysInMonth);
  const overallSafeDaily = Number((Math.max(0, totalCappedLimit - totalCappedSpend) / daysRemaining).toFixed(2));
  const overallConservativeDaily = Number((overallSafeDaily * safetyFactor).toFixed(2));
  const headlineDailyEnvelope = confidence === 'high' ? overallSafeDaily : overallConservativeDaily;

  return {
    tool_result_id: options.tool_result_id || `res_vel_${velSeq++}`,
    confidence,
    temporal: {
      current_day: dayOfMonth,
      total_days: totalDaysInMonth,
      days_remaining: daysRemaining,
      month_progress_pct: monthProgressPct
    },
    envelopes: {
      safe_daily_envelope: overallSafeDaily,
      conservative_daily_envelope: overallConservativeDaily,
      headline_daily_envelope: headlineDailyEnvelope,
      headline_mode: confidence === 'high' ? 'safe' : 'conservative'
    },
    overall: {
      daily_burn_rate: overallDailyBurnRate,
      projected_month_end_spend: overallProjectedSpend,
      projected_overrun: Math.max(0, overallProjectedSpend - totalCappedLimit),
      safe_daily_spend_envelope: overallSafeDaily,
      conservative_daily_spend_envelope: overallConservativeDaily,
      headline_daily_spend_envelope: headlineDailyEnvelope,
      status: overallProjectedSpend > totalCappedLimit ? 'OVERRUN_PROJECTED' : 'WITHIN_BOUNDS'
    },
    category_pacing: pacingResults,
    high_risk_count: highRiskCategories.length,
    elevated_risk_count: elevatedCategories.length
  };
}

function sentinel_run_velocity_projection({
  snapshot_id = null,
  category_scope = null,
  days_remaining = null,
  category_evaluations = null,
  current_date = null,
  confidence = null
} = {}) {
  let categoriesToUse = category_evaluations;
  let derivedConfidence = confidence || 'high';
  let snapId = snapshot_id || 'inline';

  if (snapshot_id) {
    const snapshot = SnapshotManager.getSnapshot(snapshot_id);
    if (!snapshot) {
      const err = new Error(`Sentinel snapshot "${snapshot_id}" not found.`);
      err.code = 'SNAPSHOT_NOT_FOUND';
      throw err;
    }
    if (snapshot.simulate_timeout) {
      const err = new Error('Sentinel timeout while computing velocity projection.');
      err.code = 'SENTINEL_TIMEOUT';
      throw err;
    }

    const util = sentinel_run_category_utilization({ snapshot_id, category: category_scope });
    categoriesToUse = category_scope && util.category ? [util.category] : util.categories;

    const hasProvisional = util.categories.some(c => (c.spent_provisional || 0) > 0);
    if (snapshot.confidence_override) {
      derivedConfidence = snapshot.confidence_override;
    } else if (snapshot.import_in_progress || util.uncategorized.is_material) {
      derivedConfidence = 'low';
    } else if (hasProvisional) {
      derivedConfidence = 'medium';
    }
  }

  const toolResultId = `res_vel_${snapId}_${velSeq++}`;
  return analyzeVelocityFromCategories(categoriesToUse || [], {
    days_remaining,
    currentDate: current_date,
    confidence: derivedConfidence,
    tool_result_id: toolResultId
  });
}

class VelocityPredictor {
  static analyzeVelocity(categoryEvaluations, currentDate = null, options = {}) {
    return analyzeVelocityFromCategories(categoryEvaluations, {
      ...options,
      currentDate
    });
  }
}

module.exports = {
  sentinel_run_velocity_projection,
  VelocityPredictor
};
