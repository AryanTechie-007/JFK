/**
 * AlertHygieneStore — Stateful Tier & Alert Deduplication Store for the Threshold Job
 *
 * Implements Section 4 Step 3, Section 9 (Alert hygiene), Section 12, and Section 13 (#1, #2, #7, #10, #11):
 * - Tracks processed `event_id`s to deduplicate repeated events.
 * - Tracks the last stored tier per `(user_id, category_id)`.
 * - Creates, updates, or resolves an alert ONLY on a tier change.
 * - Dismissed alerts stay dismissed until the category escalates to a worse tier.
 */

const TIER_SEVERITY_RANK = Object.freeze({
  healthy: 0,
  warning: 1,
  exceeded: 2
});

class AlertHygieneStore {
  constructor() {
    this.processedEventIds = new Set();
    // Key: `${userId}::${categoryId}` -> { tier, alert_id, dismissed_at_tier }
    this.categoryTierState = new Map();
    // Key: alert_id -> alert object
    this.alertsById = new Map();
    this.alertSeq = 1;
  }

  hasProcessedEvent(eventId) {
    return Boolean(eventId && this.processedEventIds.has(eventId));
  }

  markEventProcessed(eventId) {
    if (eventId) {
      this.processedEventIds.add(eventId);
    }
  }

  getKey(userId, categoryId) {
    return `${userId || 'default'}::${categoryId}`;
  }

  getCategoryState(userId, categoryId) {
    return this.categoryTierState.get(this.getKey(userId, categoryId)) || {
      tier: 'healthy',
      alert_id: null,
      dismissed_at_tier: null
    };
  }

  /**
   * Evaluates a category's newly computed utilization result against the last stored tier.
   * Returns { changed, transition_type, alert, invoke_nova }
   */
  evaluateTierTransition(userId, catUtil, context = {}) {
    const categoryId = catUtil.category_id || catUtil.category;
    const key = this.getKey(userId, categoryId);
    const prevState = this.getCategoryState(userId, categoryId);

    const prevTier = prevState.tier || 'healthy';
    const newTier = catUtil.tier || 'healthy';
    const prevRank = TIER_SEVERITY_RANK[prevTier] ?? 0;
    const newRank = TIER_SEVERITY_RANK[newTier] ?? 0;

    // 1. No tier change -> deduplicate! Do not create duplicate alert or re-invoke Nova
    if (newTier === prevTier) {
      const existingAlert = prevState.alert_id ? this.alertsById.get(prevState.alert_id) : null;
      if (existingAlert && existingAlert.status === 'OPEN') {
        // Update live utilization figures in place without generating a duplicate alert
        existingAlert.utilization_pct = catUtil.utilization_pct;
        existingAlert.spent_total = catUtil.spent_total;
        existingAlert.spent_settled = catUtil.spent_settled;
        existingAlert.spent_provisional = catUtil.spent_provisional;
        existingAlert.provisional = Boolean(catUtil.tier_is_provisional);
        existingAlert.tool_result_id = catUtil.tool_result_id;
        existingAlert.snapshot_id = context.snapshot_id || existingAlert.snapshot_id;
      }
      return {
        changed: false,
        transition_type: 'NO_CHANGE',
        previous_tier: prevTier,
        new_tier: newTier,
        alert: existingAlert || null,
        invoke_nova: false
      };
    }

    // 2. Check if previously dismissed at this tier or higher
    if (prevState.dismissed_at_tier) {
      const dismissedRank = TIER_SEVERITY_RANK[prevState.dismissed_at_tier] ?? 0;
      if (newRank > 0 && newRank <= dismissedRank) {
        // Stay dismissed until a worse tier!
        this.categoryTierState.set(key, {
          ...prevState,
          tier: newTier
        });
        return {
          changed: true,
          transition_type: 'SUPPRESSED_BY_DISMISSAL',
          previous_tier: prevTier,
          new_tier: newTier,
          alert: null,
          invoke_nova: false
        };
      }
    }

    const causedByCorrection = Boolean(context.is_correction);
    const correctionClause = causedByCorrection
      ? ' (Updated following a transaction category change.)'
      : '';

    // 3. Resolution: dropped back to healthy from warning/exceeded
    if (newTier === 'healthy' && prevRank > 0) {
      let resolvedAlert = prevState.alert_id ? this.alertsById.get(prevState.alert_id) : null;
      if (resolvedAlert) {
        resolvedAlert.status = 'RESOLVED';
        resolvedAlert.tier = 'healthy';
        resolvedAlert.previous_tier = prevTier;
        resolvedAlert.utilization_pct = catUtil.utilization_pct;
        resolvedAlert.caused_by_correction = causedByCorrection;
        resolvedAlert.resolved_at = new Date().toISOString();
        resolvedAlert.message = causedByCorrection
          ? `Alert resolved for "${catUtil.category}": a transaction category change reduced utilization from ${prevTier.toUpperCase()} to ${catUtil.utilization_pct}% (Healthy).`
          : `Alert resolved for "${catUtil.category}": utilization is now ${catUtil.utilization_pct}% (Healthy).`;
      } else {
        const resId = `alert_${this.alertSeq++}`;
        resolvedAlert = {
          alert_id: resId,
          user_id: userId,
          category_id: categoryId,
          category: catUtil.category,
          previous_tier: prevTier,
          tier: 'healthy',
          status: 'RESOLVED',
          provisional: false,
          caused_by_correction: causedByCorrection,
          utilization_pct: catUtil.utilization_pct,
          tool_result_id: catUtil.tool_result_id,
          snapshot_id: context.snapshot_id,
          resolved_at: new Date().toISOString(),
          message: `Alert resolved for "${catUtil.category}"${correctionClause}`
        };
        this.alertsById.set(resId, resolvedAlert);
      }

      this.categoryTierState.set(key, {
        tier: 'healthy',
        alert_id: resolvedAlert.alert_id,
        dismissed_at_tier: null
      });

      return {
        changed: true,
        transition_type: 'RESOLVED',
        previous_tier: prevTier,
        new_tier: 'healthy',
        alert: resolvedAlert,
        invoke_nova: false
      };
    }

    // 4. Escalation or De-escalation between Warning and Exceeded, or Healthy -> Warning/Exceeded
    const isProvisional = Boolean(
      catUtil.tier_is_provisional ||
      (context.import_in_progress && catUtil.spent_provisional > 0)
    );
    const provisionalPrefix = isProvisional ? '[PROVISIONAL — Needs Review] ' : '';
    const provisionalNote = isProvisional
      ? ` This ${newTier.toUpperCase()} tier depends on ₹${catUtil.spent_provisional.toLocaleString()} in provisional (NEEDS_REVIEW) transactions. Review items at /api/transactions/review-queue.`
      : '';

    const alertId = prevState.alert_id && this.alertsById.get(prevState.alert_id)?.status === 'OPEN'
      ? prevState.alert_id
      : `alert_${this.alertSeq++}`;

    const transitionType = prevRank === 0 ? 'CREATED' : 'UPDATED';
    const alertObj = {
      alert_id: alertId,
      user_id: userId,
      category_id: categoryId,
      category: catUtil.category,
      previous_tier: prevTier,
      tier: newTier,
      severity: newTier === 'exceeded' ? 'CRITICAL' : 'WARNING',
      status: 'OPEN',
      provisional: isProvisional,
      review_queue_url: isProvisional ? '/api/transactions/review-queue' : null,
      caused_by_correction: causedByCorrection,
      utilization_pct: catUtil.utilization_pct,
      monthly_cap: catUtil.monthly_cap,
      spent_total: catUtil.spent_total,
      spent_settled: catUtil.spent_settled,
      spent_provisional: catUtil.spent_provisional,
      remaining: catUtil.remaining,
      tool_result_id: catUtil.tool_result_id,
      snapshot_id: context.snapshot_id || null,
      created_at: new Date().toISOString(),
      llm_narrative: null, // Populated asynchronously by Nova in Step 5; alert is visible immediately from Step 3!
      message: `${provisionalPrefix}${catUtil.category} is in ${newTier.toUpperCase()} tier at ${catUtil.utilization_pct}% (₹${catUtil.spent_total.toLocaleString()} / ₹${catUtil.monthly_cap.toLocaleString()}).${correctionClause}${provisionalNote}`.trim()
    };

    this.alertsById.set(alertId, alertObj);
    this.categoryTierState.set(key, {
      tier: newTier,
      alert_id: alertId,
      dismissed_at_tier: prevState.dismissed_at_tier
    });

    return {
      changed: true,
      transition_type: transitionType,
      previous_tier: prevTier,
      new_tier: newTier,
      alert: alertObj,
      invoke_nova: newTier === 'warning' || newTier === 'exceeded'
    };
  }

