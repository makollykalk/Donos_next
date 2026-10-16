import { z } from 'zod';
import { ExactMoneyRatioSchema } from './exact-money.js';
import { InventoryValueStringSchema, QuantityStringSchema } from './inventory-schemas.js';
import { DecimalStringSchema, UUIDSchema } from './schemas.js';

const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(1000).nullable();
const money = InventoryValueStringSchema;
const nonnegativeDecimal = DecimalStringSchema.refine((value) => !value.startsWith('-'), 'O valor não pode ser negativo');
const positiveQuantity = QuantityStringSchema.refine((value) => value !== '0', 'A quantidade deve ser positiva');
const positiveMoney = money.refine((value) => value !== '0', 'O preço deve ser positivo');
const percentage = nonnegativeDecimal.refine((value) => {
  const [whole, fraction] = value.split('.');
  return BigInt(whole ?? '0') < 1n || (whole === '1' && fraction === undefined);
}, 'A taxa percentual deve estar entre 0 e 1');

export const PricingRateKindSchema = z.enum(['fee', 'tax', 'discount']);
export const PricingRateSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    id: UUIDSchema,
    kind: PricingRateKindSchema,
    mode: z.literal('percentage'),
    value: percentage,
    rateBase: z.enum(['list_price', 'net_after_discount']),
    fixedBasis: z.literal('per_sale'),
  }),
  z.strictObject({
    id: UUIDSchema,
    kind: PricingRateKindSchema,
    mode: z.literal('fixed'),
    value: money,
    rateBase: z.null(),
    fixedBasis: z.literal('per_sale'),
  }),
]).superRefine((rate, ctx) => {
  if (rate.kind === 'discount' && rate.mode === 'percentage' && rate.rateBase !== 'list_price') {
    ctx.addIssue({ code: 'custom', path: ['rateBase'], message: 'Desconto percentual incide sobre preço de lista' });
  }
});

export const PricingRateInputsSchema = z.array(PricingRateSchema).max(100).superRefine((rates, ctx) => {
  const ids = new Set<string>();
  for (const [index, rate] of rates.entries()) {
    if (ids.has(rate.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'IDs de taxas precisam ser únicos' });
    ids.add(rate.id);
  }
});

export const PricingPackagingSchema = z.strictObject({ id: UUIDSchema, name, costPerSale: money });
export const PricingPackagingInputsSchema = z.array(PricingPackagingSchema).max(100).superRefine((items, ctx) => {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'IDs de embalagem precisam ser únicos' });
    ids.add(item.id);
  }
});

export const ManualCostSourceInputSchema = z.strictObject({
  kind: z.literal('manual'),
  ingredientCost: money,
  currency: z.literal('BRL'),
});
export const RecipeCostSourceInputSchema = z.strictObject({
  kind: z.literal('recipe'),
  recipeId: UUIDSchema,
  locationId: UUIDSchema,
  quantityPerSale: positiveQuantity,
});
export const PricingVariantCostSourceSchema = z.discriminatedUnion('kind', [
  ManualCostSourceInputSchema.extend({ updatedAt: z.iso.datetime() }),
  RecipeCostSourceInputSchema,
]);
export const PricingCostSourceSnapshotSchema = z.discriminatedUnion('kind', [
  ManualCostSourceInputSchema.extend({ updatedAt: z.iso.datetime() }),
  z.strictObject({
    kind: z.literal('recipe'),
    recipeId: UUIDSchema,
    recipeVersionId: UUIDSchema,
    locationId: UUIDSchema,
    quantityPerSale: positiveQuantity,
    calculatedAt: z.iso.datetime(),
    unitCostExact: ExactMoneyRatioSchema,
    unitCostDisplay: money,
    components: z.array(z.strictObject({
      componentPath: z.array(z.string().min(1).max(120)).min(1).max(32),
      role: z.enum(['ingredient', 'packaging']),
      costPerFinalUnitExact: ExactMoneyRatioSchema,
    })).max(500),
  }),
]);

