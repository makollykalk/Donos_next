import { randomUUID } from 'node:crypto';
import type {
  CreateRecipeInput, CreateRecipeVersionInput, RecipeComponentInput, RecipeDetail,
  RecipeKind, RecipeSummary, RecipeVersion, RecipeYieldMeasurement, RecordYieldMeasurementInput,
} from '@donos/contracts';
import type { RestaurantContext, Tx } from './types.js';
import { DomainError } from './types.js';

type Row = Record<string, unknown>;
const iso = (value: unknown) => new Date(String(value)).toISOString();
const text = (value: unknown) => String(value);
const asRecipeKind = (value: unknown) => text(value) as RecipeKind;

async function requireRecipe(ctx: RestaurantContext, recipeId: string, tx: Tx, lock = false): Promise<Row> {
  const row = (await tx.query<Row>(`select id,organization_id,restaurant_id,kind,name,current_version_id,archived,updated_at from core.recipes where organization_id=$1 and restaurant_id=$2 and id=$3 ${lock ? 'for update' : ''}`,
    [ctx.organizationId, ctx.restaurantId, recipeId])).rows[0];
  if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  return row;
}

function summary(row: Row): RecipeSummary {
  return {
    id: text(row.id), name: text(row.name), kind: asRecipeKind(row.kind),
    status: text(row.status) as RecipeSummary['status'],
    currentVersionId: row.current_version_id === null ? null : text(row.current_version_id),
    updatedAt: iso(row.updated_at),
  };
}

export async function createRecipe(ctx: RestaurantContext, input: CreateRecipeInput, tx: Tx): Promise<RecipeSummary> {
  const row = (await tx.query<Row>(`insert into core.recipes(organization_id,restaurant_id,kind,name,created_by)
    values($1,$2,$3,$4,$5) returning id,name,kind,current_version_id,updated_at`,
    [ctx.organizationId, ctx.restaurantId, input.kind, input.name, ctx.actor.userId])).rows[0]!;
  return summary({ ...row, status: 'draft' });
}

export async function createRecipeVersion(ctx: RestaurantContext, recipeId: string, input: CreateRecipeVersionInput, tx: Tx): Promise<RecipeVersion> {
  const recipe = await requireRecipe(ctx, recipeId, tx, true);
  if (recipe.archived) throw new DomainError('RESOURCE_CONFLICT', 409);
  if (recipe.kind !== input.kind) throw new DomainError('VALIDATION_ERROR', 400);
  const id = randomUUID();
  const versionNumber = (await tx.query<Row>('select coalesce(max(version_number),0)+1 as n from core.recipe_versions where organization_id=$1 and restaurant_id=$2 and recipe_id=$3', [ctx.organizationId, ctx.restaurantId, recipeId])).rows[0]!.n;
  await tx.query(`insert into core.recipe_versions(id,organization_id,restaurant_id,recipe_id,version_number,name,kind,output_unit,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, ctx.organizationId, ctx.restaurantId, recipeId, versionNumber, input.name, input.kind, input.outputUnit, ctx.actor.userId]);

  for (const step of input.transformations) {
    await tx.query('insert into core.recipe_transformations(id,organization_id,restaurant_id,recipe_id,recipe_version_id,position,kind,label) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [step.id, ctx.organizationId, ctx.restaurantId, recipeId, id, step.position, step.kind, step.label]);
  }
  for (const component of input.components) await insertComponent(ctx, recipeId, id, component, tx);
  await tx.query('update core.recipes set name=$4,current_version_id=$5 where organization_id=$1 and restaurant_id=$2 and id=$3',
    [ctx.organizationId, ctx.restaurantId, recipeId, input.name, id]);
  const detail = await getRecipe(ctx, recipeId, tx);
  const version = detail.versions.find((candidate) => candidate.id === id);
  if (!version) throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
  return version;
}

async function insertComponent(ctx: RestaurantContext, recipeId: string, versionId: string, component: RecipeComponentInput, tx: Tx): Promise<void> {
  if (component.kind === 'recipe') {
    const child = (await tx.query<Row>('select recipe_id from core.recipe_versions where organization_id=$1 and restaurant_id=$2 and id=$3', [ctx.organizationId, ctx.restaurantId, component.recipeVersionId])).rows[0];
    if (!child) throw new DomainError('RESOURCE_NOT_FOUND', 404);
    await tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,child_recipe_id,child_version_id,quantity,unit,role,duplicate_use_reason)
      values($1,$2,$3,$4,$5,'recipe',$6,$7,$8,$9,$10,$11)`,
      [component.id, ctx.organizationId, ctx.restaurantId, recipeId, versionId, child.recipe_id, component.recipeVersionId, component.quantity, component.unit, component.role, component.duplicateUseReason ?? null]);
    return;
  }
  const ingredient = (await tx.query<Row>('select base_unit,allow_fractional_count from core.ingredients where organization_id=$1 and restaurant_id=$2 and id=$3', [ctx.organizationId, ctx.restaurantId, component.ingredientId])).rows[0];
  if (!ingredient) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  let factor: string;
  let conversionId: string | null = null;
  let conversionLabel: string | null = null;
  let conversionVersion: string | null = null;
  let unit: string;
  if (component.unit.kind === 'package') {
    const conversion = (await tx.query<Row>('select id,label,version,factor_to_base from core.ingredient_conversions where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 and id=$4', [ctx.organizationId, ctx.restaurantId, component.ingredientId, component.unit.conversionId])).rows[0];
    if (!conversion) throw new DomainError('RESOURCE_NOT_FOUND', 404);
    factor = text(conversion.factor_to_base);
    conversionId = text(conversion.id);
    conversionLabel = text(conversion.label);
    conversionVersion = text(conversion.version);
    unit = 'package';
  } else {
    const code = component.unit.code;
    factor = code === ingredient.base_unit ? '1' : (code === 'g' && ingredient.base_unit === 'kg') || (code === 'mL' && ingredient.base_unit === 'L') ? '0.001' : '0';
    unit = code;
  }
  await tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,ingredient_id,quantity,unit,role,
    conversion_id,conversion_label,conversion_version,factor_to_base,duplicate_use_reason)
    values($1,$2,$3,$4,$5,'ingredient',$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [component.id, ctx.organizationId, ctx.restaurantId, recipeId, versionId, component.ingredientId, component.quantity, unit, component.role,
      conversionId, conversionLabel, conversionVersion, factor, component.duplicateUseReason ?? null]);
}

