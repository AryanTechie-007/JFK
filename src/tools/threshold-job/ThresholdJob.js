/**
 * ThresholdJob — Deterministic Breach Detection Background Worker (Section 4)
 *
 * Implements Steps 1–4 of the Real-Time Architecture:
 * 1. Triggered by Tally's `categorization.updated` event (never raw ingestion).
 * 2. Recomputes utilization for every category touched, including the PREVIOUS category
 *    of any corrected transaction.
 * 3. Compares with the last stored tier and creates, updates, or resolves an alert
 *    ONLY on a tier change (deduplicated).
 * 4. The alert is immediately visible from Step 3 without any LLM call having completed.
 *    For a new Warning or Exceeded alert, John invokes Nova with `task_type: breach_event`.
 */

const { sentinel_run_category_utilization } = require('../sentinel/runCategoryUtilization');
const SnapshotManager = require('../sentinel/SnapshotManager');
const TaxonomyRegistry = require('../tally/TaxonomyRegistry');
const { AlertHygieneStore, defaultAlertStore } = require('./AlertHygieneStore');

class ThresholdJob {
  constructor(alertStore = defaultAlertStore, orchestratorGetter = null) {
    this.alertStore = alertStore;
    this.orchestratorGetter = orchestratorGetter;
  }

  setOrchestratorGetter(fn) {
    this.orchestratorGetter = fn;
  }

  /**
   * Attaches listener to a TallyService instance for `categorization.updated`.
   */
  bindToTally(tallyService) {
    tallyService.on('categorization.updated', (event) => {
      try {
        this.handleCategorizationUpdated(event);
      } catch (err) {
        console.error('[ThresholdJob] Error handling categorization.updated:', err.message);
      }
    });
  }

