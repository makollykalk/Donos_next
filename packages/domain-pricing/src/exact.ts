import type { ExactMoneyRatio } from '@donos/contracts';

export type Fraction = { n: bigint; d: bigint };

const abs = (value: bigint) => value < 0n ? -value : value;
export const gcd = (a: bigint, b: bigint): bigint => {
  let left = abs(a);
  let right = abs(b);
  while (right !== 0n) [left, right] = [right, left % right];
  return left || 1n;
};

export const fraction = (n: bigint, d = 1n): Fraction => {
  if (d === 0n) throw new Error('DENOMINATOR_ZERO');
  const sign = d < 0n ? -1n : 1n;
  const divisor = gcd(n, d);
  return { n: (n / divisor) * sign, d: abs(d) / divisor };
};
export const add = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.n, a.d * b.d);
export const div = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d, a.d * b.n);
export const compare = (a: Fraction, b: Fraction): number => {
  const value = a.n * b.d - b.n * a.d;
  return value < 0n ? -1 : value > 0n ? 1 : 0;
};
export const max = (a: Fraction, b: Fraction): Fraction => compare(a, b) >= 0 ? a : b;
export const zero = (): Fraction => fraction(0n);
export const one = (): Fraction => fraction(1n);

export const decimalFraction = (value: string): Fraction => {
  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const [whole, decimal = ''] = normalized.split('.');
  const scale = 10n ** BigInt(decimal.length);
  const numerator = BigInt(`${whole}${decimal}`) * (negative ? -1n : 1n);
  return fraction(numerator, scale);
};

export const exactMoneyFraction = (value: ExactMoneyRatio): Fraction => fraction(BigInt(value.numerator), BigInt(value.denominator) * 1_000_000_000_000n);
export const exactMoneyRatio = (value: Fraction): ExactMoneyRatio => {
  if (value.n < 0n) throw new Error('NEGATIVE_MONEY');
  const scaled = fraction(value.n * 1_000_000_000_000n, value.d);
  return { numerator: scaled.n.toString(), denominator: scaled.d.toString() };
};

export const ceil = (value: Fraction): bigint => value.n >= 0n ? (value.n + value.d - 1n) / value.d : value.n / value.d;

const roundHalfEven = (value: Fraction, scale: bigint): bigint => {
  const negative = value.n < 0n;
  const numerator = abs(value.n) * scale;
  const quotient = numerator / value.d;
  const remainder = numerator % value.d;
  const rounded = remainder * 2n > value.d || (remainder * 2n === value.d && quotient % 2n === 1n)
    ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
};

export const decimalString = (value: Fraction, scale = 12): string => {
  const factor = 10n ** BigInt(scale);
  const rounded = roundHalfEven(value, factor);
  const negative = rounded < 0n;
  const absolute = abs(rounded);
  const whole = (absolute / factor).toString();
  const decimal = (absolute % factor).toString().padStart(scale, '0').replace(/0+$/u, '');
  return `${negative ? '-' : ''}${whole}${decimal ? `.${decimal}` : ''}`;
};

export const moneyString = (value: Fraction): string => decimalString(value, 12);
export const priceCeilToCent = (value: Fraction): Fraction => fraction(ceil(mul(value, fraction(100n))), 100n);

export const exceedsCoefficientBound = (value: Fraction, digits = 256): boolean =>
  value.n.toString().replace('-', '').length > digits || value.d.toString().length > digits;
