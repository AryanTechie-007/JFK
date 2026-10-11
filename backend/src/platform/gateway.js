/**
 * Tool Gateway (SC §10.1–§10.5, §17.1)
 * Mediates all calls to Sentinel functions, enforces caller × function allowlist,
 * resolves ResultRef@1 (`{"$ref": "<tool_result_id>:<json-pointer>"}`), enforces budgets,
 * and records every tool call and result for grounding and validation.
 */

const { isToolAllowedForCaller } = require('../shared/contracts/validator');
const { resolveJsonPointer } = require('../shared/contracts/grounding');
const { SENTINEL_FUNCTIONS, loadSnapshotState } = require('../engines/sentinel');
const { newId } = require('../shared/ids');

class GatewaySession {
  constructor(opts = {}) {
    this.caller = opts.caller;
    this.snapshot_id = opts.snapshot_id || opts.snapshotId || opts.snapshot?.snapshot_id;
    this.user_id = opts.user_id || opts.userId;
    this.max_tool_calls = opts.max_tool_calls ?? opts.maxToolCalls ?? 10;
    this.allowed_tools = Array.isArray(opts.allowed_tools) ? new Set(opts.allowed_tools) : null;
    this.callCount = 0;
    this.resultsById = {};
    this.callLog = [];
    this._state = null;
  }

  _getState() {
    if (!this._state) {
      this._state = loadSnapshotState(this.snapshot_id, this.user_id);
    }
    return this._state;
  }

  _resolveArgs(rawArgs, isFactParam = false) {
    if (!rawArgs || typeof rawArgs !== 'object') return rawArgs ?? {};
    if (Array.isArray(rawArgs)) {
      return rawArgs.map((item) => this._resolveArgs(item));
    }
    if (typeof rawArgs.$ref === 'string') {
      const refStr = rawArgs.$ref;
      const colonIdx = refStr.indexOf(':');
      if (colonIdx === -1) {
        throw new Error(`Invalid ResultRef format: ${refStr}`);
      }
      const refId = refStr.slice(0, colonIdx);
      const ptr = refStr.slice(colonIdx + 1);
      const refResult = this.resultsById[refId];
      if (!refResult) {
        throw new Error(`Referenced tool_result_id not found in session: ${refId}`);
      }
      const val = resolveJsonPointer(refResult, ptr);
      return isFactParam ? { __resolved_from_result_ref: true, value: val } : val;
    }
    if (typeof rawArgs.from_result === 'string' && typeof rawArgs.path === 'string') {
      const refResult = this.resultsById[rawArgs.from_result];
      if (!refResult) {
        throw new Error(`Referenced tool_result_id not found in session: ${rawArgs.from_result}`);
      }
      const val = resolveJsonPointer(refResult, rawArgs.path);
      return isFactParam ? { __resolved_from_result_ref: true, value: val } : val;
    }
    const resolved = {};
    for (const [k, v] of Object.entries(rawArgs)) {
      const factKey = k === 'outlays';
      resolved[k] = v && typeof v === 'object' ? this._resolveArgs(v, factKey) : v;
    }
    return resolved;
  }

  call(functionName, rawArgs = {}) {
    // 1. Check caller × function allowlist (SC §10.4)
    if (!isToolAllowedForCaller(this.caller, functionName)) {
      const errRes = {
        schema: 'SentinelResult@1',
        tool_result_id: newId('trs'),
        function: functionName,
        function_name: functionName,
        snapshot_id: this.snapshot_id,
        status: 'ERROR',
        confidence: 'LOW',
        constraint_codes: [],
        constraints_triggered: [],
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: `Caller ${this.caller} is not permitted to invoke ${functionName}.`,
        },
      };
      this.callLog.push({ function_name: functionName, args: rawArgs, result: errRes });
      return errRes;
    }

