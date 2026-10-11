/**
 * Shared Contract Validator & Tool Allowlist (SC §9, §10, §11, §12, §13)
 */

const { isValidConstraintCode } = require('./constraint-messages');
const { canPropose, getActionSpec } = require('./action-registry');

const TOOL_ALLOWLIST = Object.freeze({
  sentinel_get_surplus_baseline: ['ATLAS', 'IRIS', 'JOHN', 'WORKSPACE_API'],
  sentinel_get_ledger_summary: ['NOVA', 'IRIS', 'JOHN', 'WORKSPACE_API'],
  sentinel_get_spending_timeseries: ['JOHN', 'WORKSPACE_API'],
  sentinel_run_spending_simulation: ['IRIS', 'JOHN', 'WORKSPACE_API'],
  sentinel_run_category_utilization: ['NOVA', 'JOHN', 'WORKSPACE_API', 'BUDGET_MONITOR'],
  sentinel_run_velocity_projection: ['NOVA', 'WORKSPACE_API', 'BUDGET_MONITOR'],
  sentinel_detect_anomalies: ['NOVA', 'IRIS', 'WORKSPACE_API', 'BUDGET_MONITOR'],
  sentinel_run_rebalance_simulation: ['NOVA', 'IRIS', 'WORKSPACE_API', 'ACTION_SERVICE'],
  sentinel_validate_cap_change: ['NOVA', 'IRIS', 'WORKSPACE_API', 'ACTION_SERVICE'],
  sentinel_run_goal_progress: ['ATLAS', 'JOHN', 'WORKSPACE_API'],
  sentinel_run_goal_feasibility: ['ATLAS', 'IRIS', 'WORKSPACE_API', 'ACTION_SERVICE'],
  sentinel_validate_goal_change: ['ATLAS', 'IRIS', 'WORKSPACE_API', 'ACTION_SERVICE'],
  sentinel_forecast_bill_outlays: ['IRIS', 'JOHN', 'WORKSPACE_API', 'BUDGET_MONITOR'],
  sentinel_flag_cashflow_risk: ['IRIS', 'JOHN', 'WORKSPACE_API', 'BUDGET_MONITOR'],
  sentinel_check_available_balance: ['ATLAS', 'WORKSPACE_API', 'ACTION_SERVICE'],
  sentinel_compute_health_score: ['JOHN'],
  sentinel_project_sip: ['ATLAS', 'WORKSPACE_API'],
  sentinel_validate_profile: ['JOHN', 'WORKSPACE_API', 'ACTION_SERVICE'],
});

function isToolAllowedForCaller(caller, fnName) {
  const allowedCallers = TOOL_ALLOWLIST[fnName];
  if (!allowedCallers) return false;
  return allowedCallers.includes(caller);
}

function getAllowedToolsForCaller(caller) {
  return Object.entries(TOOL_ALLOWLIST)
    .filter(([, callers]) => callers.includes(caller))
    .map(([fn]) => fn);
}

const VALID_SPECIALISTS = new Set(['ATLAS', 'NOVA', 'IRIS']);
const VALID_TRIGGERS = new Set(['USER_MESSAGE', 'UI_ACTION', 'ALERT_OPEN']);

function validateTaskPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object') {
    return { valid: false, errors: ['Packet must be an object'] };
  }
  if (packet.schema !== 'TaskPacket@1') errors.push('schema must be TaskPacket@1');
  if (!packet.request_id) errors.push('request_id is required');
  if (!packet.task_id) errors.push('task_id is required');
  if (!packet.trace_id) errors.push('trace_id is required');
  if (!VALID_SPECIALISTS.has(packet.specialist)) errors.push(`Invalid specialist: ${packet.specialist}`);
  if (!packet.task_type || typeof packet.task_type !== 'string') errors.push('task_type is required');
  if (!VALID_TRIGGERS.has(packet.trigger)) errors.push(`Invalid trigger: ${packet.trigger}`);
  if (!packet.snapshot_id) errors.push('snapshot_id is required');
  if (!packet.data_quality || packet.data_quality.schema !== 'DataQuality@1') {
    errors.push('data_quality (DataQuality@1) is required');
  }
  if (!packet.context || typeof packet.context !== 'object') {
    errors.push('context is required');
  }
  if (!Array.isArray(packet.allowed_tools)) {
    errors.push('allowed_tools must be an array');
  }
  if (!packet.budget || typeof packet.budget !== 'object') {
    errors.push('budget is required');
  }
  return { valid: errors.length === 0, errors };
}

