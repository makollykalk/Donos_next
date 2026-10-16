import type { CreateStockLocationInput, PatchStockLocationInput, StockLocation } from '@donos/contracts';
import type { RestaurantContext, Tx } from './types.js';
import { DomainError } from './types.js';

const columns = 'id,organization_id as "organizationId",restaurant_id as "restaurantId",name,is_default as "isDefault",archived';

export async function requireStockLocation(ctx: RestaurantContext, id: string, tx: Tx, active = true): Promise<StockLocation> {
  const row = (await tx.query<StockLocation>(`select ${columns} from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3`, [ctx.organizationId, ctx.restaurantId, id])).rows[0];
  if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (active && row.archived) throw new DomainError('RESOURCE_CONFLICT', 409);
  return row;
}

export async function listStockLocations(ctx: RestaurantContext, tx: Tx): Promise<{ items: StockLocation[] }> {
  const items = (await tx.query<StockLocation>(`select ${columns} from core.stock_locations where organization_id=$1 and restaurant_id=$2 order by is_default desc,name,id`, [ctx.organizationId, ctx.restaurantId])).rows;
  return { items };
}

export async function createStockLocation(ctx: RestaurantContext, input: CreateStockLocationInput, tx: Tx): Promise<StockLocation> {
  const row = (await tx.query<StockLocation>(`insert into core.stock_locations(organization_id,restaurant_id,name,is_default)
    select $1,$2,$3,not exists(select 1 from core.stock_locations where organization_id=$1 and restaurant_id=$2 and not archived and is_default)
    returning ${columns}`, [ctx.organizationId, ctx.restaurantId, input.name])).rows[0]!;
  await tx.query(`insert into core.stock_balances(organization_id,restaurant_id,location_id,ingredient_id)
    select $1,$2,$3,id from core.ingredients where organization_id=$1 and restaurant_id=$2 and not archived`, [ctx.organizationId, ctx.restaurantId, row.id]);
  return row;
}

export async function patchStockLocation(ctx: RestaurantContext, id: string, input: PatchStockLocationInput, tx: Tx): Promise<StockLocation> {
  const current = (await tx.query<StockLocation>(`select ${columns} from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 for update`, [ctx.organizationId, ctx.restaurantId, id])).rows[0];
  if (!current) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (input.archived === true && !current.archived) {
    const blocked = await tx.query(`select 1 from core.stock_balances b where b.organization_id=$1 and b.restaurant_id=$2 and b.location_id=$3 and (b.quantity<>0 or b.value<>0)
      union all select 1 from core.inventory_counts where organization_id=$1 and restaurant_id=$2 and location_id=$3 and status='open' limit 1`, [ctx.organizationId, ctx.restaurantId, id]);
    if (blocked.rowCount) throw new DomainError('RESOURCE_CONFLICT', 409);
    if (current.isDefault) {
      const next = (await tx.query<{ id: string }>(`select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id<>$3 and not archived order by created_at,id limit 1 for update`, [ctx.organizationId, ctx.restaurantId, id])).rows[0];
      if (!next) throw new DomainError('RESOURCE_CONFLICT', 409);
      await tx.query('update core.stock_locations set is_default=false where organization_id=$1 and restaurant_id=$2 and is_default', [ctx.organizationId, ctx.restaurantId]);
      await tx.query('update core.stock_locations set is_default=true where organization_id=$1 and restaurant_id=$2 and id=$3', [ctx.organizationId, ctx.restaurantId, next.id]);
    }
  }
  if (input.isDefault === true) {
    if (input.archived === true || current.archived) throw new DomainError('RESOURCE_CONFLICT', 409);
    await tx.query('update core.stock_locations set is_default=false where organization_id=$1 and restaurant_id=$2 and is_default and id<>$3', [ctx.organizationId, ctx.restaurantId, id]);
  }
  if (input.isDefault === false && current.isDefault) throw new DomainError('RESOURCE_CONFLICT', 409);
  const result = await tx.query<StockLocation>(`update core.stock_locations set name=$4,archived=$5,is_default=$6
    where organization_id=$1 and restaurant_id=$2 and id=$3 returning ${columns}`,
    [ctx.organizationId, ctx.restaurantId, id, input.name ?? current.name, input.archived ?? current.archived, input.isDefault ?? (input.archived === true && current.isDefault ? false : current.isDefault)]);
  return result.rows[0]!;
}
