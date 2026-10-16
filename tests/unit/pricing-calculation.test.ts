import { describe, expect, it } from 'vitest';
import { calculateComboCost, calculatePricingQuote, PricingCalculationError } from '@donos/domain-pricing';
import type { ExactMoneyRatio, PricingCalculationInput, PricingPackagingInput, PricingRateInput } from '@donos/contracts';

const ratio = (decimal: string): ExactMoneyRatio => {
  const [whole, fraction = ''] = decimal.split('.');
  return { numerator: `${whole}${fraction.padEnd(12, '0')}`.replace(/^0+(?=\d)/u, ''), denominator: '1' };
};
const uuid = (last: string) => `00000000-0000-4000-8000-${last.padStart(12, '0')}`;
const rates = (...items: Array<Omit<PricingRateInput, 'id'>>): PricingRateInput[] => items.map((item, i) => ({ ...item, id: uuid(String(i + 1)) })) as PricingRateInput[];
const input = (overrides: Partial<PricingCalculationInput> = {}): PricingCalculationInput => ({
  ingredientCostExact: ratio('20'), packagingCostExact: ratio('0'), otherVariableCost: '2',
  rates: rates({ kind: 'fee', mode: 'percentage', value: '0.1', rateBase: 'list_price', fixedBasis: 'per_sale' },
    { kind: 'tax', mode: 'percentage', value: '0.05', rateBase: 'list_price', fixedBasis: 'per_sale' }),
  listPrice: '50', targetContributionMargin: '0.25', targetCmv: '0.3', ...overrides,
});
const packaging = (id: string, costPerSale: string): PricingPackagingInput => ({ id: uuid(id), name: `Embalagem ${id}`, costPerSale });

