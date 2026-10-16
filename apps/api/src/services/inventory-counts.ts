import { randomUUID } from 'node:crypto';
import type { ContextSelection, InventoryCountSession, OpenInventoryCountInput, RecordInventoryCountInput, ReviewInventoryCountItemInput, ValuationState } from '@donos/contracts';
import { DomainError, appendInventoryAudit, executeIdempotent, inventoryCounts, postMovement, retryIdempotent } from '@donos/db';
import type { Database, RestaurantContext, Tx, VerifiedActor } from '@donos/db';
import { requireEntitlement } from '@donos/domain-billing';
import { calculateCountAdjustment, formatScaled, quantityCoefficient } from '@donos/domain-inventory';
import type { InventoryCountService } from './inventory-count-types.js';

type Row = Record<string, unknown>;
const txt = (value: unknown) => String(value);

function asState(row: Row, prefix = ''): ValuationState {
  return {
    quantity: txt(row[`${prefix}quantity`]), value: txt(row[`${prefix}value`]),
    referenceQuantity: txt(row[`${prefix}reference_quantity`]), referenceValue: txt(row[`${prefix}reference_value`]),
    issuedQuantity: txt(row[`${prefix}issued_quantity`]), sequence: txt(row[`${prefix}sequence`]),
  };
}

function withImpact(session: InventoryCountSession): InventoryCountSession {
  return {
    ...session,
    items: session.items.map((item) => {
      if (item.difference === null || item.theoreticalQuantity === null || item.theoreticalValue === null) return item;
      const state: ValuationState = item.theoreticalQuantity === '0'
        ? { quantity: '0', value: '0', referenceQuantity: '0', referenceValue: '0', issuedQuantity: '0', sequence: '0' }
        : { quantity: item.theoreticalQuantity, value: item.theoreticalValue, referenceQuantity: item.averageCostRatio!.denominator, referenceValue: item.averageCostRatio!.numerator, issuedQuantity: formatScaled(quantityCoefficient(item.averageCostRatio!.denominator) - quantityCoefficient(item.theoreticalQuantity), 6), sequence: '0' };
      try {
        const calculation = calculateCountAdjustment(state, item.countedQuantity!, item.positiveVarianceTotalValue ?? undefined);
        return { ...item, impactValue: calculation.valueDelta };
      } catch {
        return item;
      }
    }),
  };
}