  /**
   * Dismisses an alert. It stays dismissed until the category escalates to a worse tier.
   */
  dismissAlert(alertId) {
    const alert = this.alertsById.get(alertId);
    if (!alert) return null;

    alert.status = 'DISMISSED';
    alert.dismissed_at = new Date().toISOString();

    const key = this.getKey(alert.user_id, alert.category_id);
    const state = this.getCategoryState(alert.user_id, alert.category_id);
    this.categoryTierState.set(key, {
      ...state,
      dismissed_at_tier: alert.tier
    });

    return alert;
  }

  /**
   * Creates a manual dashboard alert (e.g., from CREATE_ALERT proposal on anomaly).
   */
  createCustomAlert(userId, payload = {}) {
    const alertId = `alert_${this.alertSeq++}`;
    const alertObj = {
      alert_id: alertId,
      user_id: userId,
      category_id: payload.category_id || payload.category || 'cat_subscriptions',
      category: payload.category || 'Subscriptions',
      tier: payload.tier || 'anomaly',
      severity: payload.severity || 'WARNING',
      status: 'OPEN',
      provisional: Boolean(payload.provisional),
      tool_result_id: payload.tool_result_id || null,
      snapshot_id: payload.snapshot_id || null,
      created_at: new Date().toISOString(),
      message: payload.message || payload.title || 'Anomaly Alert'
    };
    this.alertsById.set(alertId, alertObj);
    return alertObj;
  }

  getOpenAlerts(userId = null) {
    return Array.from(this.alertsById.values()).filter(
      a => a.status === 'OPEN' && (!userId || a.user_id === userId)
    );
  }

  getAllAlerts(userId = null) {
    return Array.from(this.alertsById.values()).filter(
      a => !userId || a.user_id === userId
    );
  }

  reset() {
    this.processedEventIds.clear();
    this.categoryTierState.clear();
    this.alertsById.clear();
  }
}

const defaultAlertStore = new AlertHygieneStore();

module.exports = {
  AlertHygieneStore,
  defaultAlertStore,
  TIER_SEVERITY_RANK
};
