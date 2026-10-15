/**
 * Shared Money, Ratio, and Rounding Primitives (SC §4.2, §4.3, §11.2)
 * - Money is integer minor units (paise, 1 INR = 100 paise)
 * - Ratios/rates are integer basis points (10000 bp = 100.00%, 1 bp = 0.01%)
 * - All divisions use half-to-even (banker's) rounding on integer/BigInt values
 */

function halfEvenRoundBigInt(numerator, denominator) {
  const num = BigInt(numerator);
  const den = BigInt(denominator);
  if (den === 0n) throw new Error('Division by zero in halfEvenRound');

  const sign = (num < 0n) !== (den < 0n) ? -1n : 1n;
  const absNum = num < 0n ? -num : num;
  const absDen = den < 0n ? -den : den;

  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const twiceRemainder = remainder * 2n;

  let rounded = quotient;
  if (twiceRemainder > absDen) {
    rounded = quotient + 1n;
  } else if (twiceRemainder === absDen) {
    if (quotient % 2n !== 0n) {
      rounded = quotient + 1n;
    }
  }
  return Number(sign * rounded);
}

function halfEvenRound(numerator, denominator = 1) {
  if (denominator === 1 && Number.isInteger(numerator)) return numerator;
  if (Number.isInteger(numerator) && Number.isInteger(denominator)) {
    return halfEvenRoundBigInt(numerator, denominator);
  }
  // Convert float to scaled integer precision
  const scaledNum = Math.round(numerator * 1e6);
  const scaledDen = Math.round(denominator * 1e6);
  return halfEvenRoundBigInt(scaledNum, scaledDen);
}

function rupeesToMinor(rupees) {
  if (rupees == null || Number.isNaN(Number(rupees))) return 0;
  return Math.round(Number(rupees) * 100);
}

function minorToRupees(minor) {
  if (minor == null || Number.isNaN(Number(minor))) return 0;
  return Number(minor) / 100;
}

function multiplyMinorByBp(minor, bp) {
  return halfEvenRoundBigInt(BigInt(Math.trunc(minor)) * BigInt(Math.trunc(bp)), 10000n);
}

function ratioToBp(numeratorMinor, denominatorMinor) {
  if (!denominatorMinor || Number(denominatorMinor) === 0) return 0;
  return halfEvenRoundBigInt(BigInt(Math.trunc(numeratorMinor)) * 10000n, BigInt(Math.trunc(denominatorMinor)));
}

function formatIndianInteger(intVal) {
  const s = Math.abs(Math.trunc(intVal)).toString();
  if (s.length <= 3) return s;
  const lastThree = s.slice(-3);
  const otherNumbers = s.slice(0, -3);
  const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${formattedOther},${lastThree}`;
}

function formatInr(minor) {
  const n = Number(minor) || 0;
  const sign = n < 0 ? '-' : '';
  const absMinor = Math.abs(Math.trunc(n));
  const rupees = halfEvenRoundBigInt(absMinor, 100);
  return `${sign}₹${formatIndianInteger(rupees)}`;
}

function formatInrPaise(minor) {
  const n = Number(minor) || 0;
  const sign = n < 0 ? '-' : '';
  const absMinor = Math.abs(Math.trunc(n));
  const whole = Math.floor(absMinor / 100);
  const paise = String(absMinor % 100).padStart(2, '0');
  return `${sign}₹${formatIndianInteger(whole)}.${paise}`;
}

function formatBpPct(bp) {
  const n = Number(bp) || 0;
  const sign = n < 0 ? '-' : '';
  const absBp = Math.abs(Math.trunc(n));
  const whole = Math.floor(absBp / 100);
  const frac = absBp % 100;
  if (frac === 0) return `${sign}${whole}%`;
  const fracStr = String(frac).padStart(2, '0').replace(/0+$/, '');
  return `${sign}${whole}.${fracStr}%`;
}

module.exports = {
  halfEvenRound,
  halfEvenRoundBigInt,
  rupeesToMinor,
  minorToRupees,
  multiplyMinorByBp,
  ratioToBp,
  formatIndianInteger,
  formatInr,
  formatInrPaise,
  formatBpPct,
};