function validateFinding(finding, label = 'finding') {
  const errors = [];
  if (!finding || typeof finding !== 'object') {
    return [`${label} must be an object`];
  }
  if (typeof finding.text !== 'string' || finding.text.length === 0) {
    errors.push(`${label}.text must be a non-empty string`);
  }
  const validKinds = ['FACT', 'CALCULATION', 'ESTIMATE', 'PREDICTION', 'RECOMMENDATION', 'CAVEAT'];
  if (!validKinds.includes(finding.evidence_kind)) {
    errors.push(`${label}.evidence_kind is invalid: ${finding.evidence_kind}`);
  }
  if (!Array.isArray(finding.citations)) {
    errors.push(`${label}.citations must be an array`);
  } else if (finding.evidence_kind !== 'RECOMMENDATION' && finding.citations.length === 0) {
    errors.push(`${label} of kind ${finding.evidence_kind} requires at least 1 citation`);
  }
  return errors;
}

function validateSpecialistResponse(response, packet = null) {
  const errors = [];
  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response must be an object'] };
  }
  if (response.schema !== 'SpecialistResponse@1') errors.push('schema must be SpecialistResponse@1');
  if (packet) {
    if (response.request_id !== packet.request_id) errors.push('request_id mismatch');
    if (response.task_id !== packet.task_id) errors.push('task_id mismatch');
    if (response.trace_id !== packet.trace_id) errors.push('trace_id mismatch');
    if (response.specialist !== packet.specialist) errors.push('specialist mismatch');
    if (response.snapshot_id !== packet.snapshot_id) errors.push('snapshot_id mismatch');
  }

  const validStatuses = ['OK', 'PARTIAL', 'NEEDS_INPUT', 'REJECTED', 'ERROR'];
  if (!validStatuses.includes(response.status)) {
    errors.push(`Invalid status: ${response.status}`);
  }

  if (response.status !== 'ERROR') {
    errors.push(...validateFinding(response.headline, 'headline'));
  }

  if (!Array.isArray(response.findings)) {
    errors.push('findings must be an array');
  } else {
    response.findings.forEach((f, idx) => {
      errors.push(...validateFinding(f, `findings[${idx}]`));
    });
  }

  if (!Array.isArray(response.proposals)) {
    errors.push('proposals must be an array');
  } else {
    response.proposals.forEach((p, idx) => {
      if (!p.action_ref) errors.push(`proposals[${idx}].action_ref is required`);
      if (!canPropose(response.specialist, p.action_type)) {
        errors.push(`${response.specialist} cannot propose ${p.action_type}`);
      }
      const spec = getActionSpec(p.action_type);
      if (spec && p.tier !== spec.tier) {
        errors.push(`proposals[${idx}] tier ${p.tier} does not match registry tier ${spec.tier}`);
      }
      errors.push(...validateFinding(p.rationale, `proposals[${idx}].rationale`));
    });
  }

  if (!Array.isArray(response.constraints)) {
    errors.push('constraints must be an array');
  } else {
    response.constraints.forEach((c, idx) => {
      if (!isValidConstraintCode(c.code)) {
        errors.push(`constraints[${idx}] has unregistered code: ${c.code}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  TOOL_ALLOWLIST,
  isToolAllowedForCaller,
  getAllowedToolsForCaller,
  validateTaskPacket,
  validateFinding,
  validateSpecialistResponse,
};
