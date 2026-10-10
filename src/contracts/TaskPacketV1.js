/**
 * TaskPacket@1 — Input Data Contract from John to Specialists (Section 5.1)
 *
 * Enforces:
 * - Required context fields: task_type, snapshot_id, user_message or event, ui_context,
 *   data_quality, preferences (including protected_categories), rolling_summary,
 *   recent_turns, peer_findings, allowed_tools, budget.
 * - Strict privacy & isolation: NO user_id, NO raw_ledger.
 */

const { TASK_TYPES, SENTINEL_NOVA_ALLOWLIST } = require('./PlatformRules');

class TaskPacketV1 {
  static create(params = {}) {
    if ('user_id' in params || 'userId' in params) {
      throw new Error('TaskPacket@1 violation: user_id is forbidden in specialist task packets.');
    }
    if ('raw_ledger' in params || 'rawLedger' in params || 'transactions' in params) {
      throw new Error('TaskPacket@1 violation: raw ledger rows are forbidden in specialist task packets.');
    }

    const taskType = params.task_type || TASK_TYPES.LIVE_STATUS;
    if (!Object.values(TASK_TYPES).includes(taskType)) {
      throw new Error(`Invalid task_type "${taskType}" for TaskPacket@1.`);
    }

    if (!params.snapshot_id) {
      throw new Error('TaskPacket@1 requires a pinned snapshot_id.');
    }

    const dataQuality = {
      categorization_version: params.data_quality?.categorization_version || 'v4.0.0',
      coverage_by_amount: params.data_quality?.coverage_by_amount ?? 1.0,
      uncategorized_amount_minor: params.data_quality?.uncategorized_amount_minor ?? 0,
      needs_review_count: params.data_quality?.needs_review_count ?? 0,
      import_in_progress: Boolean(params.data_quality?.import_in_progress),
      data_stale: Boolean(params.data_quality?.data_stale),
      snapshot_age_seconds: params.data_quality?.snapshot_age_seconds ?? 0
    };

    const preferences = {
      protected_categories: Array.isArray(params.preferences?.protected_categories)
        ? params.preferences.protected_categories
        : ['cat_housing', 'cat_healthcare', 'cat_bills'],
      flexible_categories: Array.isArray(params.preferences?.flexible_categories)
        ? params.preferences.flexible_categories
        : ['cat_shopping', 'cat_food_dining'],
      currency: params.preferences?.currency || '₹',
      explicit_user_override: Boolean(params.preferences?.explicit_user_override)
    };

    return Object.freeze({
      schema: 'TaskPacket@1',
      task_type: taskType,
      snapshot_id: params.snapshot_id,
      user_message: params.user_message || null,
      event: params.event || null,
      ui_context: params.ui_context || { page: 'nova_budget_workspace', active_category: null },
      data_quality: Object.freeze(dataQuality),
      preferences: Object.freeze(preferences),
      rolling_summary: params.rolling_summary || '',
      recent_turns: Array.isArray(params.recent_turns) ? params.recent_turns : [],
      peer_findings: Array.isArray(params.peer_findings) ? params.peer_findings : [],
      allowed_tools: Array.isArray(params.allowed_tools)
        ? [...params.allowed_tools]
        : [...SENTINEL_NOVA_ALLOWLIST],
      budget: params.budget || { max_tool_calls: 6, timeout_ms: 5000 }
    });
  }

  static validate(packet) {
    if (!packet || packet.schema !== 'TaskPacket@1') {
      throw new Error('Invalid packet: expected schema TaskPacket@1.');
    }
    if ('user_id' in packet || 'userId' in packet) {
      throw new Error('TaskPacket@1 violation: user_id is forbidden.');
    }
    if ('raw_ledger' in packet || 'rawLedger' in packet || 'transactions' in packet) {
      throw new Error('TaskPacket@1 violation: raw ledger is forbidden.');
    }
    if (!Object.values(TASK_TYPES).includes(packet.task_type)) {
      throw new Error(`Unsupported task_type: ${packet.task_type}`);
    }
    if (!packet.snapshot_id) {
      throw new Error('TaskPacket@1 missing snapshot_id.');
    }
    if (!packet.data_quality || typeof packet.data_quality !== 'object') {
      throw new Error('TaskPacket@1 missing data_quality.');
    }
    if (!packet.preferences || !Array.isArray(packet.preferences.protected_categories)) {
      throw new Error('TaskPacket@1 missing preferences.protected_categories.');
    }
    return true;
  }
}

module.exports = TaskPacketV1;