export const PricingCostComponentSchema = z.strictObject({
  componentPath: z.array(z.string().min(1).max(120)).min(1).max(32),
  role: z.enum(['ingredient', 'packaging']),
  costPerFinalUnitExact: ExactMoneyRatioSchema,
});

const contributionTarget = percentage.refine((value) => value !== '0', 'A margem alvo deve ser positiva').nullable();
const cmvTarget = percentage.refine((value) => value !== '0', 'O CMV alvo deve ser positivo').nullable();
const optionalTargets = z.strictObject({ targetContributionMargin: contributionTarget, targetCmv: cmvTarget })
  .refine((value) => value.targetContributionMargin !== null || value.targetCmv !== null, 'Informe pelo menos uma meta');

export const CreatePricingProductSchema = z.strictObject({ name, description });
export const UpdatePricingProductSchema = z.strictObject({ name: name.optional(), description: description.optional() })
  .refine((value) => Object.keys(value).length > 0, 'Informe pelo menos um campo');
export const CreatePricingVariantSchema = z.strictObject({
  name,
  listPrice: positiveMoney,
  costSource: z.discriminatedUnion('kind', [ManualCostSourceInputSchema, RecipeCostSourceInputSchema]),
  packaging: PricingPackagingInputsSchema,
  otherVariableCost: money,
});
export const UpdatePricingVariantSchema = CreatePricingVariantSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe pelo menos um campo');
export const CreatePricingChannelSchema = z.strictObject({ name, rates: PricingRateInputsSchema });
export const UpdatePricingChannelSchema = CreatePricingChannelSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe pelo menos um campo');

const componentPath = z.array(z.string().min(1).max(120)).min(1).max(32);
const replacedPaths = z.array(componentPath).max(100).superRefine((paths, ctx) => {
  const seen = new Set<string>();
  for (const [index, path] of paths.entries()) {
    const key = JSON.stringify(path);
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Caminho de embalagem repetido' });
    seen.add(key);
  }
});
const comboComponents = z.array(z.strictObject({
  variantId: UUIDSchema,
  quantity: positiveQuantity,
  replacedPackagingPaths: replacedPaths,
})).min(1).max(100);
const PricingComboFieldsSchema = z.strictObject({
  name,
  listPrice: positiveMoney,
  components: comboComponents,
  exclusivePackaging: PricingPackagingInputsSchema,
});
const refineCombo = (combo: z.infer<typeof PricingComboFieldsSchema>, ctx: z.RefinementCtx) => {
  const variantIds = new Set<string>();
  for (const [index, component] of combo.components.entries()) {
    if (variantIds.has(component.variantId)) {
      ctx.addIssue({ code: 'custom', path: ['components', index, 'variantId'], message: 'Variação repetida deve ser consolidada em uma única quantidade' });
    }
    variantIds.add(component.variantId);
  }
};
export const CreatePricingComboSchema = PricingComboFieldsSchema.superRefine(refineCombo);
export const UpdatePricingComboSchema = PricingComboFieldsSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe pelo menos um campo')
  .superRefine((combo, ctx) => {
    if (combo.components) refineCombo({ name: combo.name ?? 'Combo', listPrice: combo.listPrice ?? '1', components: combo.components, exclusivePackaging: combo.exclusivePackaging ?? [] }, ctx);
  });

export const CreatePricingSimulationSchema = z.strictObject({
  variantId: UUIDSchema.nullable(),
  comboId: UUIDSchema.nullable(),
  channelId: UUIDSchema,
  targetContributionMargin: contributionTarget,
  targetCmv: cmvTarget,
}).refine((value) => (value.variantId === null) !== (value.comboId === null), 'Escolha exatamente uma variação ou combo')
  .refine((value) => value.targetContributionMargin !== null || value.targetCmv !== null, 'Informe pelo menos uma meta');

