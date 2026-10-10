/**
 * NovaLifecycleRunner — Section 8 Conditional Execution Lifecycle
 *
 * Calls Sentinel functions strictly in the order specified for each `task_type`:
 * - `live_status`                      -> utilization, velocity
 * - `breach_event`                     -> utilization, velocity, rebalance simulation, cap validation (if cap change proposed)
 * - `anomaly_event` / `explain_anomaly`-> anomalies, ledger summary (if merchant history is needed)
 * - `propose_rebalance`                -> rebalance simulation, cap validation
 * - `adjust_cap_request`               -> cap validation, utilization
 */

const { SentinelEngine } = require('../../tools/sentinel');
const { TASK_TYPES } = require('../../contracts/PlatformRules');

class NovaLifecycleRunner {
  static run(packet) {
    const { task_type, snapshot_id, preferences, allowed_tools, event, ui_context } = packet;
    const calledTools = [];
    const toolResultIds = [];
    const results = {};

    const call = (toolName, args) => {
      const res = SentinelEngine.callTool(
        toolName,
        { snapshot_id, preferences, ...args },
        allowed_tools
      );
      calledTools.push(toolName);
      if (res && res.tool_result_id) {
        toolResultIds.push(res.tool_result_id);
      }
      return res;
    };

    const targetCategory =
      event?.category ||
      event?.category_id ||
      ui_context?.active_category ||
      event?.deficit_category ||
      null;

    switch (task_type) {
      case TASK_TYPES.LIVE_STATUS: {
        results.category_utilization_snapshot = call('sentinel_run_category_utilization', {
          category: targetCategory
        });
        results.velocity_projection = call('sentinel_run_velocity_projection', {
          category_scope: targetCategory
        });
        break;
      }

      case TASK_TYPES.BREACH_EVENT: {
        results.category_utilization_snapshot = call('sentinel_run_category_utilization', {
          category: targetCategory
        });
        results.velocity_projection = call('sentinel_run_velocity_projection', {
          category_scope: targetCategory
        });
        results.rebalance_proposal_data = call('sentinel_run_rebalance_simulation', {
          deficit_category: targetCategory
        });

        // Call cap validation if a cap change or rebalance transfer is proposed
        if (results.rebalance_proposal_data.has_proposals) {
          const topMove = results.rebalance_proposal_data.moves[0];
          results.cap_validation_result = call('sentinel_validate_cap_change', {
            category: topMove.to_category,
            new_cap: topMove.recipient_new_cap,
            explicit_user_request: false
          });
        } else if (event?.proposed_cap != null && targetCategory) {
          results.cap_validation_result = call('sentinel_validate_cap_change', {
            category: targetCategory,
            new_cap: event.proposed_cap,
            explicit_user_request: Boolean(preferences?.explicit_user_override)
          });
        }
        break;
      }

      case TASK_TYPES.ANOMALY_EVENT:
      case TASK_TYPES.EXPLAIN_ANOMALY: {
        results.anomaly_flags = call('sentinel_detect_anomalies', {
          lookback_days: event?.lookback_days || 30
        });
        const needHistory =
          event?.need_merchant_history !== false ||
          results.anomaly_flags.anomaly_count > 0;
        if (needHistory) {
          results.ledger_summary = call('sentinel_get_ledger_summary', {
            timeframe_months: event?.timeframe_months || 3,
            category_scope: targetCategory
          });
        }
        break;
      }

      case TASK_TYPES.PROPOSE_REBALANCE: {
        results.rebalance_proposal_data = call('sentinel_run_rebalance_simulation', {
          deficit_category: targetCategory
        });
        const topMove = results.rebalance_proposal_data.moves?.[0];
        const validationTargetCat = topMove ? topMove.from_category : (targetCategory || 'Shopping & Lifestyle');
        const validationTargetCap = topMove ? topMove.donor_new_cap : (event?.proposed_cap ?? 5000);
        results.cap_validation_result = call('sentinel_validate_cap_change', {
          category: validationTargetCat,
          new_cap: validationTargetCap,
          explicit_user_request: Boolean(preferences?.explicit_user_override)
        });
        break;
      }

      case TASK_TYPES.ADJUST_CAP_REQUEST: {
        const capTargetCategory = targetCategory || event?.category || 'Food & Dining';
        const proposedCap = event?.new_cap ?? event?.monthlyCap ?? 10000;
        results.cap_validation_result = call('sentinel_validate_cap_change', {
          category: capTargetCategory,
          new_cap: proposedCap,
          explicit_user_request: Boolean(event?.explicit_user_request || preferences?.explicit_user_override)
        });
        results.category_utilization_snapshot = call('sentinel_run_category_utilization', {
          category: capTargetCategory
        });
        break;
      }

      default:
        throw new Error(`Unsupported task_type in NovaLifecycleRunner: ${task_type}`);
    }

    return {
      called_tools: calledTools,
      tool_result_ids: toolResultIds,
      sentinel_results: results
    };
  }
}

module.exports = NovaLifecycleRunner;
