/**
 * RoutingTable — Section 10 Signal Routing Table (as used by John)
 *
 * Maps user intents and system events to their V4 destination:
 * - Live balance, cap status, overspend, anomaly, rebalance -> Nova
 * - Next-month planning, what-if, upcoming bills            -> Iris
 * - Goal creation, funding, progress                        -> Atlas
 * - Category corrections, review items                      -> John with the categorization service
 * - Charts without advice                                   -> Direct UI
 * - Categorization event with a tier change                 -> Threshold job, then Nova
 */

const { TASK_TYPES } = require('../../contracts/PlatformRules');

class RoutingTable {
  static resolveRoute(signal = {}) {
    if (signal.event_type === 'categorization.updated') {
      return {
        destination: 'ThresholdJob_then_Nova',
        task_type: TASK_TYPES.BREACH_EVENT
      };
    }

    const text = (signal.user_message || signal.intent || '').toLowerCase();

    if (
      signal.type === 'charts_only' ||
      (text.includes('chart') && !text.includes('advice') && !text.includes('why'))
    ) {
      return { destination: 'Direct_UI', task_type: null };
    }

    if (
      signal.type === 'category_correction' ||
      text.includes('move transaction') ||
      text.includes('recategorize') ||
      text.includes('review item') ||
      text.includes('wrong category')
    ) {
      return { destination: 'John_Categorization_Service', task_type: null };
    }

    if (
      signal.type === 'goal' ||
      text.includes('create goal') ||
      text.includes('goal progress') ||
      text.includes('fund goal')
    ) {
      return { destination: 'Atlas', task_type: 'goal_planning' };
    }

    if (
      signal.type === 'planning' ||
      text.includes('next month') ||
      text.includes('what-if') ||
      text.includes('upcoming bill')
    ) {
      return { destination: 'Iris', task_type: 'forward_planning' };
    }

    // Nova routes
    if (text.includes('adjust cap') || text.includes('change cap') || text.includes('set cap')) {
      return { destination: 'Nova', task_type: TASK_TYPES.ADJUST_CAP_REQUEST };
    }
    if (text.includes('rebalance')) {
      return { destination: 'Nova', task_type: TASK_TYPES.PROPOSE_REBALANCE };
    }
    if (text.includes('why does my') || text.includes('look different') || text.includes('explain anomaly')) {
      return { destination: 'Nova', task_type: TASK_TYPES.EXPLAIN_ANOMALY };
    }
    if (text.includes('anomaly') || text.includes('duplicate') || text.includes('price hike')) {
      return { destination: 'Nova', task_type: TASK_TYPES.ANOMALY_EVENT };
    }
    if (text.includes('overspend') || text.includes('breach') || text.includes('exceeded')) {
      return { destination: 'Nova', task_type: TASK_TYPES.BREACH_EVENT };
    }

    return {
      destination: 'Nova',
      task_type: signal.task_type || TASK_TYPES.LIVE_STATUS
    };
  }
}

module.exports = RoutingTable;
