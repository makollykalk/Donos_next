import type { ContextSelection, PricingCostSourceSnapshot, PricingSimulation, PricingVariant, PricingVariantComboDetails } from '@donos/contracts';
import {
  DomainError, appendPricingAudit, executeIdempotent, pricingRepository, retryIdempotent,
} from '@donos/db';
import type { Database, PricingAuditAction, RestaurantContext, Tx, VerifiedActor } from '@donos/db';
import { listCapabilities, requireEntitlement } from '@donos/domain-billing';
import { calculateComboCost, calculatePricingQuote, scalePricingVariantCostComponents, decimalFraction, exactMoneyFraction, exactMoneyRatio, add, zero } from '@donos/domain-pricing';
import type { PricingCostComponent, PricingVariantSnapshot } from '@donos/contracts';
import { PricingVariantComboDetailsSchema } from '@donos/contracts';
import { createRecipeService } from './recipes.js';
import type { PricingService } from './pricing-types.js';


export function createPricingService(db: Database): PricingService {
  async function withAccess<T>(actor: VerifiedActor, selection: ContextSelection, token: string, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await retryIdempotent(() => db.withRestaurantTx(actor, selection, token, async (ctx, tx) => {
        await requireEntitlement(ctx, 'pricing_core', tx);
        return fn(ctx, tx);
      }));
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === '23503' || code === 'P0002') throw new DomainError('RESOURCE_NOT_FOUND', 404);
      if (code === '23505' || code === '40001' || code === '40P01') throw new DomainError('RESOURCE_CONFLICT', 409);
      if (code === '23514' || code === '22P02') throw new DomainError('VALIDATION_ERROR', 400);
      throw error;
    }
  }
  function mutate<T>(actor: VerifiedActor, selection: ContextSelection, token: string, operation: string, key: string, input: unknown, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>): Promise<T> {
    return withAccess(actor, selection, token, (ctx, tx) => executeIdempotent(
      { kind: 'organization', context: ctx }, `pricing.${operation}`, key, { selection, input }, tx, () => fn(ctx, tx),
    ));
  }
  async function audit<T extends { id: string }>(ctx: RestaurantContext, action: PricingAuditAction, result: Promise<T>, tx: Tx): Promise<T> {
    const entity = await result;
    await appendPricingAudit(ctx, { action, entityId: entity.id }, tx);
    return entity;
  }

  async function costSourceSnapshot(actor: VerifiedActor, selection: ContextSelection, token: string, variant: PricingVariant): Promise<PricingCostSourceSnapshot> {
    if (variant.costSource.kind === 'manual') return variant.costSource;
    const cost = await createRecipeService(db).getRecipeCost(actor, selection, token, variant.costSource.recipeId, variant.costSource.locationId);
    if (cost.status !== 'available' || !cost.costPerFinalUnitExact || !cost.costPerFinalUnit || !cost.costComponents) throw new DomainError('RESOURCE_CONFLICT', 409);
    if (cost.recipeId !== variant.costSource.recipeId || cost.locationId !== variant.costSource.locationId) throw new DomainError('RESOURCE_CONFLICT', 409);
    return {
      kind: 'recipe', recipeId: cost.recipeId, recipeVersionId: cost.recipeVersionId,
      locationId: cost.locationId, quantityPerSale: variant.costSource.kind === 'recipe' ? variant.costSource.quantityPerSale : '1',
      calculatedAt: cost.calculatedAt,
      unitCostExact: cost.costPerFinalUnitExact, unitCostDisplay: cost.costPerFinalUnit,
      components: cost.costComponents,
    };
  }

  async function snapshotVariant(actor: VerifiedActor, selection: ContextSelection, token: string, variant: PricingVariant): Promise<PricingVariantSnapshot> {
    const source = await costSourceSnapshot(actor, selection, token, variant);
    const sourceComponents: PricingCostComponent[] = source.kind === 'manual'
      ? [{ componentPath: ['manual-ingredient'], role: 'ingredient', costPerFinalUnitExact: exactMoneyRatio(decimalFraction(source.ingredientCost)) }]
      : source.components;
    const packageComponents: PricingCostComponent[] = variant.packaging.map((item) => ({
      componentPath: ['app02-packaging', item.id], role: 'packaging', costPerFinalUnitExact: exactMoneyRatio(decimalFraction(item.costPerSale)),
    }));
    const costComponents = source.kind === 'recipe'
      ? scalePricingVariantCostComponents(sourceComponents, packageComponents, source.quantityPerSale)
      : [...sourceComponents, ...packageComponents];
    return {
      variantId: variant.id, name: variant.name, listPrice: variant.listPrice,
      costSourceSnapshot: source, packaging: variant.packaging, costComponents, otherVariableCost: variant.otherVariableCost,
    };
  }

  const service: PricingService = {
    createProduct: (actor, selection, token, input, key) => mutate(actor, selection, token, 'product.create', key, input, (ctx, tx) => audit(ctx, 'pricing.product.created', pricingRepository.createPricingProduct(ctx, input, tx), tx)),
    updateProduct: (actor, selection, token, id, input, key) => mutate(actor, selection, token, 'product.update', key, { id, input }, async (ctx, tx) => {
      const result = await pricingRepository.updatePricingProduct(ctx, id, input, tx);
      if (!result) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      return audit(ctx, 'pricing.product.updated', Promise.resolve(result), tx);
    }),
    listProducts: (actor, selection, token, query) => withAccess(actor, selection, token, (ctx, tx) => pricingRepository.listPricingProducts(ctx, query, tx)),
    createVariant: (actor, selection, token, productId, input, key) => mutate(actor, selection, token, 'variant.create', key, { productId, input }, async (ctx, tx) => {
      if (input.costSource.kind === 'recipe') await requireEntitlement(ctx, 'inventory_core', tx);
      return audit(ctx, 'pricing.variant.created', pricingRepository.createPricingVariant(ctx, productId, input, tx), tx);
    }),
    getVariant: (actor, selection, token, id) => withAccess(actor, selection, token, async (ctx, tx) => {
      const result = await pricingRepository.getPricingVariant(ctx, id, tx);
      if (!result) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      const canResolveRecipePaths = result.costSource.kind === 'recipe'
        && (await listCapabilities(ctx, tx)).some((capability) => capability.feature === 'inventory_core' && capability.allowed);
      const snapshot = canResolveRecipePaths ? await snapshotVariant(actor, selection, token, result) : null;
      const packagingPaths = result.costSource.kind === 'manual'
        ? result.packaging.map((item) => ({ componentPath: ['app02-packaging', item.id], label: item.name }))
        : snapshot?.costComponents.filter((component) => component.role === 'packaging').map((component) => ({
          componentPath: component.componentPath, label: component.componentPath.join(' / '),
        })) ?? [];
      return PricingVariantComboDetailsSchema.parse({ ...result, packagingPaths, packagingPathsAvailable: result.costSource.kind === 'manual' || snapshot !== null }) satisfies PricingVariantComboDetails;
    }),
    updateVariant: (actor, selection, token, id, input, key) => mutate(actor, selection, token, 'variant.update', key, { id, input }, async (ctx, tx) => {
      if (input.costSource?.kind === 'recipe') await requireEntitlement(ctx, 'inventory_core', tx);
      const result = await pricingRepository.updatePricingVariant(ctx, id, input, tx);
      if (!result) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      return audit(ctx, 'pricing.variant.updated', Promise.resolve(result), tx);
    }),
    createChannelProfile: (actor, selection, token, input, key) => mutate(actor, selection, token, 'channel.create', key, input, (ctx, tx) => audit(ctx, 'pricing.channel.created', pricingRepository.createPricingChannelProfile(ctx, input, tx), tx)),
    updateChannelProfile: (actor, selection, token, id, input, key) => mutate(actor, selection, token, 'channel.update', key, { id, input }, async (ctx, tx) => {
      const result = await pricingRepository.updatePricingChannelProfile(ctx, id, input, tx);
      if (!result) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      return audit(ctx, 'pricing.channel.updated', Promise.resolve(result), tx);
    }),
    listChannels: (actor, selection, token, query) => withAccess(actor, selection, token, (ctx, tx) => pricingRepository.listPricingChannelProfiles(ctx, query, tx)),
    createCombo: (actor, selection, token, input, key) => mutate(actor, selection, token, 'combo.create', key, input, (ctx, tx) => audit(ctx, 'pricing.combo.created', pricingRepository.createPricingCombo(ctx, input, tx), tx)),
    updateCombo: (actor, selection, token, id, input, key) => mutate(actor, selection, token, 'combo.update', key, { id, input }, async (ctx, tx) => {
      const result = await pricingRepository.updatePricingCombo(ctx, id, input, tx);
      if (!result) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      return audit(ctx, 'pricing.combo.updated', Promise.resolve(result), tx);
    }),
    listCombos: (actor, selection, token, query) => withAccess(actor, selection, token, (ctx, tx) => pricingRepository.listPricingCombos(ctx, query, tx)),
    simulate: (actor, selection, token, input, key) => mutate(actor, selection, token, 'simulation.create', key, input, async (ctx, tx) => {
      const channel = await pricingRepository.getPricingChannelProfile(ctx, input.channelId, tx);
      if (!channel || channel.archivedAt !== null) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      let snapshot: Omit<PricingSimulation, 'id' | 'createdAt'>;
      if (input.variantId !== null) {
        const variant = await pricingRepository.getPricingVariant(ctx, input.variantId, tx);
        if (!variant || variant.archivedAt !== null) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        const variantInputs = await snapshotVariant(actor, selection, token, variant);
        let ingredient = zero(); let packaging = zero();
        for (const component of variantInputs.costComponents) {
          const exact = exactMoneyFraction(component.costPerFinalUnitExact);
          if (component.role === 'ingredient') ingredient = add(ingredient, exact);
          else packaging = add(packaging, exact);
        }
        const quote = calculatePricingQuote({
          ingredientCostExact: exactMoneyRatio(ingredient), packagingCostExact: exactMoneyRatio(packaging),
          otherVariableCost: variantInputs.otherVariableCost, rates: channel.rates, listPrice: variantInputs.listPrice,
          targetContributionMargin: input.targetContributionMargin, targetCmv: input.targetCmv,
        });
        snapshot = {
          variantId: variant.id, comboId: null, channelId: channel.id,
          inputSnapshot: input, costSourceSnapshot: variantInputs.costSourceSnapshot, variantSnapshot: variantInputs,
          componentCostSnapshots: [], channelSnapshot: { name: channel.name, rates: channel.rates }, comboSnapshot: null, quote,
        };
      } else {
        if (input.comboId === null) throw new DomainError('VALIDATION_ERROR', 400);
        const combo = await pricingRepository.getPricingCombo(ctx, input.comboId, tx);
        if (!combo || combo.archivedAt !== null) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        if (typeof combo.listPrice !== 'string') throw new DomainError('RESOURCE_CONFLICT', 409);
        const componentCostSnapshots = await Promise.all(combo.components.map(async (component) => {
          const variant = await pricingRepository.getPricingVariant(ctx, component.variantId, tx);
          if (!variant || variant.archivedAt !== null) throw new DomainError('RESOURCE_CONFLICT', 409);
          return { variantSnapshot: await snapshotVariant(actor, selection, token, variant), quantity: component.quantity,
            replacedPackagingPaths: component.replacedPackagingPaths };
        }));
        const costs = calculateComboCost({
          components: componentCostSnapshots.map((component) => ({
            variantId: component.variantSnapshot.variantId,
            quantity: component.quantity,
            costComponents: component.variantSnapshot.costComponents,
            otherVariableCostPerSale: component.variantSnapshot.otherVariableCost,
            replacedPackagingPaths: component.replacedPackagingPaths,
          })),
          exclusivePackaging: combo.exclusivePackaging,
        });
        const quote = calculatePricingQuote({ ingredientCostExact: costs.ingredientCostExact, packagingCostExact: costs.packagingCostExact,
          otherVariableCost: '0', otherVariableCostExact: costs.otherVariableCostExact, rates: channel.rates, listPrice: combo.listPrice,
          targetContributionMargin: input.targetContributionMargin, targetCmv: input.targetCmv });
        snapshot = {
          variantId: null, comboId: combo.id, channelId: channel.id,
          inputSnapshot: input, costSourceSnapshot: null, variantSnapshot: null, componentCostSnapshots,
          channelSnapshot: { name: channel.name, rates: channel.rates }, comboSnapshot: combo, quote,
        };
      }
      return audit(ctx, 'pricing.simulation.created', pricingRepository.insertPricingSimulation(ctx, snapshot, tx), tx);
    }),
    listSimulations: (actor, selection, token, productId, query) => withAccess(actor, selection, token, (ctx, tx) => pricingRepository.listPricingSimulations(ctx, productId, query, tx)),
    getSimulation: (actor, selection, token, id) => withAccess(actor, selection, token, async (ctx, tx) => {
      const result = await pricingRepository.getPricingSimulation(ctx, id, tx);
      if (!result) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      return result;
    }),
  };
  return service;
}