  /**
   * Synchronously executes Steps 2 & 3 (deterministic utilization + alert creation/resolution),
   * and optionally triggers Step 4 (John -> Nova `breach_event`).
   */
  handleCategorizationUpdated(event = {}, options = {}) {
    const startTimeMs = Date.now();
    const userId = event.user_id || 'user_demo_nova';
    const eventId = event.event_id;

    // Section 12 & 13 #7: Duplicate or repeated event -> Job deduplicates; Nova is not re-invoked
    if (eventId && this.alertStore.hasProcessedEvent(eventId)) {
      return {
        deduplicated: true,
        event_id: eventId,
        snapshot_id: event.snapshot_id,
        transitions: [],
        active_alerts: this.alertStore.getOpenAlerts(userId),
        nova_invoked: false,
        detection_latency_ms: Date.now() - startTimeMs
      };
    }

    if (eventId) {
      this.alertStore.markEventProcessed(eventId);
    }

    let utilResult;
    try {
      utilResult = sentinel_run_category_utilization({
        snapshot_id: event.snapshot_id
      });
    } catch (err) {
      // Section 12: Sentinel error or timeout -> alert from job still shows tier data from last good snapshot, labeled with its age
      const lastGood = SnapshotManager.getLastGoodSnapshot(userId);
      const fallbackAlerts = this.alertStore.getOpenAlerts(userId).map(a => ({
        ...a,
        from_last_good_snapshot: true,
        snapshot_age_label: lastGood ? lastGood.age_label : 'unknown age'
      }));
      return {
        deduplicated: false,
        error: err.message,
        error_code: err.code || 'SENTINEL_ERROR',
        fallback_snapshot: lastGood,
        transitions: [],
        active_alerts: fallbackAlerts,
        nova_invoked: false,
        detection_latency_ms: Date.now() - startTimeMs
      };
    }

    // Collect every touched category, explicitly including previous_categories from corrections
    const touchedSet = new Set([
      ...(event.touched_categories || []),
      ...(event.previous_categories || [])
    ]);

    const hasCorrections = Array.isArray(event.corrections) && event.corrections.length > 0;
    const correctedCategoryNames = new Set();
    if (hasCorrections) {
      for (const corr of event.corrections) {
        if (corr.previous_category) correctedCategoryNames.add(corr.previous_category);
        if (corr.new_category) correctedCategoryNames.add(corr.new_category);
        if (corr.previous_category_id) correctedCategoryNames.add(corr.previous_category_id);
        if (corr.new_category_id) correctedCategoryNames.add(corr.new_category_id);
      }
    }

    // Resolve touched categories to canonical names/IDs
    const resolvedTouchedIds = new Set();
    for (const item of touchedSet) {
      resolvedTouchedIds.add(item);
      const node = TaxonomyRegistry.resolve(item);
      if (node) {
        resolvedTouchedIds.add(node.category_id);
        resolvedTouchedIds.add(node.name);
        if (node.parent_id) {
          const parentNode = TaxonomyRegistry.resolve(node.parent_id);
          if (parentNode) {
            resolvedTouchedIds.add(parentNode.category_id);
            resolvedTouchedIds.add(parentNode.name);
          }
        }
      }
    }

    const categoriesToEvaluate = utilResult.capped_categories.filter(c => {
      if (resolvedTouchedIds.size === 0) return true;
      return (
        resolvedTouchedIds.has(c.category) ||
        resolvedTouchedIds.has(c.category_id) ||
        (c.covered_category_ids && c.covered_category_ids.some(id => resolvedTouchedIds.has(id)))
      );
    });

    const snapshot = SnapshotManager.getSnapshot(event.snapshot_id);
    const transitions = [];
    const breachAlertsForNova = [];

    for (const catUtil of categoriesToEvaluate) {
      const isCorrection =
        hasCorrections &&
        (correctedCategoryNames.has(catUtil.category) || correctedCategoryNames.has(catUtil.category_id));

      const transition = this.alertStore.evaluateTierTransition(userId, catUtil, {
        snapshot_id: event.snapshot_id,
        is_correction: isCorrection,
        import_in_progress: Boolean(snapshot?.import_in_progress)
      });

      transitions.push({
        category_id: catUtil.category_id,
        category: catUtil.category,
        previous_tier: transition.previous_tier,
        new_tier: transition.new_tier,
        changed: transition.changed,
        transition_type: transition.transition_type,
        provisional: Boolean(catUtil.tier_is_provisional),
        alert: transition.alert
      });

      if (transition.invoke_nova && transition.alert) {
        breachAlertsForNova.push({
          alert: transition.alert,
          category_utilization: catUtil,
          is_correction: isCorrection
        });
      }
    }

    const detectionLatencyMs = Date.now() - startTimeMs;

    // Step 4: If there is a new Warning or Exceeded alert, John may invoke Nova with task_type: breach_event.
    // Note: Step 3 alert is ALREADY stored and visible in `this.alertStore` before any LLM call!
    let novaResponses = [];
    if (breachAlertsForNova.length > 0 && options.invokeNovaSync && this.orchestratorGetter) {
      const john = this.orchestratorGetter();
      if (john) {
        for (const item of breachAlertsForNova) {
          const resp = john.handleBreachEventSync({
            user_id: userId,
            snapshot_id: event.snapshot_id,
            alert: item.alert,
            is_correction: item.is_correction,
            suspected_miscategorizations: event.suspected_miscategorizations || []
          });
          novaResponses.push(resp);
        }
      }
    }

    return {
      deduplicated: false,
      event_id: eventId,
      snapshot_id: event.snapshot_id,
      categorization_version: event.categorization_version,
      transitions,
      active_alerts: this.alertStore.getOpenAlerts(userId),
      nova_invoked: breachAlertsForNova.length > 0,
      breach_alerts: breachAlertsForNova.map(b => b.alert),
      nova_responses: novaResponses,
      detection_latency_ms: detectionLatencyMs
    };
  }
}

const defaultThresholdJob = new ThresholdJob(defaultAlertStore);

module.exports = {
  ThresholdJob,
  defaultThresholdJob,
  AlertHygieneStore,
  defaultAlertStore
};
