/**
 * Sentinel Stats & Arbitrary-Precision Math Primitives (Sentinel §B.4, §B.6, §H, §K.1)
 * Uses decimal.js (ROUND_HALF_EVEN) and integer BigInt arithmetic; zero IEEE-754 float math on _minor money fields.
 */

let Decimal;
try {
  Decimal = require('decimal.js');
} catch (_) {
  Decimal = require('../../../shared/decimal');
}
const {
  roundHalfEvenBigInt,
  divHalfEvenInt,
  mulBpHalfEven,
  ratioBpHalfEven,
} = require('../../../shared/money');

/**
 * Exact half-even rounding of a Decimal to integer Number.
 */
function toIntHalfEven(dec) {
  const d = dec instanceof Decimal ? dec : new Decimal(String(dec || 0));
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

/**
 * Median of integer _minor values using exact half-even tie-breaking on even sample sizes.
 */
function medianMinor(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].map((v) => BigInt(Math.trunc(v || 0))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return Number(sorted[mid]);
  }
  return Number(roundHalfEvenBigInt(sorted[mid - 1] + sorted[mid], 2n));
}

/**
 * Median Absolute Deviation (MAD) around medianMinor: median(|x_i - median(x)|).
 */
function madMinor(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const med = medianMinor(values);
  const deviations = values.map((v) => Math.abs(Math.trunc(v || 0) - med));
  return medianMinor(deviations);
}

/**
 * Order-statistic quantile p (0..100, e.g., 20 for p20, 80 for p80) using nearest-rank / linear order statistic
 * with half-even rounding in Decimal.
 */
function percentileMinor(values, pPercent) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].map((v) => Math.trunc(v || 0)).sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const n = sorted.length;
  // Rank index in [0, n - 1] using Decimal
  const pos = new Decimal(pPercent).div(100).mul(n - 1);
  const lowerIdx = Math.floor(pos.toNumber());
  const upperIdx = Math.ceil(pos.toNumber());
  if (lowerIdx === upperIdx) return sorted[lowerIdx];
  const weight = pos.sub(lowerIdx);
  const interp = new Decimal(sorted[lowerIdx])
    .mul(new Decimal(1).sub(weight))
    .add(new Decimal(sorted[upperIdx]).mul(weight));
  return toIntHalfEven(interp);
}

function p20Minor(values) {
  return percentileMinor(values, 20);
}

function p80Minor(values) {
  return percentileMinor(values, 80);
}

/**
 * Coefficient of variation (CV = stddev / mean) in basis points (10000 = 1.00) using Decimal.sqrt().
 */
function coefficientOfVariationBp(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const n = new Decimal(values.length);
  let sum = new Decimal(0);
  for (const v of values) {
    sum = sum.add(new Decimal(Math.trunc(v || 0)));
  }
  const mean = sum.div(n);
  if (mean.lte(0)) return 10000;

  let sqDiffSum = new Decimal(0);
  for (const v of values) {
    const diff = new Decimal(Math.trunc(v || 0)).sub(mean);
    sqDiffSum = sqDiffSum.add(diff.mul(diff));
  }
  const variance = sqDiffSum.div(n);
  const stdDev = variance.sqrt();
  const cvBp = stdDev.mul(10000).div(mean);
  return toIntHalfEven(cvBp);
}

/**
 * Mean of integer _minor values with half-even rounding.
 */
function meanMinor(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  let total = 0n;
  for (const v of values) {
    total += BigInt(Math.trunc(v || 0));
  }
  return Number(roundHalfEvenBigInt(total, BigInt(values.length)));
}

module.exports = {
  Decimal,
  toIntHalfEven,
  roundHalfEvenBigInt,
  divHalfEvenInt,
  mulBpHalfEven,
  ratioBpHalfEven,
  medianMinor,
  madMinor,
  percentileMinor,
  p20Minor,
  p80Minor,
  coefficientOfVariationBp,
  meanMinor,
};
