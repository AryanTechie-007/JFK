/**
 * ToolGateway — Enforces Nova's Read-Only Allowlist at the Gateway (Section 6, 9, 13 #4 & #9, 14 #2)
 *
 * - Nova's allowlist has NO write tools.
 * - Any write attempt or call outside the allowlist fails immediately at the gateway with zero state change.
 */

const { SENTINEL_NOVA_ALLOWLIST } = require('../../contracts/PlatformRules');

const FORBIDDEN_WRITE_TOOLS = new Set([
  'write_db',
  'execute_sql',
  'update_budget_cap',
  'apply_rebalance',
  'recategorize_transaction',
  'RECATEGORIZE_TRANSACTION',
  'ADJUST_BUDGET_CAP',
  'APPLY_REBALANCE',
  'delete_goal',
  'create_goal',
  'mutate_ledger'
]);

class ToolGateway {
  /**
   * Validates and executes an allowlisted Sentinel function.
   * Throws GATEWAY_ALLOWLIST_ERROR if a write tool or unlisted tool is called.
   */
  static invoke(toolName, args = {}, registry = {}, packetAllowedTools = null) {
    if (FORBIDDEN_WRITE_TOOLS.has(toolName) || toolName.startsWith('write_') || toolName.startsWith('mutate_')) {
      const err = new Error(
        `Gateway Violation: Write tool "${toolName}" is strictly prohibited for stateless specialist Nova.`
      );
      err.code = 'GATEWAY_WRITE_ATTEMPT_BLOCKED';
      throw err;
    }

    if (!SENTINEL_NOVA_ALLOWLIST.includes(toolName)) {
      const err = new Error(
        `Gateway Violation: Tool "${toolName}" is outside Nova's Sentinel allowlist.`
      );
      err.code = 'GATEWAY_ALLOWLIST_VIOLATION';
      throw err;
    }

    if (Array.isArray(packetAllowedTools) && !packetAllowedTools.includes(toolName)) {
      const err = new Error(
        `Gateway Violation: Tool "${toolName}" is not permitted by this TaskPacket@1 allowed_tools list.`
      );
      err.code = 'GATEWAY_PACKET_TOOL_BLOCKED';
      throw err;
    }

    const fn = registry[toolName];
    if (typeof fn !== 'function') {
      const err = new Error(`Sentinel function "${toolName}" is not registered.`);
      err.code = 'SENTINEL_FUNCTION_NOT_FOUND';
      throw err;
    }

    return fn(args);
  }
}

module.exports = ToolGateway;
