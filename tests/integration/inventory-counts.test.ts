import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createInventoryCountService } from '../../apps/api/src/services/inventory-counts.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';

it('blind count blocks movements, preserves observations and closes with an exact compensating adjustment', async () => {
  const f = await createInventoryFixtures();
  try {
    const inventory = createInventoryService(f.db), counts = createInventoryCountService(f.db);
    const args = [f.actor, f.selection, f.token] as const;
    const ingredient = await inventory.createIngredient(...args, { name: `Counted ${randomUUID()}`, baseUnit: 'kg', allowFractionalCount: false }, randomUUID());
    const supplier = await inventory.createSupplier(...args, { name: `Count supplier ${randomUUID()}` }, randomUUID());
    const receipt = await inventory.createReceipt(...args, { supplierId: supplier.id, locationId: f.locationId, items: [{ ingredientId: ingredient.id, quantity: '10', unit: { kind: 'standard', code: 'kg' }, unitPrice: '20' }] }, randomUUID());
    await inventory.receiveReceipt(...args, receipt.id, { receivedConfirmed: true }, randomUUID());

    const opened = await counts.open(...args, { locationId: f.locationId, blind: true }, randomUUID());
    const item = opened.items.find((row) => row.ingredientId === ingredient.id)!;
    expect(item.theoreticalQuantity).toBeNull();
    await expect(inventory.issue(...args, { ingredientId: ingredient.id, locationId: f.locationId, quantity: '1', unit: { kind: 'standard', code: 'kg' }, reason: 'movimento concorrente' }, randomUUID())).rejects.toBeDefined();
    await expect(counts.report(...args, opened.id, 'review')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });

    const key = randomUUID();
    const recorded = await counts.record(...args, opened.id, item.id, { quantity: '8', observation: 'Prateleira conferida' }, key);
    expect(recorded.items.find((row) => row.id === item.id)?.theoreticalQuantity).toBeNull();
    const review = await counts.report(...args, opened.id, 'review');
    expect(review.items.find((row) => row.id === item.id)).toMatchObject({ theoreticalQuantity: '10', difference: '-2', impactValue: '-40' });
    await counts.validate(...args, opened.id, item.id, randomUUID());
    const closed = await counts.close(...args, opened.id, true, randomUUID());
    expect(closed.status).toBe('closed');
    expect(closed.items.find((row) => row.id === item.id)).toMatchObject({ difference: '-2', impactValue: '-40' });
    expect((await inventory.listBalances(...args, { locationId: f.locationId })).items.find((row) => row.ingredientId === ingredient.id)).toMatchObject({ quantity: '8', value: '160', sequence: '2' });
    await f.run(async (_ctx, tx) => expect((await tx.query("select id from core.stock_movements where count_item_id=$1 and kind='COUNT_ADJUSTMENT'", [item.id])).rowCount).toBe(1));
  } finally { await f.close(); }
}, 120000);

it('does not expose another organization count or permit its location as a count target', async () => {
  const owner = await createInventoryFixtures('a'), other = await createInventoryFixtures('b');
  try {
    const counts = createInventoryCountService(owner.db);
    const foreignCount = await createInventoryCountService(other.db).open(other.actor, other.selection, other.token, { locationId: other.locationId, blind: false }, randomUUID());
    await expect(counts.get(owner.actor, owner.selection, owner.token, foreignCount.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(counts.open(owner.actor, owner.selection, owner.token, { locationId: other.locationId, blind: false }, randomUUID())).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  } finally { await owner.close(); await other.close(); }
}, 120000);

it('rejects archived count locations and database observations with a forged author', async () => {
  const owner = await createInventoryFixtures('a'), other = await createInventoryFixtures('b');
  try {
    const inventory = createInventoryService(owner.db), counts = createInventoryCountService(owner.db);
    const args = [owner.actor, owner.selection, owner.token] as const;
    const archived = await inventory.createLocation(...args, { name: `Archived ${randomUUID()}` }, randomUUID());
    await inventory.patchLocation(...args, archived.id, { archived: true }, randomUUID());
    await expect(counts.open(...args, { locationId: archived.id, blind: false }, randomUUID())).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });

    const ingredient = await inventory.createIngredient(...args, { name: `Observed ${randomUUID()}`, baseUnit: 'kg', allowFractionalCount: true }, randomUUID());
    const opened = await counts.open(...args, { locationId: owner.locationId, blind: false }, randomUUID());
    const item = opened.items.find((row) => row.ingredientId === ingredient.id)!;
    await expect(owner.run(async (ctx, tx) => tx.query(`insert into core.inventory_count_observations(organization_id,restaurant_id,location_id,count_id,count_item_id,sequence,quantity,recorded_by)
      values($1,$2,$3,$4,$5,1,1,$6)`, [ctx.organizationId, ctx.restaurantId, owner.locationId, opened.id, item.id, other.actor.userId]))).rejects.toMatchObject({ code: '23514' });
  } finally { await owner.close(); await other.close(); }
}, 120000);

