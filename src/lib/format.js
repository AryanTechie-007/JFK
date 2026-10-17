/**
 * Display-only formatting helpers (SC §4, SC §11, P-AC-05).
 *
 * CRITICAL CONSTRAINT: The frontend performs NO money arithmetic or financial calculations.
 * All numbers must arrive from the backend API. These utilities only format for display.
 */

/**
 * Formats integer paise (*_minor) to Indian Rupee display (e.g. 150000 -> "₹1,500.00").
 * @param {number|null|undefined} amountMinor - Integer amount in paise (minor units)
 * @param {object} options
 * @returns {string}
 */
export function formatMinorInr(amountMinor, { showDecimals = true, fallback = "₹0" } = {}) {
  if (amountMinor === null || amountMinor === undefined || isNaN(amountMinor)) {
    return fallback;
  }

  const isNegative = amountMinor < 0;
  const absPaise = Math.abs(Math.round(amountMinor));
  const rupees = Math.floor(absPaise / 100);
  const paise = absPaise % 100;

  // Indian number grouping for rupees (e.g., 12,34,567)
  const rupeeStr = rupees.toLocaleString('en-IN');
  const formatted = showDecimals
    ? `₹${rupeeStr}.${paise.toString().padStart(2, '0')}`
    : `₹${rupeeStr}`;

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Formats basis points (*_bp) to percentage display (e.g. 8500 -> "85%").
 * @param {number|null|undefined} bp - Integer basis points (1 bp = 0.01%)
 * @param {number} decimals
 * @returns {string}
 */
export function formatBpPct(bp, decimals = 1) {
  if (bp === null || bp === undefined || isNaN(bp)) {
    return "—";
  }
  const pct = bp / 100;
  return `${pct.toFixed(decimals).replace(/\.0+$/, '')}%`;
}

/**
 * Formats ISO date or YYYY-MM-DD date string.
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}
