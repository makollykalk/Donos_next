import type { InventoryCountSession } from '@donos/contracts';
import type { RestaurantContext, Tx } from './types.js';
import { DomainError } from './types.js';

type Row = Record<string, unknown>;
const text = (v: unknown) => String(v);
export function quantityDifference(counted: string, theoretical: string): string {
  const coefficient = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(`${whole}${fraction.padEnd(6, '0')}`);
  };
  const delta = coefficient(counted) - coefficient(theoretical);
  const negative = delta < 0n;
  const digits = (negative ? -delta : delta).toString().padStart(7, '0');
  const fraction = digits.slice(-6).replace(/0+$/u, '');
  return `${negative ? '-' : ''}${digits.slice(0, -6)}${fraction ? `.${fraction}` : ''}`;
}

export async function openInventoryCount(ctx: RestaurantContext, input: { locationId: string; blind: boolean }, tx: Tx): Promise<string> {
  const location = (await tx.query<{ archived: boolean }>(`select archived from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 for share`, [ctx.organizationId, ctx.restaurantId, input.locationId])).rows[0];
  if (!location) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (location.archived) throw new DomainError('RESOURCE_CONFLICT', 409);
  const missing = await tx.query(`select i.id from core.ingredients i left join core.stock_balances b on b.organization_id=i.organization_id and b.restaurant_id=i.restaurant_id and b.ingredient_id=i.id and b.location_id=$3
    where i.organization_id=$1 and i.restaurant_id=$2 and not i.archived and b.ingredient_id is null limit 1`, [ctx.organizationId, ctx.restaurantId, input.locationId]);
  if (missing.rowCount) throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
  const locked = await tx.query(`select b.ingredient_id from core.stock_balances b join core.ingredients i on i.organization_id=b.organization_id and i.restaurant_id=b.restaurant_id and i.id=b.ingredient_id
    where b.organization_id=$1 and b.restaurant_id=$2 and b.location_id=$3 and not i.archived order by b.ingredient_id for update of b`, [ctx.organizationId, ctx.restaurantId, input.locationId]);
  const session = (await tx.query<Row>(`insert into core.inventory_counts(organization_id,restaurant_id,location_id,blind,cut_at,opened_by)
    values($1,$2,$3,$4,clock_timestamp(),$5) returning id`, [ctx.organizationId, ctx.restaurantId, input.locationId, input.blind, ctx.actor.userId])).rows[0]!;
  const sessionId = text(session.id);
  await tx.query(`insert into core.inventory_count_items(organization_id,restaurant_id,location_id,count_id,ingredient_id,theoretical_quantity,theoretical_value,reference_quantity,reference_value,issued_quantity,ledger_sequence,last_movement_id)
    select b.organization_id,b.restaurant_id,b.location_id,$4,b.ingredient_id,b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity,b.sequence,b.last_movement_id
    from core.stock_balances b join core.ingredients i on i.organization_id=b.organization_id and i.restaurant_id=b.restaurant_id and i.id=b.ingredient_id
    where b.organization_id=$1 and b.restaurant_id=$2 and b.location_id=$3 and not i.archived order by b.ingredient_id`, [ctx.organizationId, ctx.restaurantId, input.locationId, sessionId]);
  void locked;
  return sessionId;
}

export async function getCountItemForUpdate(ctx: RestaurantContext, countId: string, itemId: string, tx: Tx): Promise<Row> {
  const row = (await tx.query<Row>(`select i.*,g.base_unit,g.allow_fractional_count,c.status as count_status,c.blind,c.location_id as session_location_id
    from core.inventory_count_items i join core.inventory_counts c on c.organization_id=i.organization_id and c.restaurant_id=i.restaurant_id and c.location_id=i.location_id and c.id=i.count_id
    join core.ingredients g on g.organization_id=i.organization_id and g.restaurant_id=i.restaurant_id and g.id=i.ingredient_id
    where i.organization_id=$1 and i.restaurant_id=$2 and i.count_id=$3 and i.id=$4 for update of i,c`, [ctx.organizationId, ctx.restaurantId, countId, itemId])).rows[0];
  if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (row.count_status !== 'open') throw new DomainError('RESOURCE_CONFLICT', 409);
  return row;
}

