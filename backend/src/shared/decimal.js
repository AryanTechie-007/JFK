/**
 * Arbitrary-Precision Decimal Arithmetic (SC §4.2, Sentinel §A.5 & §H)
 * Backed by BigInt fixed-point scaling (10^36 = 36 decimal places of intermediate precision)
 * with exact Banker's Rounding (ROUND_HALF_EVEN).
 */

const SCALE_DIGITS = 36n;
const SCALE = 10n ** SCALE_DIGITS;

function parseToScaledBigInt(value) {
  if (value instanceof Decimal) {
    return value._scaled;
  }
  if (typeof value === 'bigint') {
    return value * SCALE;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid Decimal number: ${value}`);
    }
    if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
      return BigInt(value) * SCALE;
    }
    return parseStringToScaled(value.toString());
  }
  if (typeof value === 'string') {
    return parseStringToScaled(value.trim());
  }
  throw new Error(`Unsupported Decimal input type: ${typeof value}`);
}

function parseStringToScaled(str) {
  if (!str) return 0n;
  let s = str.trim();
  let sign = 1n;
  if (s.startsWith('-')) {
    sign = -1n;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  let exp = 0;
  const eIdx = s.search(/[eE]/);
  if (eIdx !== -1) {
    exp = parseInt(s.slice(eIdx + 1), 10);
    s = s.slice(0, eIdx);
  }

  const parts = s.split('.');
  const intPart = parts[0] || '0';
  const fracPart = parts[1] || '';
  const combinedDigits = (intPart + fracPart).replace(/^0+(?=\d)/, '') || '0';
  const totalShift = Number(SCALE_DIGITS) + exp - fracPart.length;

  if (totalShift >= 0) {
    return sign * BigInt(combinedDigits) * (10n ** BigInt(totalShift));
  }
  const divisor = 10n ** BigInt(-totalShift);
  return divHalfEvenBigInt(sign * BigInt(combinedDigits), divisor);
}

function divHalfEvenBigInt(numerator, denominator) {
  if (denominator === 0n) {
    throw new Error('Decimal division by zero');
  }
  const sign = (numerator < 0n) !== (denominator < 0n) ? -1n : 1n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;

  const q = absNum / absDen;
  const r = absNum % absDen;
  const twiceR = r * 2n;

  let rounded = q;
  if (twiceR > absDen) {
    rounded = q + 1n;
  } else if (twiceR === absDen && q % 2n !== 0n) {
    rounded = q + 1n;
  }
  return sign * rounded;
}

class Decimal {
  constructor(value) {
    if (!(this instanceof Decimal)) {
      return new Decimal(value);
    }
    this._scaled = parseToScaledBigInt(value);
  }

  static fromScaled(scaledBigInt) {
    const d = Object.create(Decimal.prototype);
    d._scaled = scaledBigInt;
    return d;
  }

  static set(_config) {
    return Decimal;
  }

  plus(other) {
    return Decimal.fromScaled(this._scaled + parseToScaledBigInt(other));
  }

  add(other) {
    return this.plus(other);
  }

  minus(other) {
    return Decimal.fromScaled(this._scaled - parseToScaledBigInt(other));
  }

  sub(other) {
    return this.minus(other);
  }

  times(other) {
    const o = parseToScaledBigInt(other);
    return Decimal.fromScaled(divHalfEvenBigInt(this._scaled * o, SCALE));
  }

  mul(other) {
    return this.times(other);
  }

  div(other) {
    const o = parseToScaledBigInt(other);
    if (o === 0n) throw new Error('Decimal division by zero');
    return Decimal.fromScaled(divHalfEvenBigInt(this._scaled * SCALE, o));
  }

  dividedBy(other) {
    return this.div(other);
  }

  abs() {
    return Decimal.fromScaled(this._scaled < 0n ? -this._scaled : this._scaled);
  }

  neg() {
    return Decimal.fromScaled(-this._scaled);
  }

  sqrt() {
    if (this._scaled < 0n) throw new Error('Square root of negative Decimal');
    if (this._scaled === 0n) return Decimal.fromScaled(0n);
    const target = this._scaled * SCALE;
    let x0 = target;
    let x1 = (x0 + target / x0) >> 1n;
    // Better initial guess using bit length
    const bitLen = BigInt(target.toString(2).length);
    x0 = 1n << ((bitLen + 1n) >> 1n);
    x1 = (x0 + target / x0) >> 1n;
    while (x1 < x0) {
      x0 = x1;
      x1 = (x0 + target / x0) >> 1n;
    }
    return Decimal.fromScaled(x0);
  }

  pow(exp) {
    const n = Number(exp);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error('Decimal.pow supports non-negative integer exponents');
    }
    let result = Decimal.fromScaled(SCALE);
    let base = this;
    let e = n;
    while (e > 0) {
      if (e & 1) result = result.times(base);
      base = base.times(base);
      e >>= 1;
    }
    return result;
  }

  cmp(other) {
    const o = parseToScaledBigInt(other);
    if (this._scaled < o) return -1;
    if (this._scaled > o) return 1;
    return 0;
  }

  eq(other) {
    return this.cmp(other) === 0;
  }

  gt(other) {
    return this.cmp(other) > 0;
  }

  gte(other) {
    return this.cmp(other) >= 0;
  }

  lt(other) {
    return this.cmp(other) < 0;
  }

  lte(other) {
    return this.cmp(other) <= 0;
  }

  isZero() {
    return this._scaled === 0n;
  }

  isNegative() {
    return this._scaled < 0n;
  }

  isPositive() {
    return this._scaled > 0n;
  }

  round() {
    const roundedInt = divHalfEvenBigInt(this._scaled, SCALE);
    return Decimal.fromScaled(roundedInt * SCALE);
  }

  toRoundedInt() {
    return Number(divHalfEvenBigInt(this._scaled, SCALE));
  }

  toDecimalPlaces(dp = 0) {
    const places = BigInt(Math.max(0, Math.min(36, Number(dp) || 0)));
    const factor = 10n ** (SCALE_DIGITS - places);
    const rounded = divHalfEvenBigInt(this._scaled, factor);
    return Decimal.fromScaled(rounded * factor);
  }

  toFixed(dp = 0) {
    const places = Math.max(0, Math.min(36, Number(dp) || 0));
    const factor = 10n ** (SCALE_DIGITS - BigInt(places));
    const rounded = divHalfEvenBigInt(this._scaled, factor);
    const sign = rounded < 0n ? '-' : '';
    const absVal = rounded < 0n ? -rounded : rounded;
    if (places === 0) {
      return `${sign}${absVal.toString()}`;
    }
    const s = absVal.toString().padStart(places + 1, '0');
    const intPart = s.slice(0, s.length - places);
    const fracPart = s.slice(s.length - places);
    return `${sign}${intPart}.${fracPart}`;
  }

  toNumber() {
    return Number(this.toFixed(12));
  }

  toString() {
    const fixed = this.toFixed(18);
    if (!fixed.includes('.')) return fixed;
    return fixed.replace(/\.?0+$/, '');
  }
}

Decimal.ROUND_UP = 0;
Decimal.ROUND_DOWN = 1;
Decimal.ROUND_CEIL = 2;
Decimal.ROUND_FLOOR = 3;
Decimal.ROUND_HALF_UP = 4;
Decimal.ROUND_HALF_DOWN = 5;
Decimal.ROUND_HALF_EVEN = 6;
Decimal.Decimal = Decimal;
Decimal.default = Decimal;

module.exports = Decimal;