it('serializes opening a count with archiving its location', async () => {
  const f = await createInventoryFixtures();
  try {
    const inventory = createInventoryService(f.db), args = [f.actor, f.selection, f.token] as const;
    const location = await inventory.createLocation(...args, { name: `Racing location ${randomUUID()}` }, randomUUID());
    let inserted!: () => void, releaseOpening!: () => void;
    const countInserted = new Promise<void>((resolve) => { inserted = resolve; });
    const holdOpening = new Promise<void>((resolve) => { releaseOpening = resolve; });
    const opening = f.run(async (ctx, tx) => {
      await tx.query(`insert into core.inventory_counts(organization_id,restaurant_id,location_id,blind,cut_at,opened_by)
        values($1,$2,$3,false,clock_timestamp(),$4)`, [ctx.organizationId, ctx.restaurantId, location.id, ctx.actor.userId]);
      inserted();
      await holdOpening;
    });
    try {
      await countInserted;
      const lockError = await f.run(async (ctx, tx) => tx.query(
        'select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 for no key update nowait',
        [ctx.organizationId, ctx.restaurantId, location.id],
      )).then(() => null, (error: unknown) => error);
      expect(lockError).toMatchObject({ code: '55P03' });
    } finally {
      releaseOpening();
      await opening;
    }
    await expect(inventory.patchLocation(...args, location.id, { archived: true }, randomUUID())).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    await f.run(async (ctx, tx) => expect((await tx.query<{ archived: boolean }>(
      'select archived from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3',
      [ctx.organizationId, ctx.restaurantId, location.id],
    )).rows[0]?.archived).toBe(false));
  } finally { await f.close(); }
}, 120000);

it('requires owner-confirmed total value for positive variance from zero and cancel releases the location', async () => {
  const f = await createInventoryFixtures();
  try {
    const counts = createInventoryCountService(f.db), inventory = createInventoryService(f.db), args = [f.actor, f.selection, f.token] as const;
    const ingredient = await inventory.createIngredient(...args, { name: `Unvalued ${randomUUID()}`, baseUnit: 'kg', allowFractionalCount: true }, randomUUID());
    const opened = await counts.open(...args, { locationId: f.locationId, blind: false }, randomUUID());
    const item = opened.items.find((row) => row.ingredientId === ingredient.id)!;
    await expect(counts.record(...args, opened.id, item.id, { quantity: '2' }, randomUUID())).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await counts.record(...args, opened.id, item.id, { quantity: '2', positiveVarianceTotalValue: '17.5', positiveVarianceConfirmed: true }, randomUUID());
    await counts.validate(...args, opened.id, item.id, randomUUID());
    const closed = await counts.close(...args, opened.id, true, randomUUID());
    expect(closed.items.find((row) => row.id === item.id)).toMatchObject({ theoreticalQuantity: '0', difference: '2', impactValue: '17.5' });
    expect((await inventory.listBalances(...args, { locationId: f.locationId })).items.find((row) => row.ingredientId === ingredient.id)).toMatchObject({ quantity: '2', value: '17.5' });

    const cancelled = await counts.open(...args, { locationId: f.locationId, blind: true }, randomUUID());
    const cancelKey = randomUUID();
    await counts.cancel(...args, cancelled.id, 'Contagem interrompida', cancelKey);
    await counts.cancel(...args, cancelled.id, 'Contagem interrompida', cancelKey);
    await expect(counts.close(...args, cancelled.id, true, randomUUID())).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  } finally { await f.close(); }
}, 120000);
