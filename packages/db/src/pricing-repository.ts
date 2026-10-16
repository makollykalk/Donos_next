import type {
  CatalogQuery, CreatePricingChannelInput, CreatePricingComboInput, CreatePricingProductInput,
  CreatePricingVariantInput, Page, PricingChannelProfile, PricingCombo, PricingProduct,
  PricingSimulation, PricingVariant, PricingVariantSummary,
} from '@donos/contracts';
import { PricingSimulationSchema } from '@donos/contracts';
import type { RestaurantContext, Tx } from './types.js';

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value);
const iso = (value: unknown) => new Date(String(value)).toISOString();
function decimal(value: unknown): string {
  const raw = text(value);
  if (!raw.includes('.')) return raw;
  return raw.replace(/0+$/, '').replace(/\.$/, '');
}
function json<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

export async function createPricingProduct(ctx: RestaurantContext, input: CreatePricingProductInput, tx: Tx): Promise<PricingProduct> {
  const row = (await tx.query<Row>(`insert into core.pricing_products(organization_id,restaurant_id,name,description,created_by)
    values($1,$2,$3,$4,$5) returning id,name,description,archived_at`,
  [ctx.organizationId, ctx.restaurantId, input.name, input.description, ctx.actor.userId])).rows[0]!;
  return { id: text(row.id), name: text(row.name), description: row.description === null ? null : text(row.description), archivedAt: null, variants: [] };
}

export async function createPricingVariant(ctx: RestaurantContext, productId: string, input: CreatePricingVariantInput, tx: Tx): Promise<PricingVariant> {
  const source = input.costSource;
  const manual = source.kind === 'manual';
  const row = (await tx.query<Row>(`insert into core.pricing_variants(
      organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,manual_cost_updated_at,manual_currency,
      recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,created_by)
    values($1,$2,$3,$4,$5,$6,$7,case when $6='manual' then now() else null end,$8,$9,$10,$11,$12::jsonb,$13,$14)
    returning id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,manual_cost_updated_at,manual_currency,
      recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,archived_at`,
  [ctx.organizationId, ctx.restaurantId, productId, input.name, input.listPrice, source.kind,
    manual ? source.ingredientCost : null, manual ? source.currency : null,
    manual ? null : source.recipeId, manual ? null : source.locationId, manual ? null : source.quantityPerSale,
    JSON.stringify(input.packaging), input.otherVariableCost, ctx.actor.userId])).rows[0]!;
  return mapVariant(row);
}

function mapVariant(row: Row): PricingVariant {
  const costSource = row.cost_source_kind === 'manual'
    ? { kind: 'manual' as const, ingredientCost: decimal(row.manual_ingredient_cost), currency: 'BRL' as const, updatedAt: iso(row.manual_cost_updated_at) }
    : { kind: 'recipe' as const, recipeId: text(row.recipe_id), locationId: text(row.location_id), quantityPerSale: decimal(row.quantity_per_sale) };
  return {
    id: text(row.id), productId: text(row.product_id), name: text(row.name), listPrice: decimal(row.list_price), costSource,
    packaging: json(row.packaging), otherVariableCost: decimal(row.other_variable_cost),
    archivedAt: row.archived_at === null ? null : iso(row.archived_at),
  };
}

function mapRate(row: Row): PricingChannelProfile['rates'][number] {
  return {
    id: text(row.id), kind: text(row.kind) as PricingChannelProfile['rates'][number]['kind'],
    mode: text(row.mode) as PricingChannelProfile['rates'][number]['mode'], value: decimal(row.value),
    rateBase: row.rate_base === null ? null : text(row.rate_base) as 'list_price' | 'net_after_discount', fixedBasis: 'per_sale',
  } as PricingChannelProfile['rates'][number];
}

async function channelById(ctx: RestaurantContext, id: string, tx: Tx): Promise<PricingChannelProfile> {
  const row = (await tx.query<Row>('select id,name,archived_at from core.pricing_channel_profiles where organization_id=$1 and restaurant_id=$2 and id=$3',
    [ctx.organizationId, ctx.restaurantId, id])).rows[0];
  if (!row) throw new Error('pricing channel insert did not return a visible row');
  const rates = (await tx.query<Row>('select id,kind,mode,value,rate_base from core.pricing_channel_rates where organization_id=$1 and restaurant_id=$2 and channel_id=$3 order by id',
    [ctx.organizationId, ctx.restaurantId, id])).rows.map(mapRate);
  return { id: text(row.id), name: text(row.name), rates, archivedAt: row.archived_at === null ? null : iso(row.archived_at) };
}