export function createInventoryCountService(db: Database): InventoryCountService {
  const repo = inventoryCounts;
  async function access<T>(actor: VerifiedActor, selection: ContextSelection, token: string, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await retryIdempotent(() => db.withRestaurantTx(actor, selection, token, async (ctx, tx) => {
        await requireEntitlement(ctx, 'inventory_core', tx);
        return fn(ctx, tx);
      }));
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === '23503' || code === 'P0002') throw new DomainError('RESOURCE_NOT_FOUND', 404);
      if (code === '23505' || code === '40001' || code === '40P01') throw new DomainError('RESOURCE_CONFLICT', 409);
      if (code === '23514') throw new DomainError('VALIDATION_ERROR', 400);
      throw error;
    }
  }
  function mutate<T>(actor: VerifiedActor, selection: ContextSelection, token: string, operation: string, key: string, input: unknown, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>) {
    return access(actor, selection, token, (ctx, tx) => executeIdempotent({ kind: 'organization', context: ctx }, `inventory.count.${operation}`, key, { selection, input }, tx, () => fn(ctx, tx)));
  }
  async function read(ctx: RestaurantContext, id: string, reveal: boolean, tx: Tx) {
    return withImpact(await repo.getInventoryCount(ctx, id, reveal, tx));
  }
  const service: InventoryCountService = {
    list: (actor, selection, token, locationId) => access(actor, selection, token, async (ctx, tx) => {
      const result = await tx.query<Row>(`select id,location_id,status,blind,cut_at,opened_at,closed_at from core.inventory_counts where organization_id=$1 and restaurant_id=$2 and location_id=$3 order by opened_at desc,id desc`, [ctx.organizationId, ctx.restaurantId, locationId]);
      if (!(await tx.query('select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3', [ctx.organizationId, ctx.restaurantId, locationId])).rowCount) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      return { items: result.rows.map((row) => ({ id: txt(row.id), locationId: txt(row.location_id), status: row.status as 'open' | 'closed' | 'cancelled', blind: Boolean(row.blind), cutAt: (row.cut_at as Date).toISOString(), openedAt: (row.opened_at as Date).toISOString(), closedAt: row.closed_at ? (row.closed_at as Date).toISOString() : null })) };
    }),
    open: (actor, selection, token, input: OpenInventoryCountInput, key) => mutate(actor, selection, token, 'open', key, input, async (ctx, tx) => {
      const id = await repo.openInventoryCount(ctx, input, tx);
      await appendInventoryAudit(ctx, { action: 'inventory.count.opened', entityId: id }, tx);
      return read(ctx, id, false, tx);
    }),
    get: (actor, selection, token, id) => access(actor, selection, token, (ctx, tx) => read(ctx, id, false, tx)),
    report: (actor, selection, token, id, phase) => access(actor, selection, token, async (ctx, tx) => {
      if (phase === 'review') await repo.assertCountReadyForReview(ctx, id, tx);
      return read(ctx, id, phase === 'review', tx);
    }),
    record: (actor, selection, token, countId, itemId, input: RecordInventoryCountInput, key) => mutate(actor, selection, token, 'item.record', key, { countId, itemId, input }, async (ctx, tx) => {
      const item = await repo.getCountItemForUpdate(ctx, countId, itemId, tx);
      if (item.state === 'validated') throw new DomainError('RESOURCE_CONFLICT', 409);
      const quantity = txt(input.quantity);
      if (item.base_unit === 'un' && !Boolean(item.allow_fractional_count) && quantity.includes('.')) throw new DomainError('VALIDATION_ERROR', 400);
      const theoretical = txt(item.theoretical_quantity);
      const positiveFromZero = theoretical === '0' && quantity !== '0';
      if (positiveFromZero && (input.positiveVarianceTotalValue === undefined || input.positiveVarianceConfirmed !== true)) throw new DomainError('VALIDATION_ERROR', 400);
      if (!positiveFromZero && (input.positiveVarianceTotalValue !== undefined || input.positiveVarianceConfirmed !== undefined || input.zeroValueReason !== undefined)) throw new DomainError('VALIDATION_ERROR', 400);
      await repo.recordCountObservation(ctx, countId, itemId, input, tx);
      await appendInventoryAudit(ctx, { action: 'inventory.count.item.recorded', entityId: itemId }, tx);
      return read(ctx, countId, false, tx);
    }),
    review: (actor, selection, token, countId, itemId, input: ReviewInventoryCountItemInput, key) => mutate(actor, selection, token, 'item.review', key, { countId, itemId, input }, async (ctx, tx) => {
      await repo.reviewCountItem(ctx, countId, itemId, input.reason, tx);
      await appendInventoryAudit(ctx, { action: 'inventory.count.item.reviewed', entityId: itemId }, tx);
      return read(ctx, countId, false, tx);
    }),
    validate: (actor, selection, token, countId, itemId, key) => mutate(actor, selection, token, 'item.validate', key, { countId, itemId }, async (ctx, tx) => {
      await repo.validateCountItem(ctx, countId, itemId, tx);
      await appendInventoryAudit(ctx, { action: 'inventory.count.item.validated', entityId: itemId }, tx);
      return read(ctx, countId, false, tx);
    }),
    close: (actor, selection, token, countId, confirmed, key) => mutate(actor, selection, token, 'close', key, { countId, confirmed }, async (ctx, tx) => {
      if (confirmed !== true) throw new DomainError('VALIDATION_ERROR', 400);
      await repo.countHeaderForUpdate(ctx, countId, tx);
      const items = await repo.listCountItemsForClose(ctx, countId, tx);
      if (!items.length || items.some((item) => item.state !== 'validated' || item.counted_quantity === null)) throw new DomainError('RESOURCE_CONFLICT', 409);
      for (const item of items) {
        const current = asState(item, 'current_');
        const counted = txt(item.counted_quantity);
        if (counted === current.quantity) continue;
        const value = item.theoretical_quantity === '0' ? txt(item.positive_variance_total_value) : undefined;
        const calculation = calculateCountAdjustment(current, counted, value);
        const movement = await postMovement(ctx, txt(item.ingredient_id), txt(item.location_id), calculation, { kind: 'COUNT_ADJUSTMENT', reason: txt(item.zero_value_reason) || `Ajuste de contagem ${countId}`, key: randomUUID(), countItemId: txt(item.id) }, tx);
        await repo.markCountItemAdjustment(ctx, countId, txt(item.id), movement.movementId, tx);
      }
      await repo.closeCount(ctx, countId, tx);
      await appendInventoryAudit(ctx, { action: 'inventory.count.closed', entityId: countId }, tx);
      return read(ctx, countId, true, tx);
    }),
    cancel: (actor, selection, token, countId, reason, key) => mutate(actor, selection, token, 'cancel', key, { countId, reason }, async (ctx, tx) => {
      await repo.countHeaderForUpdate(ctx, countId, tx);
      await repo.cancelCount(ctx, countId, reason, tx);
      await appendInventoryAudit(ctx, { action: 'inventory.count.cancelled', entityId: countId }, tx);
      return read(ctx, countId, false, tx);
    }),
  };
  return service;
}
