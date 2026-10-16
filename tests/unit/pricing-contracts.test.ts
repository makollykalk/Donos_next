import { describe, expect, it } from 'vitest';
import {
  CreatePricingComboSchema,
  CreatePricingSimulationSchema,
  CreatePricingVariantSchema,
  ExactMoneyRatioSchema,
  PricingSimulationSchema,
  PricingCostSourceSnapshotSchema,
  PricingVariantSnapshotSchema,
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
const manualVariantSnapshot = {
  variantId,
  name: 'Pizza brotinho',
  listPrice: '42.9',
  costSourceSnapshot: { kind: 'manual' as const, ingredientCost: '20', currency: 'BRL' as const, updatedAt: '2026-10-16T12:00:00.000Z' },
  packaging: [{ id: packageId, name: 'Caixa', costPerSale: '0.5' }],
  costComponents: [
    { componentPath: ['manual-ingredient'], role: 'ingredient' as const, costPerFinalUnitExact: { numerator: '20000000000000', denominator: '1' } },
    { componentPath: [packageId], role: 'packaging' as const, costPerFinalUnitExact: { numerator: '500000000000', denominator: '1' } },
  ],
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

  it('requires_each_combo_simulation_component_to_snapshot_its_cost_source_and_packaging_override', () => {
    const timestamp = '2026-10-16T12:00:00.000Z';
    const componentSnapshot = {
      variantSnapshot: manualVariantSnapshot,
      quantity: '2',
      replacedPackagingPaths: [[packageId]],
    };
    const simulation = {
      id: '10000000-0000-4000-8000-000000000006',
      variantId: null,
      comboId: '10000000-0000-4000-8000-000000000007',
      channelId,
      inputSnapshot: { variantId: null, comboId: '10000000-0000-4000-8000-000000000007', channelId, targetContributionMargin: '0.25', targetCmv: null },
      costSourceSnapshot: null,
      variantSnapshot: null,
      componentCostSnapshots: [componentSnapshot],
      channelSnapshot: { name: 'Direto', rates: [] },
      comboSnapshot: {
        id: '10000000-0000-4000-8000-000000000007', name: 'Combo', listPrice: '12', archivedAt: null, exclusivePackaging: [],
        components: [{ variantId, quantity: '2', replacedPackagingPaths: [[packageId]] }],
      },
      quote: {
        status: 'available', reason: null, suggestedPrice: '12', costBuckets: { ingredients: '4', packaging: '0', otherVariable: '0.5' },
        totalVariableCost: '4.5', currentPriceMetrics: null, suggestedPriceMetrics: null, rateBreakdown: [],
      },
      createdAt: timestamp,
    };
    const parsed = PricingSimulationSchema.safeParse(simulation);
    expect(parsed.success, JSON.stringify(parsed.success ? [] : parsed.error.issues)).toBe(true);
    expect(PricingSimulationSchema.safeParse({ ...simulation, componentCostSnapshots: [] }).success).toBe(false);
  });

  it('freezes_every_variant_input', () => {
    expect(PricingVariantSnapshotSchema.parse(manualVariantSnapshot)).toEqual(manualVariantSnapshot);
    expect(PricingVariantSnapshotSchema.safeParse({ ...manualVariantSnapshot, packaging: [] }).success).toBe(true);
    expect(PricingVariantSnapshotSchema.safeParse({ ...manualVariantSnapshot, listPrice: '0' }).success).toBe(false);
    const combo = { name: 'Combo', listPrice: '29.9', components: [{ variantId, quantity: '1', replacedPackagingPaths: [] }], exclusivePackaging: [] };
    expect(CreatePricingComboSchema.safeParse(combo).success).toBe(true);
    expect(CreatePricingComboSchema.safeParse({ ...combo, listPrice: '0' }).success).toBe(false);
  });

  it('reads_preexisting_simulations_without_rewriting_incomplete_legacy_snapshots', () => {
    const timestamp = '2026-10-16T12:00:00.000Z';
    const legacy = {
      id: '10000000-0000-4000-8000-000000000006',
      variantId,
      comboId: null,
      channelId,
      inputSnapshot: { variantId, comboId: null, channelId, targetContributionMargin: '0.25', targetCmv: null },
      costSourceSnapshot: { kind: 'manual' as const, ingredientCost: '20', currency: 'BRL' as const, updatedAt: timestamp },
      variantSnapshot: null,
      componentCostSnapshots: [],
      channelSnapshot: { name: 'Direto', rates: [] },
      comboSnapshot: null,
      quote: { status: 'available', reason: null, suggestedPrice: '42.9', costBuckets: { ingredients: '20', packaging: '0', otherVariable: '0' }, totalVariableCost: '20', currentPriceMetrics: null, suggestedPriceMetrics: null, rateBreakdown: [] },
      createdAt: timestamp,
    };
    expect(PricingSimulationSchema.parse(legacy).variantSnapshot).toBeNull();
    const legacyCombo = {
      ...legacy,
      variantId: null,
      comboId: '10000000-0000-4000-8000-000000000007',
      inputSnapshot: { variantId: null, comboId: '10000000-0000-4000-8000-000000000007', channelId, targetContributionMargin: '0.25', targetCmv: null },
      costSourceSnapshot: null,
      componentCostSnapshots: [{
        variantId, costSourceSnapshot: legacy.costSourceSnapshot, costComponents: [], otherVariableCost: '2', quantity: '1', replacedPackagingPaths: [],
      }],
      comboSnapshot: { id: '10000000-0000-4000-8000-000000000007', name: 'Combo', exclusivePackaging: [], components: [{ variantId, quantity: '1', replacedPackagingPaths: [] }], archivedAt: null },
    };
    expect(PricingSimulationSchema.parse(legacyCombo).componentCostSnapshots).toHaveLength(1);
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

  it('freezes_recipe_quantity_per_sale_in_the_cost_source_snapshot', () => {
    const snapshot = {
      kind: 'recipe', recipeId, recipeVersionId: '10000000-0000-4000-8000-000000000008', locationId,
      quantityPerSale: '2.5', calculatedAt: '2026-10-16T12:00:00.000Z',
      unitCostExact: { numerator: '10000000000000', denominator: '1' }, unitCostDisplay: '10', components: [],
    };
    expect(PricingCostSourceSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    const withoutQuantity = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'quantityPerSale'));
    expect(PricingCostSourceSnapshotSchema.safeParse(withoutQuantity).success).toBe(false);
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
