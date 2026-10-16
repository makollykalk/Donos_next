import { describe, expect, it } from 'vitest';
import {
  CreatePricingComboSchema,
  CreatePricingSimulationSchema,
  CreatePricingVariantSchema,
  ExactMoneyRatioSchema,
  PricingRateSchema,
} from '@donos/contracts';

const recipeId = '10000000-0000-4000-8000-000000000001';
const locationId = '10000000-0000-4000-8000-000000000002';
const variantId = '10000000-0000-4000-8000-000000000003';
const channelId = '10000000-0000-4000-8000-000000000004';
const packageId = '10000000-0000-4000-8000-000000000005';

const manualVariant = {
  name: 'Pizza brotinho',
  listPrice: '42.9',
  costSource: { kind: 'manual', ingredientCost: '20', currency: 'BRL' },
  packaging: [{ id: packageId, name: 'Caixa', costPerSale: '0.5' }],
  otherVariableCost: '2',
};

describe('pricing contracts', () => {
  it('rejects_json_numbers_and_noncanonical_decimals', () => {
    expect(CreatePricingVariantSchema.safeParse({ ...manualVariant, listPrice: 42.9 }).success).toBe(false);
    expect(CreatePricingVariantSchema.safeParse({
      ...manualVariant,
      costSource: { kind: 'manual', ingredientCost: '020', currency: 'BRL' },
    }).success).toBe(false);
  });

  it('requires_exactly_one_simulation_target', () => {
    const base = { channelId, targetContributionMargin: '0.25', targetCmv: '0.3' };
    expect(CreatePricingSimulationSchema.safeParse({ ...base, variantId, comboId: null }).success).toBe(true);
    expect(CreatePricingSimulationSchema.safeParse({ ...base, variantId: null, comboId: variantId }).success).toBe(true);
    expect(CreatePricingSimulationSchema.safeParse({ ...base, variantId: null, comboId: null }).success).toBe(false);
    expect(CreatePricingSimulationSchema.safeParse({ ...base, variantId, comboId: variantId }).success).toBe(false);
  });

  it('requires_recipe_quantity_and_location', () => {
    const source = { kind: 'recipe', recipeId, locationId, quantityPerSale: '1.25' };
    expect(CreatePricingVariantSchema.safeParse({ ...manualVariant, costSource: source }).success).toBe(true);
    expect(CreatePricingVariantSchema.safeParse({
      ...manualVariant,
      costSource: { kind: 'recipe', recipeId, quantityPerSale: '1.25' },
    }).success).toBe(false);
    expect(CreatePricingVariantSchema.safeParse({
      ...manualVariant,
      costSource: { kind: 'recipe', recipeId, locationId, quantityPerSale: '0' },
    }).success).toBe(false);
  });

  it('rejects_invalid_rate_bases_and_percentages', () => {
    expect(PricingRateSchema.safeParse({
      id: channelId, kind: 'fee', mode: 'percentage', value: '0.1',
      rateBase: 'list_price', fixedBasis: 'per_sale',
    }).success).toBe(true);
    expect(PricingRateSchema.safeParse({
      id: channelId, kind: 'fee', mode: 'percentage', value: '1.01',
      rateBase: 'list_price', fixedBasis: 'per_sale',
    }).success).toBe(false);
    expect(PricingRateSchema.safeParse({
      id: channelId, kind: 'discount', mode: 'percentage', value: '0.1',
      rateBase: 'net_after_discount', fixedBasis: 'per_sale',
    }).success).toBe(false);
    expect(PricingRateSchema.safeParse({
      id: channelId, kind: 'tax', mode: 'fixed', value: '1.5',
      rateBase: 'list_price', fixedBasis: 'per_sale',
    }).success).toBe(false);
  });

  it('rejects_duplicate_packaging_paths', () => {
    expect(CreatePricingVariantSchema.safeParse({
      ...manualVariant,
      packaging: [
        { id: packageId, name: 'Caixa', costPerSale: '0.5' },
        { id: packageId, name: 'Outra caixa', costPerSale: '0.7' },
      ],
    }).success).toBe(false);
    expect(CreatePricingComboSchema.safeParse({
      name: 'Combo',
      components: [{ variantId, quantity: '1', replacedPackagingPaths: [['box-1'], ['box-1']] }],
      exclusivePackaging: [],
    }).success).toBe(false);
  });

  it('accepts_manual_and_recipe_variant_inputs_without_rewriting_them', () => {
    expect(CreatePricingVariantSchema.parse(manualVariant)).toEqual(manualVariant);
    const recipeVariant = {
      ...manualVariant,
      costSource: { kind: 'recipe', recipeId, locationId, quantityPerSale: '1.25' },
    };
    expect(CreatePricingVariantSchema.parse(recipeVariant)).toEqual(recipeVariant);
  });

  it('accepts_only_canonical_bounded_exact_money_ratios', () => {
    expect(ExactMoneyRatioSchema.safeParse({ numerator: '25', denominator: '2' }).success).toBe(true);
    for (const invalid of [
      { numerator: '01', denominator: '10' },
      { numerator: '-1', denominator: '2' },
      { numerator: '1', denominator: '0' },
      { numerator: 1, denominator: '2' },
      { numerator: '1'.repeat(257), denominator: '1' },
    ]) {
      expect(ExactMoneyRatioSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
