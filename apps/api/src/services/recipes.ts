import type { ContextSelection, RecipeCostDTO, RecipeResolvedComponent } from '@donos/contracts';
import { DomainError, appendRecipeAudit, executeIdempotent, recipeRepository, retryIdempotent } from '@donos/db';
import type { Database, RestaurantContext, Tx, VerifiedActor } from '@donos/db';
import { requireEntitlement } from '@donos/domain-billing';
import { calculateRecipeCost, RecipeCalculationError } from '@donos/domain-recipes';
import type { RecipeCalculationInput, RecipeGraphNode } from '@donos/domain-recipes';
import type { RecipeService } from './recipe-types.js';

type Row = Record<string, unknown>;
const asText = (value: unknown) => String(value);

export function createRecipeService(db: Database): RecipeService {
  async function withAccess<T>(actor: VerifiedActor, selection: ContextSelection, token: string, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await retryIdempotent(() => db.withRestaurantTx(actor, selection, token, async (ctx, tx) => {
        await requireEntitlement(ctx, 'inventory_core', tx);
        return fn(ctx, tx);
      }));
    } catch (error) {
      if (error instanceof RecipeCalculationError) {
        if (error.code === 'RECIPE_CYCLE' || error.code === 'RECIPE_EXPANSION_LIMIT' || error.code === 'RECIPE_DUPLICATE_COMPONENT_CONFIRMATION_REQUIRED') throw new DomainError('RESOURCE_CONFLICT', 409);
        if (error.code === 'UNIT_INCOMPATIBLE' || error.code === 'QUANTITY_PRECISION' || error.code === 'NUMERIC_RANGE' || error.code === 'RECIPE_COMPONENT_UNIT_MISMATCH') throw new DomainError('VALIDATION_ERROR', 400);
      }
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === '23503' || code === 'P0002') throw new DomainError('RESOURCE_NOT_FOUND', 404);
      if (code === '23505' || code === '40001' || code === '40P01') throw new DomainError('RESOURCE_CONFLICT', 409);
      if (code === '23514') throw new DomainError('VALIDATION_ERROR', 400);
      throw error;
    }
  }
  function mutate<T>(actor: VerifiedActor, selection: ContextSelection, token: string, operation: string, key: string, input: unknown, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>) {
    return withAccess(actor, selection, token, (ctx, tx) => executeIdempotent({ kind: 'organization', context: ctx }, `recipes.${operation}`, key, { selection, input }, tx, () => fn(ctx, tx)));
  }
  async function audit<T extends { id: string }>(ctx: RestaurantContext, action: Parameters<typeof appendRecipeAudit>[1]['action'], result: Promise<T>, tx: Tx): Promise<T> {
    const entity = await result;
    await appendRecipeAudit(ctx, { action, entityId: entity.id }, tx);
    return entity;
  }
  async function cost(ctx: RestaurantContext, recipeId: string, locationId: string, tx: Tx, requestedVersionId?: string): Promise<RecipeCostDTO> {
    const location = (await tx.query<Row>('select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 and not archived', [ctx.organizationId, ctx.restaurantId, locationId])).rows[0];
    if (!location) throw new DomainError('RESOURCE_NOT_FOUND', 404);
    const root = await recipeRepository.getRecipe(ctx, recipeId, tx);
    const rootVersion = requestedVersionId ? root.versions.find((version) => version.id === requestedVersionId) : root.currentVersion;
    if (!rootVersion) throw new DomainError('RESOURCE_CONFLICT', 409);
    const versions: Record<string, RecipeGraphNode> = {};
    const measurements: RecipeCalculationInput['measurements'] = {};
    const balances: RecipeCalculationInput['balances'] = {};
    const queue = [rootVersion];
    const seen = new Set<string>();
    const ingredientIds = new Set<string>();
    while (queue.length) {
      const version = queue.shift()!;
      if (seen.has(version.id)) continue;
      seen.add(version.id);
      const recipe = version.recipeId === recipeId ? root : await recipeRepository.getRecipe(ctx, version.recipeId, tx);
      const exactVersion = recipe.versions.find((candidate) => candidate.id === version.id);
      if (!exactVersion) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      const components: RecipeResolvedComponent[] = [];
      for (const component of exactVersion.components) {
        if (component.kind === 'recipe') {
          components.push({ kind: 'recipe', componentId: component.id, recipeVersionId: component.recipeVersionId, quantity: component.quantity, unit: component.unit, role: component.role, ...(component.duplicateUseReason ? { duplicateUseReason: component.duplicateUseReason } : {}) });
          const child = (await tx.query<Row>('select recipe_id from core.recipe_versions where organization_id=$1 and restaurant_id=$2 and id=$3', [ctx.organizationId, ctx.restaurantId, component.recipeVersionId])).rows[0];
          if (!child) throw new DomainError('RESOURCE_NOT_FOUND', 404);
          const childRecipe = await recipeRepository.getRecipe(ctx, version.recipeId === asText(child.recipe_id) ? version.recipeId : asText(child.recipe_id), tx);
          const childVersion = childRecipe.versions.find((candidate) => candidate.id === component.recipeVersionId);
          if (!childVersion) throw new DomainError('RESOURCE_NOT_FOUND', 404);
          queue.push(childVersion);
        } else {
          ingredientIds.add(component.ingredientId);
          const ingredient = (await tx.query<Row>('select id,organization_id,restaurant_id,name,base_unit,allow_fractional_count,archived from core.ingredients where organization_id=$1 and restaurant_id=$2 and id=$3', [ctx.organizationId, ctx.restaurantId, component.ingredientId])).rows[0];
          if (!ingredient) throw new DomainError('RESOURCE_NOT_FOUND', 404);
          const unit = component.unit;
          let conversion: { factorToBase: string; conversionId: string | null; version: string | null } | null = null;
          if (unit.kind === 'package') {
            const row = (await tx.query<Row>('select id,version,factor_to_base from core.ingredient_conversions where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 and id=$4', [ctx.organizationId, ctx.restaurantId, component.ingredientId, unit.conversionId])).rows[0];
            if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
            conversion = { factorToBase: asText(row.factor_to_base), conversionId: asText(row.id), version: asText(row.version) };
          } else {
            conversion = { factorToBase: unit.code === 'g' || unit.code === 'mL' ? '0.001' : '1', conversionId: null, version: null };
          }
          components.push({ kind: 'ingredient', componentId: component.id, ingredient: { id: asText(ingredient.id), organizationId: asText(ingredient.organization_id), restaurantId: asText(ingredient.restaurant_id), name: asText(ingredient.name), baseUnit: asText(ingredient.base_unit) as 'kg' | 'L' | 'un', allowFractionalCount: Boolean(ingredient.allow_fractional_count), archived: Boolean(ingredient.archived) }, quantity: component.quantity, unit, conversion, role: component.role, ...(component.duplicateUseReason ? { duplicateUseReason: component.duplicateUseReason } : {}) });
        }
      }
      versions[version.id] = { version: exactVersion, components };
      const validatedMeasurement = recipe.measurements.find((m) => m.recipeVersionId === version.id && m.validation);
      measurements[version.id] = validatedMeasurement;
    }
    if (ingredientIds.size) {
      const rows = (await tx.query<Row>('select ingredient_id,quantity,value,reference_quantity,reference_value,sequence,last_movement_id from core.stock_balances where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=any($4::uuid[]) for share', [ctx.organizationId, ctx.restaurantId, locationId, [...ingredientIds]])).rows;
      for (const row of rows) {
        const quantity = asText(row.quantity);
        balances[asText(row.ingredient_id)] = { ingredientId: asText(row.ingredient_id), sequence: asText(row.sequence), lastMovementId: row.last_movement_id as string | null, averageCostRatio: quantity === '0' ? null : { numerator: asText(row.reference_value), denominator: asText(row.reference_quantity) } };
      }
    }
    const calculatedAt = asText((await tx.query<Row>('select clock_timestamp()::text as now')).rows[0]!.now);
    const result = calculateRecipeCost({ locationId, rootVersionId: rootVersion.id, versions, measurements, balances, calculatedAt });
    if (result.status === 'unavailable' && result.reason === 'NO_VALIDATED_MEASUREMENT' && root.versions.some((v) => v.id !== root.currentVersionId && root.measurements.some((m) => m.recipeVersionId === v.id && m.validation))) {
      return { ...result, reason: 'CURRENT_VERSION_NOT_VALIDATED' };
    }
    return result;
  }

  return {
    createRecipe: (actor, selection, token, input, key) => mutate(actor, selection, token, 'create', key, input, (ctx, tx) => audit(ctx, 'recipe.created', recipeRepository.createRecipe(ctx, input, tx), tx)),
    createRecipeVersion: (actor, selection, token, recipeId, input, key) => mutate(actor, selection, token, 'version.create', key, { recipeId, input }, (ctx, tx) => audit(ctx, 'recipe.version.created', recipeRepository.createRecipeVersion(ctx, recipeId, input, tx), tx)),
    recordYieldMeasurement: (actor, selection, token, recipeId, input, key) => mutate(actor, selection, token, 'measurement.record', key, { recipeId, input }, (ctx, tx) => audit(ctx, 'recipe.measurement.recorded', recipeRepository.recordYieldMeasurement(ctx, recipeId, input, tx), tx)),
    validateYieldMeasurement: (actor, selection, token, recipeId, measurementId, key) => mutate(actor, selection, token, 'measurement.validate', key, { recipeId, measurementId }, async (ctx, tx) => {
      const result = await recipeRepository.validateYieldMeasurement(ctx, recipeId, measurementId, tx);
      const activeLocations = (await tx.query<Row>('select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and not archived order by id for share', [ctx.organizationId, ctx.restaurantId])).rows;
      if (!activeLocations.length) throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
      for (const activeLocation of activeLocations) {
       const locationId = asText(activeLocation.id);
       const calculated = await cost(ctx, recipeId, locationId, tx, result.recipeVersionId);
       if (calculated.status !== 'available') continue;
        const counts = await tx.query<Row>(`with recursive walk(version_id,path,depth) as (
          select $3::uuid,array[$3::uuid],1
          union all
          select c.child_version_id,w.path||c.child_version_id,w.depth+1
          from walk w join core.recipe_components c on c.organization_id=$1 and c.restaurant_id=$2 and c.recipe_version_id=w.version_id and c.kind='recipe'
          where w.depth<16 and not c.child_version_id=any(w.path)
        ), occurrences as (
          select c.ingredient_id,count(*)::integer as occurrence_count
          from walk w join core.recipe_components c on c.organization_id=$1 and c.restaurant_id=$2 and c.recipe_version_id=w.version_id and c.kind='ingredient'
          group by c.ingredient_id
        )
        select b.ingredient_id,b.sequence,b.last_movement_id,b.quantity,b.value,b.reference_value,b.reference_quantity,o.occurrence_count
        from occurrences o join core.stock_balances b on b.organization_id=$1 and b.restaurant_id=$2 and b.location_id=$4 and b.ingredient_id=o.ingredient_id
        where b.sequence>0 and b.last_movement_id is not null for share of b`, [ctx.organizationId, ctx.restaurantId, result.recipeVersionId, locationId]);
        for (const source of counts.rows) {
          await tx.query(`insert into core.recipe_cost_snapshot_lines(organization_id,restaurant_id,validation_event_id,location_id,ingredient_id,sequence,last_movement_id,quantity,value,cost_numerator,cost_denominator,occurrence_count)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [ctx.organizationId, ctx.restaurantId, result.validationEventId, locationId, source.ingredient_id, source.sequence, source.last_movement_id, source.quantity, source.value, source.reference_value, source.reference_quantity, source.occurrence_count]);
        }
      }
      await appendRecipeAudit(ctx, { action: 'recipe.measurement.validated', entityId: measurementId }, tx);
      return result;
    }),
    listRecipes: (actor, selection, token, query) => withAccess(actor, selection, token, (ctx, tx) => recipeRepository.listRecipes(ctx, query, tx)),
    getRecipe: (actor, selection, token, recipeId) => withAccess(actor, selection, token, (ctx, tx) => recipeRepository.getRecipe(ctx, recipeId, tx)),
    getRecipeCost: (actor, selection, token, recipeId, locationId) => withAccess(actor, selection, token, (ctx, tx) => cost(ctx, recipeId, locationId, tx)),
  };
}
