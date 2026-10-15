/**
 * Numeric Grounding, Placeholder Resolution, and Digit Verification (SC §11.1–§11.4)
 */

const { formatInr, formatInrPaise, formatBpPct, formatIndianInteger } = require('../money');

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const PLACEHOLDER_REGEX = /\{\{([^}|]+)\|([a-z_]+)\}\}/g;

function resolveJsonPointer(obj, pointer) {
  if (obj == null) return undefined;
  if (!pointer || pointer === '/' || pointer === '') return obj;
  const clean = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  const parts = clean.split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function formatGroundedValue(rawValue, format) {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }
  switch (format) {
    case 'inr':
      return formatInr(Number(rawValue));
    case 'inr_paise':
      return formatInrPaise(Number(rawValue));
    case 'bp_pct':
      return formatBpPct(Number(rawValue));
    case 'date': {
      const s = String(rawValue);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return s;
      const year = m[1];
      const monthIdx = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      return `${day} ${MONTH_NAMES[monthIdx] || m[2]} ${year}`;
    }
    case 'month': {
      const s = String(rawValue);
      const m = s.match(/^(\d{4})-(\d{2})/);
      if (!m) return s;
      const year = m[1];
      const monthIdx = parseInt(m[2], 10) - 1;
      return `${MONTH_NAMES[monthIdx] || m[2]} ${year}`;
    }
    case 'count':
      return formatIndianInteger(Number(rawValue));
    case 'days': {
      const d = Math.trunc(Number(rawValue));
      return `${d} ${Math.abs(d) === 1 ? 'day' : 'days'}`;
    }
    case 'months': {
      const m = Math.trunc(Number(rawValue));
      return `${m} ${Math.abs(m) === 1 ? 'month' : 'months'}`;
    }
    default:
      return null;
  }
}

/**
 * Resolves a single placeholder source expression `<source>:<pointer>` against context:
 * - `<tool_result_id>:<json-pointer>` -> context.toolResults[tool_result_id]
 * - `status:<json-pointer>` -> context.dataQuality
 * - `action:<action_ref>:<json-pointer>` -> context.proposalsByRef[action_ref]
 * - `param:<json-pointer>` -> context.actionResult
 * - `user:<json-pointer>` -> context.taskParams
 * - `txn:<txn_id>:amount_minor` -> context.transactionsById[txn_id].amount_minor
 */
function resolvePlaceholderSource(sourceExpr, context = {}) {
  if (!sourceExpr || typeof sourceExpr !== 'string') return undefined;

  if (sourceExpr.startsWith('status:')) {
    const ptr = sourceExpr.slice('status:'.length);
    return resolveJsonPointer(context.dataQuality, ptr);
  }

  if (sourceExpr.startsWith('action:')) {
    const rest = sourceExpr.slice('action:'.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return undefined;
    const actionRef = rest.slice(0, colonIdx);
    const ptr = rest.slice(colonIdx + 1);
    const proposal = context.proposalsByRef?.[actionRef];
    return resolveJsonPointer(proposal, ptr);
  }

  if (sourceExpr.startsWith('param:')) {
    const ptr = sourceExpr.slice('param:'.length);
    return resolveJsonPointer(context.actionResult, ptr);
  }

  if (sourceExpr.startsWith('user:')) {
    const ptr = sourceExpr.slice('user:'.length);
    return resolveJsonPointer(context.taskParams, ptr);
  }

  if (sourceExpr.startsWith('txn:')) {
    const rest = sourceExpr.slice('txn:'.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return undefined;
    const txnId = rest.slice(0, colonIdx);
    const field = rest.slice(colonIdx + 1).replace(/^\//, '');
    const txn = context.transactionsById?.[txnId];
    return txn ? txn[field] : undefined;
  }

  // Otherwise `<tool_result_id>:<json-pointer>`
  const colonIdx = sourceExpr.indexOf(':');
  if (colonIdx === -1) return undefined;
  const toolResultId = sourceExpr.slice(0, colonIdx);
  const ptr = sourceExpr.slice(colonIdx + 1);
  const resultObj =
    context.toolResults instanceof Map
      ? context.toolResults.get(toolResultId)
      : context.toolResults?.[toolResultId];
  return resolveJsonPointer(resultObj, ptr);
}

function findUnboundDigits(text) {
  if (typeof text !== 'string') return [];
  const stripped = text.replace(PLACEHOLDER_REGEX, ' ');
  return stripped.match(/\d+/g) || [];
}

/**
 * Renders all placeholders in `text` and checks grounding rules (SC §11.3).
 * Returns `{ ok, rendered, text, errors, unboundDigits }`.
 */
function renderGroundedText(text, context = {}) {
  if (typeof text !== 'string') {
    return { ok: false, rendered: '', text: '', errors: ['Text must be a string'], unboundDigits: [] };
  }

  const errors = [];
  const digitMatches = findUnboundDigits(text);
  if (digitMatches.length > 0) {
    errors.push(`Unbound digits found outside placeholders: ${digitMatches.join(', ')}`);
  }

  const rendered = text.replace(PLACEHOLDER_REGEX, (fullMatch, sourceExpr, format) => {
    const rawVal = resolvePlaceholderSource(sourceExpr, context);
    if (rawVal === undefined || rawVal === null) {
      errors.push(`Unresolved placeholder: ${fullMatch}`);
      return fullMatch;
    }
    const formatted = formatGroundedValue(rawVal, format);
    if (formatted === null) {
      errors.push(`Invalid format in placeholder: ${fullMatch}`);
      return fullMatch;
    }
    return formatted;
  });

  return {
    ok: errors.length === 0,
    rendered,
    text: rendered,
    errors,
    unboundDigits: digitMatches,
  };
}

module.exports = {
  PLACEHOLDER_REGEX,
  resolveJsonPointer,
  formatGroundedValue,
  resolvePlaceholderSource,
  findUnboundDigits,
  renderGroundedText,
  resolvePlaceholders: renderGroundedText,
};