describe('pricing calculation', () => {
  it('calculates_margin_quote_and_rounds_up_to_cent', () => {
    const quote = calculatePricingQuote(input({ targetCmv: null }));
    expect(quote.suggestedPrice).toBe('36.67');
    expect(quote.suggestedPriceMetrics?.contributionMargin).toBe('0.250054540496');
  });

  it('uses_higher_price_when_margin_and_cmv_are_both_active', () => {
    const quote = calculatePricingQuote(input());
    expect(quote.suggestedPrice).toBe('66.67');
    expect(quote.suggestedPriceMetrics?.cmv).toBe('0.29998500075');
  });

  it('rejects_nonpositive_denominator', () => {
    expect(() => calculatePricingQuote(input({ rates: rates(
      { kind: 'fee', mode: 'percentage', value: '0.8', rateBase: 'list_price', fixedBasis: 'per_sale' },
      { kind: 'tax', mode: 'percentage', value: '0.2', rateBase: 'list_price', fixedBasis: 'per_sale' }),
      targetContributionMargin: '0.1', targetCmv: null,
    }))).toThrowError(new PricingCalculationError('NON_POSITIVE_DENOMINATOR'));
  });

  it('calculates_approved_discount_and_rate_bases', () => {
    const listBased = calculatePricingQuote(input({
      rates: rates(
        { kind: 'discount', mode: 'percentage', value: '0.1', rateBase: 'list_price', fixedBasis: 'per_sale' },
        { kind: 'fee', mode: 'percentage', value: '0.1', rateBase: 'list_price', fixedBasis: 'per_sale' }),
      targetContributionMargin: null, targetCmv: '0.5',
    }));
    const netBased = calculatePricingQuote(input({
      rates: rates(
        { kind: 'discount', mode: 'percentage', value: '0.1', rateBase: 'list_price', fixedBasis: 'per_sale' },
        { kind: 'fee', mode: 'percentage', value: '0.1', rateBase: 'net_after_discount', fixedBasis: 'per_sale' }),
      targetContributionMargin: null, targetCmv: '0.5',
    }));
    expect(listBased.rateBreakdown[1]?.amount).toBe('5');
    expect(netBased.rateBreakdown[1]?.amount).toBe('4.5');
  });

  it('charges_fixed_fee_once_per_sale', () => {
    const quote = calculatePricingQuote(input({ rates: rates(
      { kind: 'fee', mode: 'fixed', value: '3', rateBase: null, fixedBasis: 'per_sale' }),
      targetContributionMargin: '0.25', targetCmv: null,
    }));
    expect(quote.suggestedPrice).toBe('33.34');
    expect(quote.rateBreakdown).toHaveLength(1);
  });

  it('applies_fixed_discount_once_and_rejects_output_overflow_explicitly', () => {
    const quote = calculatePricingQuote(input({ rates: rates(
      { kind: 'discount', mode: 'fixed', value: '5', rateBase: null, fixedBasis: 'per_sale' }),
      targetContributionMargin: null, targetCmv: '0.5',
    }));
    expect(quote.suggestedPrice).toBe('45');
    expect(quote.currentPriceMetrics?.netRevenue).toBe('45');
    expect(() => calculatePricingQuote(input({
      ingredientCostExact: { numerator: `1${'0'.repeat(39)}`, denominator: '1' },
      rates: [], targetContributionMargin: '0.25', targetCmv: null,
    }))).toThrowError(new PricingCalculationError('NUMERIC_RANGE'));
  });

  it('keeps_suggested_price_above_fixed_discount_even_with_zero_ingredient_cost', () => {
    const quote = calculatePricingQuote(input({
      ingredientCostExact: ratio('0'), packagingCostExact: ratio('0'), otherVariableCost: '0',
      rates: rates({ kind: 'discount', mode: 'fixed', value: '5', rateBase: null, fixedBasis: 'per_sale' }),
      targetContributionMargin: '0.25', targetCmv: null,
    }));
    expect(quote.suggestedPrice).toBe('5.01');
    expect(quote.suggestedPriceMetrics?.netRevenue).toBe('0.01');
  });

  it('replaces_only_selected_packaging_paths', () => {
    const components = [
      { variantId: uuid('101'), quantity: '2', otherVariableCostPerSale: '1', costComponents: [
        { componentPath: ['i1'], role: 'ingredient' as const, costPerFinalUnitExact: ratio('10') },
        { componentPath: ['p1'], role: 'packaging' as const, costPerFinalUnitExact: ratio('1') },
        { componentPath: ['p2'], role: 'packaging' as const, costPerFinalUnitExact: ratio('2') },
      ], replacedPackagingPaths: [['p1']] },
      { variantId: uuid('102'), quantity: '1', otherVariableCostPerSale: '0', costComponents: [
        { componentPath: ['i2'], role: 'ingredient' as const, costPerFinalUnitExact: ratio('5') },
        { componentPath: ['p3'], role: 'packaging' as const, costPerFinalUnitExact: ratio('3') },
      ], replacedPackagingPaths: [] },
    ];
    const result = calculateComboCost({ components, exclusivePackaging: [packaging('9', '4')] });
    expect(result.ingredientCostExact).toEqual(ratio('25'));
    expect(result.packagingCostExact).toEqual(ratio('11'));
    expect(result.otherVariableCostExact).toEqual(ratio('2'));
    expect(result.totalCostExact).toEqual(ratio('38'));
  });

  it('scales_recipe_component_ratios_by_fractional_sale_quantity_without_rounding', () => {
    const result = calculateComboCost({
      components: [{
        variantId: uuid('201'), quantity: '0.5', otherVariableCostPerSale: '0', replacedPackagingPaths: [],
        costComponents: [{
          componentPath: ['recipe-leaf'], role: 'ingredient',
          costPerFinalUnitExact: { numerator: '1000000000000', denominator: '3' },
        }],
      }],
      exclusivePackaging: [],
    });
    expect(result.ingredientCostExact).toEqual({ numerator: '500000000000', denominator: '3' });
  });
});
