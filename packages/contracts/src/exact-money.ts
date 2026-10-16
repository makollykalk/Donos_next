import { z } from 'zod';

const UnsignedCoefficientSchema = z.string()
  .regex(/^(?:0|[1-9][0-9]{0,255})(?![\s\S])/u);
const PositiveCoefficientSchema = z.string()
  .regex(/^[1-9][0-9]{0,255}(?![\s\S])/u);

/** BRL = numerator / denominator / 10^12. Integer coefficients are canonical and GCD-reduced. */
export const ExactMoneyRatioSchema = z.strictObject({
  numerator: UnsignedCoefficientSchema,
  denominator: PositiveCoefficientSchema,
}).superRefine(({ numerator, denominator }, ctx) => {
  let left = BigInt(numerator);
  let right = BigInt(denominator);
  while (right !== 0n) [left, right] = [right, left % right];
  if (left !== 1n) {
    ctx.addIssue({ code: 'custom', path: ['numerator'], message: 'A razão deve estar reduzida pelo máximo divisor comum' });
  }
});

export type ExactMoneyRatio = z.infer<typeof ExactMoneyRatioSchema>;