export const PricingCalculationInputSchema = z.strictObject({
  ingredientCostExact: ExactMoneyRatioSchema,
  packagingCostExact: ExactMoneyRatioSchema,
  otherVariableCost: money,
  otherVariableCostExact: ExactMoneyRatioSchema.optional(),
  rates: PricingRateInputsSchema,
  listPrice: positiveMoney,
}).and(optionalTargets);

export const PricingComboCostInputSchema = z.strictObject({
  components: z.array(z.strictObject({
    variantId: UUIDSchema,
    quantity: positiveQuantity,
    costComponents: z.array(PricingCostComponentSchema).max(500),
    otherVariableCostPerSale: money,
    replacedPackagingPaths: replacedPaths,
  })).min(1).max(100),
  exclusivePackaging: PricingPackagingInputsSchema,
});

export const PricingMetricsSchema = z.strictObject({
  netRevenue: money,
  contributionMargin: DecimalStringSchema,
  cmv: DecimalStringSchema,
});
export const PricingCostBucketsSchema = z.strictObject({
  ingredients: money,
  packaging: money,
  otherVariable: money,
});
export const PricingQuoteSchema = z.strictObject({
  status: z.enum(['available', 'unavailable']),
  reason: z.string().max(120).nullable(),
  suggestedPrice: money.nullable(),
  costBuckets: PricingCostBucketsSchema,
  totalVariableCost: money,
  currentPriceMetrics: PricingMetricsSchema.nullable(),
  suggestedPriceMetrics: PricingMetricsSchema.nullable(),
  rateBreakdown: z.array(z.strictObject({
    rateId: UUIDSchema,
    base: money.nullable(),
    amount: money,
  })).max(100),
});

export const PricingVariantSummarySchema = z.strictObject({
  id: UUIDSchema, name, listPrice: money, status: z.enum(['active', 'archived']), costSourceKind: z.enum(['manual', 'recipe']),
});
export const PricingVariantSchema = z.strictObject({
  id: UUIDSchema, productId: UUIDSchema, name, listPrice: money,
  costSource: PricingVariantCostSourceSchema,
  packaging: PricingPackagingInputsSchema,
  otherVariableCost: money,
  archivedAt: z.iso.datetime().nullable(),
});
export const PricingVariantComboDetailsSchema = PricingVariantSchema.extend({
  packagingPaths: z.array(z.strictObject({ componentPath, label: z.string().trim().min(1).max(240) })).max(500),
  packagingPathsAvailable: z.boolean(),
});
export const PricingProductSchema = z.strictObject({
  id: UUIDSchema, name, description, archivedAt: z.iso.datetime().nullable(),
  variants: z.array(PricingVariantSummarySchema).max(500),
});
export const PricingChannelProfileSchema = z.strictObject({
  id: UUIDSchema, name, rates: PricingRateInputsSchema, archivedAt: z.iso.datetime().nullable(),
});
export const PricingComboSchema = z.strictObject({
  id: UUIDSchema, name, listPrice: money.nullable().optional(), components: comboComponents, exclusivePackaging: PricingPackagingInputsSchema,
  archivedAt: z.iso.datetime().nullable(),
});

export const PricingVariantSnapshotSchema = z.strictObject({
  variantId: UUIDSchema,
  name,
  listPrice: positiveMoney,
  costSourceSnapshot: PricingCostSourceSnapshotSchema,
  packaging: PricingPackagingInputsSchema,
  costComponents: z.array(PricingCostComponentSchema).max(500),
  otherVariableCost: money,
});