    if (this.allowed_tools && !this.allowed_tools.has(functionName)) {
      const errRes = {
        schema: 'SentinelResult@1',
        tool_result_id: newId('trs'),
        function: functionName,
        function_name: functionName,
        snapshot_id: this.snapshot_id,
        status: 'ERROR',
        confidence: 'LOW',
        constraint_codes: [],
        constraints_triggered: [],
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: `Function ${functionName} is not in packet allowed_tools.`,
        },
      };
      this.callLog.push({ function_name: functionName, args: rawArgs, result: errRes });
      return errRes;
    }

    // 2. Check budget
    if (this.callCount >= this.max_tool_calls) {
      const errRes = {
        schema: 'SentinelResult@1',
        tool_result_id: newId('trs'),
        function: functionName,
        function_name: functionName,
        snapshot_id: this.snapshot_id,
        status: 'ERROR',
        confidence: 'LOW',
        constraint_codes: [],
        constraints_triggered: [],
        data: null,
        error: {
          code: 'BUDGET_EXCEEDED',
          message: `Max tool calls (${this.max_tool_calls}) exceeded.`,
        },
      };
      this.callLog.push({ function_name: functionName, args: rawArgs, result: errRes });
      return errRes;
    }

    const fn = SENTINEL_FUNCTIONS[functionName];
    if (!fn) {
      throw new Error(`Unknown Sentinel function: ${functionName}`);
    }

    // 2b. Reject identity parameters and literal fact parameters (Sentinel §B.2, §C.3, §F, SEN-AC-03)
    const forbiddenIdentity = ['user_id', 'tenant_id', 'snapshot_id', 'customer_ref'];
    for (const idKey of forbiddenIdentity) {
      if (rawArgs && Object.prototype.hasOwnProperty.call(rawArgs, idKey)) {
        const errRes = {
          schema: 'SentinelResult@1',
          tool_result_id: newId('trs'),
          function: functionName,
          function_name: functionName,
          snapshot_id: this.snapshot_id,
          status: 'ERROR',
          confidence: null,
          constraint_codes: [],
          constraints_triggered: [],
          data: null,
          error: {
            code: 'INVALID_INPUT',
            message: `Identity parameter '${idKey}' is forbidden in tool params.`,
          },
        };
        this.callLog.push({ function_name: functionName, args: rawArgs, result: errRes });
        return errRes;
      }
    }

    if (
      functionName === 'sentinel_flag_cashflow_risk' &&
      rawArgs &&
      rawArgs.outlays !== undefined &&
      rawArgs.outlays !== null
    ) {
      const o = rawArgs.outlays;
      const isRef =
        typeof o === 'object' &&
        !Array.isArray(o) &&
        (typeof o.$ref === 'string' || (typeof o.from_result === 'string' && typeof o.path === 'string'));
      if (!isRef) {
        const errRes = {
          schema: 'SentinelResult@1',
          tool_result_id: newId('trs'),
          function: functionName,
          function_name: functionName,
          snapshot_id: this.snapshot_id,
          status: 'ERROR',
          confidence: null,
          constraint_codes: [],
          constraints_triggered: [],
          data: null,
          error: {
            code: 'FACT_PARAM_REQUIRES_REF',
            message: `Parameter 'outlays' is a fact parameter and requires a ResultRef, not a literal value.`,
          },
        };
        this.callLog.push({ function_name: functionName, args: rawArgs, result: errRes });
        return errRes;
      }
    }

    let resolvedArgs;
    try {
      resolvedArgs = this._resolveArgs(rawArgs);
      if (
        resolvedArgs &&
        resolvedArgs.outlays &&
        resolvedArgs.outlays.__resolved_from_result_ref
      ) {
        resolvedArgs.outlays = resolvedArgs.outlays.value;
      }
    } catch (err) {
      const errRes = {
        schema: 'SentinelResult@1',
        tool_result_id: newId('trs'),
        function: functionName,
        function_name: functionName,
        snapshot_id: this.snapshot_id,
        status: 'ERROR',
        confidence: 'LOW',
        constraint_codes: [],
        constraints_triggered: [],
        data: null,
        error: {
          code: 'INVALID_INPUT',
          message: err.message,
        },
      };
      this.callLog.push({ function_name: functionName, args: rawArgs, result: errRes });
      return errRes;
    }

    // Force override_protected = false when called by any agent (SC §10.4 footnote)
    if (['ATLAS', 'NOVA', 'IRIS', 'JOHN'].includes(this.caller)) {
      if (functionName === 'sentinel_validate_cap_change') {
        resolvedArgs.override_protected = false;
      }
    }

    this.callCount++;
    const state = this._getState();
    const result = fn(state, resolvedArgs);
    this.resultsById[result.tool_result_id] = result;
    this.callLog.push({
      function_name: functionName,
      args: resolvedArgs,
      tool_result_id: result.tool_result_id,
      result,
    });
    return result;
  }
}

function createGatewaySession(opts) {
  return new GatewaySession(opts);
}

module.exports = {
  GatewaySession,
  createGatewaySession,
};