export async function recordCountObservation(ctx: RestaurantContext, countId: string, itemId: string, input: { quantity: string; observation?: string | undefined; positiveVarianceTotalValue?: string | undefined; positiveVarianceConfirmed?: true | undefined; zeroValueReason?: string | undefined }, tx: Tx): Promise<void> {
  const item = await getCountItemForUpdate(ctx, countId, itemId, tx);
  const sequence = (await tx.query<Row>('select coalesce(max(sequence),0)+1 as next from core.inventory_count_observations where organization_id=$1 and restaurant_id=$2 and count_item_id=$3', [ctx.organizationId, ctx.restaurantId, itemId])).rows[0]!;
  await tx.query(`insert into core.inventory_count_observations(organization_id,restaurant_id,location_id,count_id,count_item_id,sequence,quantity,observation,recorded_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [ctx.organizationId, ctx.restaurantId, text(item.location_id), countId, itemId, sequence.next, input.quantity, input.observation ?? null, ctx.actor.userId]);
  await tx.query(`update core.inventory_count_items set counted_quantity=$5,observation=$6,state='counted',positive_variance_total_value=$7,positive_variance_confirmed=$8,zero_value_reason=$9,validated_by=null,validated_at=null
    where organization_id=$1 and restaurant_id=$2 and count_id=$3 and id=$4`, [ctx.organizationId, ctx.restaurantId, countId, itemId, input.quantity, input.observation ?? null, input.positiveVarianceTotalValue ?? null, input.positiveVarianceConfirmed ?? false, input.zeroValueReason ?? null]);
}

export async function reviewCountItem(ctx: RestaurantContext, countId: string, itemId: string, reason: string, tx: Tx): Promise<void> {
  const item = await getCountItemForUpdate(ctx, countId, itemId, tx);
  if (!item.counted_quantity) throw new DomainError('RESOURCE_CONFLICT', 409);
  const sequence = (await tx.query<Row>('select coalesce(max(sequence),0)+1 as next from core.inventory_count_observations where organization_id=$1 and restaurant_id=$2 and count_item_id=$3', [ctx.organizationId, ctx.restaurantId, itemId])).rows[0]!;
  await tx.query(`insert into core.inventory_count_observations(organization_id,restaurant_id,location_id,count_id,count_item_id,sequence,quantity,observation,recorded_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [ctx.organizationId, ctx.restaurantId, text(item.location_id), countId, itemId, sequence.next, item.counted_quantity, reason, ctx.actor.userId]);
  await tx.query(`update core.inventory_count_items set state='review',validated_by=null,validated_at=null where organization_id=$1 and restaurant_id=$2 and count_id=$3 and id=$4`, [ctx.organizationId, ctx.restaurantId, countId, itemId]);
}

export async function validateCountItem(ctx: RestaurantContext, countId: string, itemId: string, tx: Tx): Promise<void> {
  const item = await getCountItemForUpdate(ctx, countId, itemId, tx);
  if (item.counted_quantity === null || item.state === 'not_counted' || item.state === 'review') throw new DomainError('RESOURCE_CONFLICT', 409);
  await tx.query(`update core.inventory_count_items set state='validated',validated_by=$5,validated_at=clock_timestamp() where organization_id=$1 and restaurant_id=$2 and count_id=$3 and id=$4`, [ctx.organizationId, ctx.restaurantId, countId, itemId, ctx.actor.userId]);
}

export async function countHeaderForUpdate(ctx: RestaurantContext, countId: string, tx: Tx): Promise<Row> {
  const row = (await tx.query<Row>(`select c.*,l.name as location_name from core.inventory_counts c join core.stock_locations l on l.organization_id=c.organization_id and l.restaurant_id=c.restaurant_id and l.id=c.location_id where c.organization_id=$1 and c.restaurant_id=$2 and c.id=$3 for update of c`, [ctx.organizationId, ctx.restaurantId, countId])).rows[0];
  if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (row.status !== 'open') throw new DomainError('RESOURCE_CONFLICT', 409);
  return row;
}

export async function assertCountReadyForReview(ctx: RestaurantContext, countId: string, tx: Tx): Promise<void> {
  const result = await tx.query<Row>(`select c.status,c.blind,count(*) filter(where i.counted_quantity is null) as pending
    from core.inventory_counts c join core.inventory_count_items i on i.organization_id=c.organization_id and i.restaurant_id=c.restaurant_id and i.location_id=c.location_id and i.count_id=c.id
    where c.organization_id=$1 and c.restaurant_id=$2 and c.id=$3 group by c.status,c.blind`, [ctx.organizationId, ctx.restaurantId, countId]);
  const row = result.rows[0];
  if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  if (row.status === 'open' && Boolean(row.blind) && Number(row.pending) > 0) throw new DomainError('RESOURCE_CONFLICT', 409);
}

export async function listCountItemsForClose(ctx: RestaurantContext, countId: string, tx: Tx): Promise<Row[]> {
  return (await tx.query<Row>(`select i.*,b.quantity as current_quantity,b.value as current_value,b.reference_quantity as current_reference_quantity,b.reference_value as current_reference_value,b.issued_quantity as current_issued_quantity,b.sequence as current_sequence,b.last_movement_id as current_last_movement_id
    from core.inventory_count_items i join core.stock_balances b on b.organization_id=i.organization_id and b.restaurant_id=i.restaurant_id and b.location_id=i.location_id and b.ingredient_id=i.ingredient_id
    where i.organization_id=$1 and i.restaurant_id=$2 and i.count_id=$3 order by i.ingredient_id for update of b,i`, [ctx.organizationId, ctx.restaurantId, countId])).rows;
}

export async function markCountItemAdjustment(ctx: RestaurantContext, countId: string, itemId: string, movementId: string, tx: Tx): Promise<void> {
  const r = await tx.query(`update core.inventory_count_items set adjustment_movement_id=$5 where organization_id=$1 and restaurant_id=$2 and count_id=$3 and id=$4 and state='validated'`, [ctx.organizationId, ctx.restaurantId, countId, itemId, movementId]);
  if (r.rowCount !== 1) throw new DomainError('RESOURCE_CONFLICT', 409);
}

export async function closeCount(ctx: RestaurantContext, countId: string, tx: Tx): Promise<void> {
  const result = await tx.query(`update core.inventory_counts set status='closed',closed_by=$4,closed_at=clock_timestamp() where organization_id=$1 and restaurant_id=$2 and id=$3 and status='open'`, [ctx.organizationId, ctx.restaurantId, countId, ctx.actor.userId]);
  if (result.rowCount !== 1) throw new DomainError('RESOURCE_CONFLICT', 409);
}

export async function cancelCount(ctx: RestaurantContext, countId: string, reason: string, tx: Tx): Promise<void> {
  const result = await tx.query(`update core.inventory_counts set status='cancelled',cancelled_by=$4,cancelled_at=clock_timestamp(),cancel_reason=$5 where organization_id=$1 and restaurant_id=$2 and id=$3 and status='open'`, [ctx.organizationId, ctx.restaurantId, countId, ctx.actor.userId, reason]);
  if (result.rowCount !== 1) throw new DomainError('RESOURCE_CONFLICT', 409);
}

export async function getInventoryCount(ctx: RestaurantContext, countId: string, revealTheoretical: boolean, tx: Tx): Promise<InventoryCountSession> {
  const header = (await tx.query<Row>(`select c.id,c.location_id,c.status,c.blind,c.cut_at,c.opened_at,c.closed_at,c.cancelled_at,c.cancel_reason,l.name as location_name
    from core.inventory_counts c join core.stock_locations l on l.organization_id=c.organization_id and l.restaurant_id=c.restaurant_id and l.id=c.location_id
    where c.organization_id=$1 and c.restaurant_id=$2 and c.id=$3`, [ctx.organizationId, ctx.restaurantId, countId])).rows[0];
  if (!header) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  const reveal = revealTheoretical || !Boolean(header.blind) || header.status === 'closed';
  const items = (await tx.query<Row>(`select i.id,i.ingredient_id as "ingredientId",g.name as "ingredientName",g.base_unit as "baseUnit",i.state,
      i.theoretical_quantity::text as "theoreticalQuantity",i.theoretical_value::text as "theoreticalValue",i.reference_quantity::text as "referenceQuantity",i.reference_value::text as "referenceValue",i.counted_quantity::text as "countedQuantity",i.positive_variance_total_value::text as "positiveVarianceTotalValue"
    from core.inventory_count_items i join core.ingredients g on g.organization_id=i.organization_id and g.restaurant_id=i.restaurant_id and g.id=i.ingredient_id
    where i.organization_id=$1 and i.restaurant_id=$2 and i.count_id=$3 order by g.name,i.ingredient_id`, [ctx.organizationId, ctx.restaurantId, countId])).rows;
  const itemIds = items.map((item) => item.id);
  const observations = itemIds.length ? (await tx.query<Row>(`select o.id,o.count_item_id,o.sequence::text,o.quantity::text,o.observation,o.recorded_by,o.recorded_at
    from core.inventory_count_observations o where o.organization_id=$1 and o.restaurant_id=$2 and o.count_id=$3 and o.count_item_id=any($4::uuid[]) order by o.count_item_id,o.sequence`, [ctx.organizationId, ctx.restaurantId, countId, itemIds])).rows : [];
  const observationMap = new Map<string, Row[]>();
  for (const observation of observations) observationMap.set(text(observation.count_item_id), [...(observationMap.get(text(observation.count_item_id)) ?? []), observation]);
  return {
    id: text(header.id), locationId: text(header.location_id), locationName: text(header.location_name), status: header.status as InventoryCountSession['status'], blind: Boolean(header.blind),
    cutAt: (header.cut_at as Date).toISOString(), openedAt: (header.opened_at as Date).toISOString(), closedAt: header.closed_at ? (header.closed_at as Date).toISOString() : null,
    cancelledAt: header.cancelled_at ? (header.cancelled_at as Date).toISOString() : null, cancelReason: header.cancel_reason as string | null,
    items: items.map((item) => {
      const theoreticalQuantity = reveal ? text(item.theoreticalQuantity) : null;
      const theoreticalValue = reveal ? text(item.theoreticalValue) : null;
      const countedQuantity = item.countedQuantity === null ? null : text(item.countedQuantity);
      const difference = reveal && countedQuantity !== null ? quantityDifference(countedQuantity, theoreticalQuantity!) : null;
      return {
        id: text(item.id), ingredientId: text(item.ingredientId), ingredientName: text(item.ingredientName), baseUnit: item.baseUnit as InventoryCountSession['items'][number]['baseUnit'],
        state: item.state as InventoryCountSession['items'][number]['state'], theoreticalQuantity, theoreticalValue, averageCostRatio: reveal && theoreticalQuantity !== '0' ? { numerator: text(item.referenceValue), denominator: text(item.referenceQuantity) } : null,
        countedQuantity, difference, impactValue: null, positiveVarianceTotalValue: item.positiveVarianceTotalValue === null ? null : text(item.positiveVarianceTotalValue),
        observations: (observationMap.get(text(item.id)) ?? []).map((o) => ({ id: text(o.id), sequence: text(o.sequence), quantity: text(o.quantity), observation: o.observation as string | null, recordedBy: text(o.recorded_by), recordedAt: (o.recorded_at as Date).toISOString() })),
      };
    }),
  };
}