export async function listRecipes(ctx: RestaurantContext, query: { cursor?: string; limit?: number; includeArchived?: boolean }, tx: Tx) {
  const rows = (await tx.query<Row>(`select r.id,r.name,r.kind,r.current_version_id,r.updated_at,r.archived,
    case when r.current_version_id is null then 'draft'
      when exists(select 1 from core.recipe_validation_events v where v.organization_id=r.organization_id and v.restaurant_id=r.restaurant_id and v.recipe_version_id=r.current_version_id) then 'validated'
      when (select m.kind from core.recipe_yield_measurements m where m.organization_id=r.organization_id and m.restaurant_id=r.restaurant_id and m.recipe_version_id=r.current_version_id order by m.measurement_number desc limit 1)='estimated' then 'estimated'
      when exists(select 1 from core.recipe_validation_events v where v.organization_id=r.organization_id and v.restaurant_id=r.restaurant_id and v.recipe_id=r.id) then 'current_version_not_validated'
      else 'draft' end as status
    from core.recipes r where r.organization_id=$1 and r.restaurant_id=$2 and ($3::uuid is null or r.id>$3) and ($4 or not r.archived)
    order by r.id limit $5`, [ctx.organizationId, ctx.restaurantId, query.cursor ?? null, query.includeArchived ?? false, (query.limit ?? 50) + 1])).rows;
  const items = rows.slice(0, query.limit ?? 50).map(summary);
  return { items, nextCursor: rows.length > items.length ? items.at(-1)?.id ?? null : null };
}

