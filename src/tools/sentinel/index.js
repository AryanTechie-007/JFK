/**
 * SentinelEngine — Mathematical & Statistical Model Facade (No LLM)
 *
 * Exposes the 6 Sentinel functions defined in Section 6 of Nova: Agent Specification (V4)
 * and routes specialist calls through ToolGateway to enforce Nova's read-only allowlist.
 */

const SnapshotManager = require('./SnapshotManager');
const ToolGateway = require('./ToolGateway');
const sentinel_get_ledger_summary = require('./getLedgerSummary');
const { sentinel_run_category_utilization, determineTier } = require('./runCategoryUtilization');
const { sentinel_run_velocity_projection, VelocityPredictor } = require('./runVelocityProjection');
const { sentinel_detect_anomalies, AnomalyDetector } = require('./detectAnomalies');
const { sentinel_run_rebalance_simulation, RebalanceEngine } = require('./runRebalanceSimulation');
const sentinel_validate_cap_change = require('./validateCapChange');

const SENTINEL_FUNCTION_REGISTRY = Object.freeze({
  sentinel_get_ledger_summary,
  sentinel_run_category_utilization,
  sentinel_run_velocity_projection,
  sentinel_detect_anomalies,
  sentinel_run_rebalance_simulation,
  sentinel_validate_cap_change
});

class SentinelEngine {
  /**
   * Invokes a Sentinel function through the security gateway.
   */
  static callTool(toolName, args = {}, packetAllowedTools = null) {
    return ToolGateway.invoke(toolName, args, SENTINEL_FUNCTION_REGISTRY, packetAllowedTools);
  }

  static getRegistry() {
    return SENTINEL_FUNCTION_REGISTRY;
  }

  static getLedgerSummary(args) {
    return sentinel_get_ledger_summary(args);
  }

  static runCategoryUtilization(args) {
    return sentinel_run_category_utilization(args);
  }

  static runVelocityProjection(args) {
    return sentinel_run_velocity_projection(args);
  }

  static detectAnomalies(args) {
    return sentinel_detect_anomalies(args);
  }

  static runRebalanceSimulation(args) {
    return sentinel_run_rebalance_simulation(args);
  }

  static validateCapChange(args) {
    return sentinel_validate_cap_change(args);
  }
}

module.exports = {
  SentinelEngine,
  SnapshotManager,
  ToolGateway,
  sentinel_get_ledger_summary,
  sentinel_run_category_utilization,
  sentinel_run_velocity_projection,
  sentinel_detect_anomalies,
  sentinel_run_rebalance_simulation,
  sentinel_validate_cap_change,
  determineTier,
  VelocityPredictor,
  AnomalyDetector,
  RebalanceEngine
};
