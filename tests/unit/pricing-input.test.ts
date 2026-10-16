import { describe, expect, it } from 'vitest';
import { normalizePricingDecimalInput } from '../../apps/precificacao/src/pricing/decimal-input.js';

describe('normalização de decimal do App 02', () => {
  it('normalizes_brazilian_decimal_without_number_conversion', () => {
    expect(normalizePricingDecimalInput(' 12,34 ', 2)).toBe('12.34');
    expect(normalizePricingDecimalInput('1.234,56', 2)).toBe('1234.56');
    expect(normalizePricingDecimalInput('1.234.567,890001', 6)).toBe('1234567.890001');
    expect(normalizePricingDecimalInput('00012,3400', 2)).toBe('12.34');
  });

  it('rejects_excess_scale', () => {
    expect(() => normalizePricingDecimalInput('1,234', 2)).toThrow(/casas decimais/u);
    expect(() => normalizePricingDecimalInput('12.34.567,89', 2)).toThrow(/formato/u);
  });

  it('preserves_empty_optional_value', () => {
    expect(normalizePricingDecimalInput('   ', 2, true)).toBe('');
    expect(() => normalizePricingDecimalInput('   ', 2)).toThrow(/obrigatório/u);
  });
});