export async function getRecipe(ctx: RestaurantContext, recipeId: string, tx: Tx): Promise<RecipeDetail> {
  const identity = await requireRecipe(ctx, recipeId, tx);
  const [versions, measurements] = await Promise.all([
    tx.query<Row>('select * from core.recipe_versions where organization_id=$1 and restaurant_id=$2 and recipe_id=$3 order by version_number desc', [ctx.organizationId, ctx.restaurantId, recipeId]),
    tx.query<Row>(`select m.*,v.validated_at,v.validated_by from core.recipe_yield_measurements m left join lateral
      (select validated_at,validated_by from core.recipe_validation_events e where e.organization_id=m.organization_id and e.restaurant_id=m.restaurant_id and e.measurement_id=m.id order by validated_at desc limit 1) v on true
      where m.organization_id=$1 and m.restaurant_id=$2 and m.recipe_id=$3 order by m.recorded_at desc`, [ctx.organizationId, ctx.restaurantId, recipeId]),
  ]);
  const versionsOut: RecipeVersion[] = [];
  for (const version of versions.rows) {
    const [componentRows, stepRows] = await Promise.all([
      tx.query<Row>(`select c.*,i.name as ingredient_name,i.base_unit,i.allow_fractional_count from core.recipe_components c left join core.ingredients i on i.organization_id=c.organization_id and i.restaurant_id=c.restaurant_id and i.id=c.ingredient_id where c.organization_id=$1 and c.restaurant_id=$2 and c.recipe_version_id=$3 order by c.id`, [ctx.organizationId, ctx.restaurantId, version.id]),
      tx.query<Row>('select id,position,kind,label from core.recipe_transformations where organization_id=$1 and restaurant_id=$2 and recipe_version_id=$3 order by position', [ctx.organizationId, ctx.restaurantId, version.id]),
    ]);
    const components = componentRows.rows.map((component) => component.kind === 'recipe' ? {
      id: text(component.id), kind: 'recipe' as const, recipeVersionId: text(component.child_version_id), quantity: text(component.quantity), unit: text(component.unit) as RecipeComponentInput & string, role: text(component.role) as 'ingredient' | 'packaging', ...(component.duplicate_use_reason ? { duplicateUseReason: text(component.duplicate_use_reason) } : {}),
    } : {
      id: text(component.id), kind: 'ingredient' as const, ingredientId: text(component.ingredient_id), quantity: text(component.quantity),
      unit: component.unit === 'package' ? { kind: 'package' as const, conversionId: text(component.conversion_id) } : { kind: 'standard' as const, code: text(component.unit) as 'kg' | 'g' | 'L' | 'mL' | 'un' },
      role: text(component.role) as 'ingredient' | 'packaging', ...(component.duplicate_use_reason ? { duplicateUseReason: text(component.duplicate_use_reason) } : {}),
    });
    versionsOut.push({ id: text(version.id), recipeId: text(version.recipe_id), versionNumber: text(version.version_number), name: text(version.name), kind: asRecipeKind(version.kind), outputUnit: text(version.output_unit) as RecipeVersion['outputUnit'], components: components as RecipeVersion['components'], transformations: stepRows.rows.map((step) => ({ id: text(step.id), position: Number(step.position), kind: text(step.kind) as RecipeVersion['transformations'][number]['kind'], label: text(step.label) })), createdAt: iso(version.created_at), createdBy: text(version.created_by) });
  }
  const measurementsOut: RecipeYieldMeasurement[] = [];
  for (const measurement of measurements.rows) {
    const transformationResults = (await tx.query<Row>(`select transformation_id,input_quantity,output_quantity,unit,gain_reason from core.recipe_transformation_measurements where organization_id=$1 and restaurant_id=$2 and measurement_id=$3 order by transformation_id`, [ctx.organizationId, ctx.restaurantId, measurement.id])).rows.map((step) => ({ transformationId: text(step.transformation_id), inputQuantity: text(step.input_quantity), outputQuantity: text(step.output_quantity), unit: text(step.unit) as RecipeYieldMeasurement['outputUnit'], ...(step.gain_reason ? { gainReason: text(step.gain_reason) } : {}) }));
    measurementsOut.push({ id: text(measurement.id), recipeVersionId: text(measurement.recipe_version_id), measurementNumber: text(measurement.measurement_number), kind: text(measurement.kind) as RecipeYieldMeasurement['kind'], observedAt: iso(measurement.observed_at), method: text(measurement.method), grossQuantity: text(measurement.gross_quantity), netQuantity: text(measurement.net_quantity), finalQuantity: text(measurement.final_quantity), outputUnit: text(measurement.output_unit) as RecipeYieldMeasurement['outputUnit'], transformationResults, ...(measurement.portion_count ? { portionCount: text(measurement.portion_count) } : {}), ...(measurement.portion_quantity ? { portionQuantity: text(measurement.portion_quantity) } : {}), ...(measurement.supersedes_measurement_id ? { supersedesMeasurementId: text(measurement.supersedes_measurement_id) } : {}), recordedBy: text(measurement.recorded_by), recordedAt: iso(measurement.recorded_at), validation: measurement.validated_at ? { validatedAt: iso(measurement.validated_at), validatedBy: text(measurement.validated_by) } : null });
  }
  const latest = measurementsOut[0];
  const status: RecipeSummary['status'] = identity.current_version_id === null ? 'draft' : measurementsOut.some((m) => m.recipeVersionId === identity.current_version_id && m.validation) ? 'validated' : latest?.kind === 'estimated' ? 'estimated' : measurementsOut.some((m) => m.validation) ? 'current_version_not_validated' : 'draft';
  return { ...summary({ ...identity, status }), currentVersion: versionsOut.find((v) => v.id === identity.current_version_id) ?? null, versions: versionsOut, measurements: measurementsOut };
}

