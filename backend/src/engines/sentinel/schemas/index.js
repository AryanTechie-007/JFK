/**
 * Sentinel Schema Registry & Validator (Sentinel §C.3, §F, SEN-AC-03)
 */

const fs = require('node:fs');
const path = require('node:path');

const FORBIDDEN_IDENTITY_PARAMS = new Set([
  'user_id',
  'tenant_id',
  'snapshot_id',
  'customer_ref',
]);

const schemasMap = new Map();

function loadSchemas() {
  if (schemasMap.size > 0) return schemasMap;
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    if (raw.function) {
      schemasMap.set(raw.function, raw);
    }
  }
  return schemasMap;
}

function getFunctionSchema(functionName) {
  loadSchemas();
  return schemasMap.get(functionName) || null;
}

function isResultRefObject(val) {
  return (
    val !== null &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    typeof val.from_result === 'string' &&
    val.from_result.length > 0 &&
    typeof val.path === 'string'
  );
}

/**
 * Validates input parameters against function schema and security/fact rules (SEN-AC-03, §F).
 */
function validateInputParams(functionName, params = {}, options = {}) {
  const schema = getFunctionSchema(functionName);
  if (!schema) {
    return { valid: false, error_code: 'INVALID_INPUT', message: `Unknown function: ${functionName}` };
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return { valid: false, error_code: 'INVALID_INPUT', message: 'params must be an object' };
  }

  // §F: Identity only from gateway context; identity params in params -> INVALID_INPUT
  for (const key of Object.keys(params)) {
    if (FORBIDDEN_IDENTITY_PARAMS.has(key)) {
      return {
        valid: false,
        error_code: 'INVALID_INPUT',
        message: `Forbidden identity parameter in params: ${key}`,
      };
    }
  }

  // §C.3 & SEN-AC-03: Fact parameters must be ResultRef (or resolved by gateway with __resolved_from_result_ref)
  const factParams = schema.fact_params || [];
  for (const factKey of factParams) {
    if (params[factKey] !== undefined && params[factKey] !== null) {
      const val = params[factKey];
      const isResolvedByGateway = Boolean(
        options.allowResolvedFactRef &&
          val &&
          typeof val === 'object' &&
          val.__resolved_from_result_ref === true
      );
      if (!isResultRefObject(val) && !isResolvedByGateway) {
        return {
          valid: false,
          error_code: 'FACT_PARAM_REQUIRES_REF',
          message: `Parameter '${factKey}' is a fact parameter (fact: true) and requires a ResultRef ({ from_result, path }), not a literal value.`,
        };
      }
    }
  }

  // Validate property constraints in schema.params.properties
  const propSchemas = (schema.params && schema.params.properties) || {};
  for (const [propName, propSpec] of Object.entries(propSchemas)) {
    const val = params[propName];
    if (val === undefined || val === null) continue;
    if (factParams.includes(propName)) continue;

    if (propSpec.type === 'integer') {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' must be an integer`,
        };
      }
      if (propSpec.minimum !== undefined && val < propSpec.minimum) {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' (${val}) is below minimum ${propSpec.minimum}`,
        };
      }
      if (propSpec.maximum !== undefined && val > propSpec.maximum) {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' (${val}) exceeds maximum ${propSpec.maximum}`,
        };
      }
    } else if (propSpec.type === 'string') {
      if (typeof val !== 'string') {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' must be a string`,
        };
      }
      if (Array.isArray(propSpec.enum) && !propSpec.enum.includes(val)) {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' must be one of: ${propSpec.enum.join(', ')}`,
        };
      }
    } else if (propSpec.type === 'array') {
      if (!Array.isArray(val)) {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' must be an array`,
        };
      }
      if (propSpec.maxItems !== undefined && val.length > propSpec.maxItems) {
        return {
          valid: false,
          error_code: 'INVALID_INPUT',
          message: `Parameter '${propName}' exceeds maxItems (${propSpec.maxItems})`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates output data against schema.data required fields and types.
 */
function validateOutputData(functionName, data) {
  const schema = getFunctionSchema(functionName);
  if (!schema || !schema.data) return { valid: true, errors: [] };
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['data must be an object'] };
  }
  const errors = [];
  const required = schema.data.required || [];
  for (const reqField of required) {
    if (data[reqField] === undefined) {
      errors.push(`Missing required data field: ${reqField}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  FORBIDDEN_IDENTITY_PARAMS,
  loadSchemas,
  getFunctionSchema,
  isResultRefObject,
  validateInputParams,
  validateOutputData,
};
