import { add, compare, decimalFraction, type Fraction, fraction, sub, zero } from './exact.js';

export const sum = (values: Fraction[]): Fraction => values.reduce((total, value) => add(total, value), zero());
export const positive = (value: Fraction): boolean => compare(value, zero()) > 0;
export const nonnegative = (value: Fraction): boolean => compare(value, zero()) >= 0;
export const remainder = (value: Fraction, portion: Fraction): Fraction => sub(value, portion);
export const parseDecimal = (value: string): Fraction => decimalFraction(value);
export const integerFraction = (value: bigint): Fraction => fraction(value);