export async function recordYieldMeasurement(ctx: RestaurantContext, recipeId: string, input: RecordYieldMeasurementInput, tx: Tx): Promise<RecipeYieldMeasurement> {
  const recipe = await requireRecipe(ctx, recipeId, tx, true);
  if (!recipe.current_version_id) throw new DomainError('RESOURCE_CONFLICT', 409);
  const versionId = text(recipe.current_version_id);
  const number = (await tx.query<Row>('select coalesce(max(measurement_number),0)+1 as n from core.recipe_yield_measurements where organization_id=$1 and restaurant_id=$2 and recipe_version_id=$3', [ctx.organizationId, ctx.restaurantId, versionId])).rows[0]!.n;
  const id = randomUUID();
  await tx.query(`insert into core.recipe_yield_measurements(id,organization_id,restaurant_id,recipe_id,recipe_version_id,measurement_number,kind,observed_at,method,gross_quantity,net_quantity,final_quantity,output_unit,portion_count,portion_quantity,supersedes_measurement_id,recorded_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [id, ctx.organizationId, ctx.restaurantId, recipeId, versionId, number, input.kind, input.observedAt, input.method, input.grossQuantity, input.netQuantity, input.finalQuantity, input.outputUnit, input.portionCount ?? null, input.portionQuantity ?? null, input.supersedesMeasurementId ?? null, ctx.actor.userId]);
  for (const result of input.transformationResults) {
    await tx.query('insert into core.recipe_transformation_measurements(organization_id,restaurant_id,recipe_version_id,measurement_id,transformation_id,input_quantity,output_quantity,unit,gain_reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ctx.organizationId, ctx.restaurantId, versionId, id, result.transformationId, result.inputQuantity, result.outputQuantity, result.unit, result.gainReason ?? null]);
  }
  const detail = await getRecipe(ctx, recipeId, tx);
  const measurement = detail.measurements.find((candidate) => candidate.id === id);
  if (!measurement) throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
  return measurement;
}

export async function validateYieldMeasurement(ctx: RestaurantContext, recipeId: string, measurementId: string, tx: Tx) {
  const measurement = (await tx.query<Row>('select id,kind,recipe_version_id from core.recipe_yield_measurements where organization_id=$1 and restaurant_id=$2 and recipe_id=$3 and id=$4', [ctx.organizationId, ctx.restaurantId, recipeId, measurementId])).rows[0];
  if (!measurement) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (measurement.kind !== 'measured') throw new DomainError('VALIDATION_ERROR', 400);
  const inserted = await tx.query<Row>('insert into core.recipe_validation_events(organization_id,restaurant_id,recipe_id,recipe_version_id,measurement_id,validated_by) values($1,$2,$3,$4,$5,$6) returning id,validated_at,validated_by', [ctx.organizationId, ctx.restaurantId, recipeId, measurement.recipe_version_id, measurementId, ctx.actor.userId]);
  const row = inserted.rows[0]!;
  return { validationEventId: text(row.id), measurementId, recipeVersionId: text(measurement.recipe_version_id), validatedAt: iso(row.validated_at), validatedBy: text(row.validated_by) };
}

export async function archiveRecipe(ctx: RestaurantContext, recipeId: string, tx: Tx) {
  const row = await requireRecipe(ctx, recipeId, tx, true);
  const updated = (await tx.query<Row>('update core.recipes set archived=true where organization_id=$1 and restaurant_id=$2 and id=$3 returning id,name,kind,current_version_id,updated_at', [ctx.organizationId, ctx.restaurantId, recipeId])).rows[0]!;
  return summary({ ...updated, status: row.current_version_id ? 'draft' : 'draft' });
}
