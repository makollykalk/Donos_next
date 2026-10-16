import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';

it('T-11/T-16: real owner flow rejects estimates, validates measured yield and returns current stock cost', async () => {
  const fixture = await createInventoryFixtures();
  const app = buildApp({ database: fixture.db, verifyActor: fixture.verify });
  const inventory = createInventoryService(fixture.db);
  const args = [fixture.actor, fixture.selection, fixture.token] as const;
  try {
    await app.ready();
    const ingredient = await inventory.createIngredient(...args, { name: `Recipe stock ${randomUUID()}`, baseUnit: 'kg', allowFractionalCount: false }, randomUUID());
    const supplier = await inventory.createSupplier(...args, { name: `Recipe supplier ${randomUUID()}` }, randomUUID());
    const receipt = await inventory.createReceipt(...args, { supplierId: supplier.id, locationId:fixture.locationId, items: [{ ingredientId: ingredient.id, quantity: '1', unit: { kind: 'standard', code: 'kg' }, unitPrice: '10' }] }, randomUUID());
    await inventory.receiveReceipt(...args, receipt.id, { receivedConfirmed: true }, randomUUID());

    const base = `/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/recipes`;
    const headers = { authorization: `Bearer ${fixture.jwt}`, 'x-donos-context': fixture.token };
    const create = await app.inject({ method: 'POST', url: base, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Recipe test', kind: 'product' } });
    expect(create.statusCode, create.body).toBe(201);
    const recipeId = create.json().id as string;
    const version = await app.inject({ method: 'POST', url: `${base}/${recipeId}/versions`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: {
      name: 'Recipe test v1', kind: 'product', outputUnit: 'kg', transformations: [],
      components: [{ id: randomUUID(), kind: 'ingredient', ingredientId: ingredient.id, quantity: '1', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' }],
    } });
    expect(version.statusCode).toBe(201);

    const measurementPayload = { kind: 'estimated', observedAt: new Date().toISOString(), method: 'Estimate', grossQuantity: '1', netQuantity: '1', finalQuantity: '1', outputUnit: 'kg', transformationResults: [] };
    const estimate = await app.inject({ method: 'POST', url: `${base}/${recipeId}/measurements`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: measurementPayload });
    expect(estimate.statusCode).toBe(201);
    const estimateValidation = await app.inject({ method: 'POST', url: `${base}/${recipeId}/measurements/${estimate.json().id}/validate`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: {} });
    expect(estimateValidation.statusCode).toBe(400);
    expect((await app.inject({ url: `${base}/${recipeId}/cost?locationId=${fixture.locationId}`, headers })).json().reason).toBe('NO_VALIDATED_MEASUREMENT');

    const measured = await app.inject({ method: 'POST', url: `${base}/${recipeId}/measurements`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { ...measurementPayload, kind: 'measured', method: 'Balança aferida' } });
    expect(measured.statusCode).toBe(201);
    const validationKey = randomUUID();
    const validation = await app.inject({ method: 'POST', url: `${base}/${recipeId}/measurements/${measured.json().id}/validate`, headers: { ...headers, 'idempotency-key': validationKey }, payload: {} });
    expect(validation.statusCode).toBe(201);
    const snapshots = await fixture.run(async (_ctx, tx) => tx.query<{ ingredient_id: string; occurrence_count: number }>('select ingredient_id,occurrence_count from core.recipe_cost_snapshot_lines where validation_event_id=$1', [validation.json().validationEventId]));
    expect(snapshots.rows).toEqual([{ ingredient_id: ingredient.id, occurrence_count: 1 }]);
    const cost = await app.inject({ url: `${base}/${recipeId}/cost?locationId=${fixture.locationId}`, headers });
    expect(cost.statusCode).toBe(200);
    expect(cost.json()).toMatchObject({ status: 'available', source: 'inventory_moving_average', batchCost: '10', finalYield: { quantity: '1', unit: 'kg' }, costPerFinalUnit: '10' });
    await expect(fixture.run((ctx, tx) => tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,ingredient_id,quantity,unit,role,factor_to_base)
      values($1,$2,$3,$4,$5,'ingredient',$6,1,'kg','ingredient',1)`, [randomUUID(), ctx.organizationId, ctx.restaurantId, recipeId, version.json().id, ingredient.id]))).rejects.toMatchObject({ code: '23514' });
    const prep = await app.inject({ method: 'POST', url: base, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Unvalidated prep', kind: 'preparation' } });
    const prepVersion = await app.inject({ method: 'POST', url: `${base}/${prep.json().id}/versions`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: {
      name: 'Unvalidated prep v1', kind: 'preparation', outputUnit: 'kg', transformations: [],
      components: [{ id: randomUUID(), kind: 'ingredient', ingredientId: ingredient.id, quantity: '0.1', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' }],
    } });
    const parent = await app.inject({ method: 'POST', url: base, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { name: 'Parent with unvalidated prep', kind: 'product' } });
    const parentVersion = await app.inject({ method: 'POST', url: `${base}/${parent.json().id}/versions`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: {
      name: 'Parent v1', kind: 'product', outputUnit: 'kg', transformations: [],
      components: [{ id: randomUUID(), kind: 'recipe', recipeVersionId: prepVersion.json().id, quantity: '0.1', unit: 'kg', role: 'ingredient' }],
    } });
    expect([prep.statusCode, prepVersion.statusCode, parent.statusCode, parentVersion.statusCode]).toEqual([201, 201, 201, 201]);
    const parentMeasurement = await app.inject({ method: 'POST', url: `${base}/${parent.json().id}/measurements`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: {
      kind: 'measured', observedAt: new Date().toISOString(), method: 'Pesagem real do produto', grossQuantity: '1', netQuantity: '1', finalQuantity: '1', outputUnit: 'kg', transformationResults: [],
    } });
    const parentValidation = await app.inject({ method: 'POST', url: `${base}/${parent.json().id}/measurements/${parentMeasurement.json().id}/validate`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: {} });
    expect(parentValidation.statusCode, parentValidation.body).toBe(201);
    expect(parentValidation.json().measurementId).toBe(parentMeasurement.json().id);
    expect((await app.inject({ url: `${base}/${parent.json().id}/cost?locationId=${fixture.locationId}`, headers })).json()).toMatchObject({ status: 'unavailable', reason: 'NO_VALIDATED_MEASUREMENT' });
    const noLogin = await app.inject({ url: `${base}/${recipeId}/cost?locationId=${fixture.locationId}` });
    expect(noLogin.statusCode).toBe(401);
  } finally {
    await app.close();
    await fixture.close();
  }
}, 120000);