export async function createPricingChannelProfile(ctx: RestaurantContext, input: CreatePricingChannelInput, tx: Tx): Promise<PricingChannelProfile> {
  const row = (await tx.query<Row>(`insert into core.pricing_channel_profiles(organization_id,restaurant_id,name,created_by)
    values($1,$2,$3,$4) returning id`, [ctx.organizationId, ctx.restaurantId, input.name, ctx.actor.userId])).rows[0]!;
  const id = text(row.id);
  for (const rate of input.rates) {
    await tx.query(`insert into core.pricing_channel_rates(id,organization_id,restaurant_id,channel_id,kind,mode,value,rate_base,fixed_basis)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [rate.id, ctx.organizationId, ctx.restaurantId, id, rate.kind, rate.mode, rate.value, rate.rateBase, rate.fixedBasis]);
  }
  return channelById(ctx, id, tx);
}

async function comboById(ctx: RestaurantContext, id: string, tx: Tx): Promise<PricingCombo> {
  const row = (await tx.query<Row>('select id,name,exclusive_packaging,archived_at from core.pricing_combos where organization_id=$1 and restaurant_id=$2 and id=$3',
    [ctx.organizationId, ctx.restaurantId, id])).rows[0];
  if (!row) throw new Error('pricing combo insert did not return a visible row');
  const components = (await tx.query<Row>(`select variant_id,quantity,replaced_packaging_paths from core.pricing_combo_components
    where organization_id=$1 and restaurant_id=$2 and combo_id=$3 order by position`, [ctx.organizationId, ctx.restaurantId, id])).rows;
  return {
    id: text(row.id), name: text(row.name), exclusivePackaging: json(row.exclusive_packaging),
    components: components.map((component) => ({ variantId: text(component.variant_id), quantity: decimal(component.quantity), replacedPackagingPaths: json(component.replaced_packaging_paths) })),
    archivedAt: row.archived_at === null ? null : iso(row.archived_at),
  };
}

export async function createPricingCombo(ctx: RestaurantContext, input: CreatePricingComboInput, tx: Tx): Promise<PricingCombo> {
  const row = (await tx.query<Row>(`insert into core.pricing_combos(organization_id,restaurant_id,name,exclusive_packaging,created_by)
    values($1,$2,$3,$4::jsonb,$5) returning id`,
  [ctx.organizationId, ctx.restaurantId, input.name, JSON.stringify(input.exclusivePackaging), ctx.actor.userId])).rows[0]!;
  const id = text(row.id);
  for (const [index, component] of input.components.entries()) {
    await tx.query(`insert into core.pricing_combo_components(organization_id,restaurant_id,combo_id,variant_id,position,quantity,replaced_packaging_paths)
      values($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [ctx.organizationId, ctx.restaurantId, id, component.variantId, index + 1, component.quantity, JSON.stringify(component.replacedPackagingPaths)]);
  }
  return comboById(ctx, id, tx);
}

export async function insertPricingSimulation(ctx: RestaurantContext, input: Omit<PricingSimulation, 'id' | 'createdAt'>, tx: Tx): Promise<PricingSimulation> {
  const row = (await tx.query<Row>(`insert into core.pricing_simulations(
      organization_id,restaurant_id,variant_id,combo_id,channel_id,input_snapshot,cost_source_snapshot,component_cost_snapshots,
      channel_snapshot,combo_snapshot,quote,created_by)
    values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12)
    returning id,variant_id,combo_id,channel_id,input_snapshot,cost_source_snapshot,component_cost_snapshots,channel_snapshot,combo_snapshot,quote,created_at`,
  [ctx.organizationId, ctx.restaurantId, input.variantId, input.comboId, input.channelId, JSON.stringify(input.inputSnapshot),
    input.costSourceSnapshot === null ? null : JSON.stringify(input.costSourceSnapshot), JSON.stringify(input.componentCostSnapshots),
    JSON.stringify(input.channelSnapshot), input.comboSnapshot === null ? null : JSON.stringify(input.comboSnapshot), JSON.stringify(input.quote), ctx.actor.userId])).rows[0]!;
  return PricingSimulationSchema.parse({
    id: text(row.id), variantId: row.variant_id === null ? null : text(row.variant_id), comboId: row.combo_id === null ? null : text(row.combo_id),
    channelId: text(row.channel_id), inputSnapshot: json(row.input_snapshot),
    costSourceSnapshot: row.cost_source_snapshot === null ? null : json(row.cost_source_snapshot),
    componentCostSnapshots: json(row.component_cost_snapshots), channelSnapshot: json(row.channel_snapshot),
    comboSnapshot: row.combo_snapshot === null ? null : json(row.combo_snapshot), quote: json(row.quote), createdAt: iso(row.created_at),
  });
}

export async function listPricingProducts(ctx: RestaurantContext, query: CatalogQuery, tx: Tx): Promise<Page<PricingProduct>> {
  const limit = query.limit ?? 50;
  const rows = (await tx.query<Row>(`select id,name,description,archived_at from core.pricing_products
    where organization_id=$1 and restaurant_id=$2 and ($3::uuid is null or id>$3) and ($4 or archived_at is null)
    order by id limit $5`, [ctx.organizationId, ctx.restaurantId, query.cursor ?? null, query.includeArchived ?? false, limit + 1])).rows;
  const visible = rows.slice(0, limit);
  const ids = visible.map((row) => text(row.id));
  const variants = ids.length === 0 ? [] : (await tx.query<Row>(`select id,product_id,name,list_price,archived_at from core.pricing_variants
    where organization_id=$1 and restaurant_id=$2 and product_id=any($3::uuid[]) order by product_id,id`, [ctx.organizationId, ctx.restaurantId, ids])).rows;
  const byProduct = new Map<string, PricingVariantSummary[]>();
  for (const variant of variants) {
    const productId = text(variant.product_id);
    const summaries = byProduct.get(productId) ?? [];
    summaries.push({ id: text(variant.id), name: text(variant.name), listPrice: decimal(variant.list_price), status: variant.archived_at === null ? 'active' : 'archived' });
    byProduct.set(productId, summaries);
  }
  const items = visible.map((row) => ({
    id: text(row.id), name: text(row.name), description: row.description === null ? null : text(row.description),
    archivedAt: row.archived_at === null ? null : iso(row.archived_at), variants: byProduct.get(text(row.id)) ?? [],
  }));
  return { items, nextCursor: rows.length > items.length ? items.at(-1)?.id ?? null : null };
}

export async function listPricingSimulations(ctx: RestaurantContext, productId: string, query: CatalogQuery, tx: Tx): Promise<Page<PricingSimulation>> {
  const limit = query.limit ?? 50;
  const cursorRow = query.cursor ? (await tx.query<Row>(`select created_at,id from core.pricing_simulations
    where organization_id=$1 and restaurant_id=$2 and id=$3`, [ctx.organizationId, ctx.restaurantId, query.cursor])).rows[0] : null;
  const rows = (await tx.query<Row>(`select s.id,s.variant_id,s.combo_id,s.channel_id,s.input_snapshot,s.cost_source_snapshot,s.component_cost_snapshots,
      s.channel_snapshot,s.combo_snapshot,s.quote,s.created_at
    from core.pricing_simulations s
    where s.organization_id=$1 and s.restaurant_id=$2 and (
      exists(select 1 from core.pricing_variants v where v.organization_id=s.organization_id and v.restaurant_id=s.restaurant_id and v.id=s.variant_id and v.product_id=$3)
        or exists(select 1 from jsonb_array_elements(s.component_cost_snapshots) cs
          join core.pricing_variants v on v.organization_id=s.organization_id and v.restaurant_id=s.restaurant_id and v.id=(cs.value->>'variantId')::uuid
          where v.product_id=$3)
    ) and ($4::timestamptz is null or (s.created_at,s.id)<($4,$5::uuid))
    order by s.created_at desc,s.id desc limit $6`,
  [ctx.organizationId, ctx.restaurantId, productId, cursorRow?.created_at ?? null, cursorRow?.id ?? null, limit + 1])).rows;
  const visible = rows.slice(0, limit);
  const items = visible.map((row) => PricingSimulationSchema.parse({
    id: text(row.id), variantId: row.variant_id === null ? null : text(row.variant_id), comboId: row.combo_id === null ? null : text(row.combo_id),
    channelId: text(row.channel_id), inputSnapshot: json(row.input_snapshot),
    costSourceSnapshot: row.cost_source_snapshot === null ? null : json(row.cost_source_snapshot),
    componentCostSnapshots: json(row.component_cost_snapshots), channelSnapshot: json(row.channel_snapshot),
    comboSnapshot: row.combo_snapshot === null ? null : json(row.combo_snapshot), quote: json(row.quote), createdAt: iso(row.created_at),
  }));
  return { items, nextCursor: rows.length > items.length ? items.at(-1)?.id ?? null : null };
}