// Historical snapshots written before quantityPerSale was persisted remain readable.
const LegacyPricingCostSourceSnapshotSchema = z.discriminatedUnion('kind', [
  ManualCostSourceInputSchema.extend({ updatedAt: z.iso.datetime() }),
  z.strictObject({
    kind: z.literal('recipe'),
    recipeId: UUIDSchema,
    recipeVersionId: UUIDSchema,
    locationId: UUIDSchema,
    calculatedAt: z.iso.datetime(),
    unitCostExact: ExactMoneyRatioSchema,
    unitCostDisplay: money,
    components: z.array(z.strictObject({
      componentPath: z.array(z.string().min(1).max(120)).min(1).max(32),
      role: z.enum(['ingredient', 'packaging']),
      costPerFinalUnitExact: ExactMoneyRatioSchema,
    })).max(500),
  }),
]);
const PricingHistoricalVariantSnapshotSchema = PricingVariantSnapshotSchema.extend({
  costSourceSnapshot: LegacyPricingCostSourceSnapshotSchema,
});

export const PricingComboComponentCostSnapshotSchema = z.strictObject({
  variantSnapshot: PricingVariantSnapshotSchema,
  quantity: positiveQuantity,
  replacedPackagingPaths: replacedPaths,
});
const LegacyPricingComboComponentCostSnapshotSchema = z.strictObject({
  variantId: UUIDSchema,
  costSourceSnapshot: LegacyPricingCostSourceSnapshotSchema,
  costComponents: z.array(PricingCostComponentSchema).max(500),
  otherVariableCost: money,
  quantity: positiveQuantity,
  replacedPackagingPaths: replacedPaths,
});
export const PricingHistoricalComboComponentCostSnapshotSchema = z.union([
  PricingComboComponentCostSnapshotSchema,
  LegacyPricingComboComponentCostSnapshotSchema,
]);

export const PricingSimulationSchema = z.strictObject({
  id: UUIDSchema,
  variantId: UUIDSchema.nullable(),
  comboId: UUIDSchema.nullable(),
  channelId: UUIDSchema,
  inputSnapshot: CreatePricingSimulationSchema,
  costSourceSnapshot: LegacyPricingCostSourceSnapshotSchema.nullable(),
  variantSnapshot: PricingHistoricalVariantSnapshotSchema.nullable(),
  componentCostSnapshots: z.array(PricingHistoricalComboComponentCostSnapshotSchema).max(100),
  channelSnapshot: CreatePricingChannelSchema,
  comboSnapshot: PricingComboSchema.nullable(),
  quote: PricingQuoteSchema,
  createdAt: z.iso.datetime(),
}).superRefine((value, ctx) => {
  if ((value.variantId === null) === (value.comboId === null)) {
    ctx.addIssue({ code: 'custom', path: ['variantId'], message: 'Escolha exatamente uma variação ou combo' });
    return;
  }
  if (value.variantId !== null) {
    if (!value.costSourceSnapshot || (value.variantSnapshot && value.variantSnapshot.costSourceSnapshot.kind !== value.costSourceSnapshot.kind)
      || value.componentCostSnapshots.length !== 0 || value.comboSnapshot !== null) {
      ctx.addIssue({ code: 'custom', path: ['variantSnapshot'], message: 'Simulação de variação não aceita snapshot de combo e deve preservar a fonte de custo' });
    }
    return;
  }
  const combo = value.comboSnapshot;
  if (value.costSourceSnapshot !== null || value.variantSnapshot !== null || !combo
    || value.componentCostSnapshots.length !== combo.components.length) {
    ctx.addIssue({ code: 'custom', path: ['componentCostSnapshots'], message: 'Simulação de combo exige snapshot completo por componente' });
    return;
  }
  for (const [index, component] of value.componentCostSnapshots.entries()) {
    const configured = combo.components[index];
    const variantId = 'variantSnapshot' in component ? component.variantSnapshot.variantId : component.variantId;
    if (!configured || variantId !== configured.variantId || component.quantity !== configured.quantity
      || JSON.stringify(component.replacedPackagingPaths) !== JSON.stringify(configured.replacedPackagingPaths)) {
      ctx.addIssue({ code: 'custom', path: ['componentCostSnapshots', index], message: 'Snapshot do componente não corresponde ao combo selecionado' });
    }
  }
});

