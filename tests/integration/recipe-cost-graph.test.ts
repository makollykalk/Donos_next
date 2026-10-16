import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';

type IngredientSeed = { name: string; price: string };
type RecipeDefinition = {
  name: string;
  kind: 'product' | 'preparation';
  components: Record<string, unknown>[];
  transformations: { id: string; kind: 'cleaning' | 'cooking'; label: string; position: number }[];
  yield: { gross: string; net: string; final: string };
};

it('prices three measured products through a shared prep and follows the live inventory average', async () => {
  const fixture = await createInventoryFixtures();
  const app = buildApp({ database: fixture.db, verifyActor: fixture.verify });
  const inventory = createInventoryService(fixture.db);
  const inventoryArgs = [fixture.actor, fixture.selection, fixture.token] as const;
  const base = `/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/recipes`;
  const headers = { authorization: `Bearer ${fixture.jwt}`, 'x-donos-context': fixture.token };
  async function post(url: string, payload: unknown) {
    return app.inject({
      method: 'POST', url, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: payload as object,
    });
  }

  async function ingredient(seed: IngredientSeed) {
    const created = await inventory.createIngredient(...inventoryArgs, {
      name: `${seed.name} ${randomUUID()}`, baseUnit: 'kg', allowFractionalCount: false,
    }, randomUUID());
    return created;
  }

  async function receive(ingredientId: string, supplierId: string, quantity: string, unitPrice: string) {
    const receipt = await inventory.createReceipt(...inventoryArgs, {
      supplierId, locationId: fixture.locationId,
      items: [{ ingredientId, quantity, unit: { kind: 'standard', code: 'kg' }, unitPrice }],
    }, randomUUID());
    await inventory.receiveReceipt(...inventoryArgs, receipt.id, { receivedConfirmed: true }, randomUUID());
  }

  async function measuredRecipe(definition: RecipeDefinition) {
    const created = await post(base, { name: `${definition.name} ${randomUUID()}`, kind: definition.kind });
    expect(created.statusCode, created.body).toBe(201);
    const recipeId = created.json().id as string;
    const version = await post(`${base}/${recipeId}/versions`, {
      name: `${definition.name} v1`, kind: definition.kind, outputUnit: 'kg',
      components: definition.components, transformations: definition.transformations,
    });
    expect(version.statusCode, version.body).toBe(201);
    const versionId = version.json().id as string;
    const transformationResults = definition.transformations.map((step, index, steps) => {
      const inputQuantity = index === 0 ? definition.yield.gross : definition.yield.net;
      const outputQuantity = index === steps.length - 1 ? definition.yield.final : definition.yield.net;
      return { transformationId: step.id, inputQuantity, outputQuantity, unit: 'kg' };
    });
    const measurement = await post(`${base}/${recipeId}/measurements`, {
      kind: 'measured', observedAt: new Date().toISOString(), method: 'Pesagem conferida',
      grossQuantity: definition.yield.gross, netQuantity: definition.yield.net,
      finalQuantity: definition.yield.final, outputUnit: 'kg', transformationResults,
    });
    expect(measurement.statusCode, measurement.body).toBe(201);
    const validation = await post(`${base}/${recipeId}/measurements/${measurement.json().id}/validate`, {});
    expect(validation.statusCode, validation.body).toBe(201);
    return { recipeId, versionId, measurementId: measurement.json().id as string };
  }

  try {
    await app.ready();
    const supplier = await inventory.createSupplier(...inventoryArgs, { name: `Fornecedor ${randomUUID()}` }, randomUUID());
    const seeds = {
      beef: { name: 'Carne moída', price: '12' },
      onion: { name: 'Cebola', price: '4' },
      lasagna: { name: 'Massa de lasanha', price: '10' },
      pizza: { name: 'Massa de pizza', price: '8' },
      cheese: { name: 'Queijo', price: '20' },
      bun: { name: 'Pão de hambúrguer', price: '12' },
    } satisfies Record<string, IngredientSeed>;
    const ingredients = Object.fromEntries(await Promise.all(Object.entries(seeds).map(async ([key, seed]) => [key, await ingredient(seed)])));
    for (const [key, seed] of Object.entries(seeds)) await receive(ingredients[key]!.id, supplier.id, '1', seed.price);

    const cleaning = randomUUID();
    const prepCooking = randomUUID();
    const prep = await measuredRecipe({
      name: 'Ragù', kind: 'preparation',
      components: [
        { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.beef!.id, quantity: '2', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
        { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.onion!.id, quantity: '0.5', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
      ],
      transformations: [
        { id: cleaning, kind: 'cleaning', label: 'Limpeza', position: 1 },
        { id: prepCooking, kind: 'cooking', label: 'Cocção', position: 2 },
      ],
      yield: { gross: '2.5', net: '2.3', final: '1.8' },
    });

    const productTransform = () => [{ id: randomUUID(), kind: 'cooking' as const, label: 'Cocção', position: 1 }];
    const products = [
      {
        name: 'Lasanha', components: [
          { id: randomUUID(), kind: 'recipe', recipeVersionId: prep.versionId, quantity: '0.3', unit: 'kg', role: 'ingredient' },
          { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.lasagna!.id, quantity: '0.2', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
          { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.cheese!.id, quantity: '0.1', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
        ], transformations: productTransform(), yield: { gross: '0.6', net: '0.6', final: '0.52' },
        before: { batchCost: '8.333333333333', costPerFinalUnit: '16.025641025641' },
        after: { batchCost: '8.833333333333', costPerFinalUnit: '16.987179487179' },
      },
      {
        name: 'Pizza', components: [
          { id: randomUUID(), kind: 'recipe', recipeVersionId: prep.versionId, quantity: '0.15', unit: 'kg', role: 'ingredient' },
          { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.pizza!.id, quantity: '0.25', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
          { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.cheese!.id, quantity: '0.12', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
        ], transformations: productTransform(), yield: { gross: '0.52', net: '0.52', final: '0.47' },
        before: { batchCost: '6.566666666667', costPerFinalUnit: '13.971631205674' },
        after: { batchCost: '7.166666666667', costPerFinalUnit: '15.248226950355' },
      },
      {
        name: 'Hambúrguer', components: [
          { id: randomUUID(), kind: 'recipe', recipeVersionId: prep.versionId, quantity: '0.2', unit: 'kg', role: 'ingredient' },
          { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.bun!.id, quantity: '0.1', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
          { id: randomUUID(), kind: 'ingredient', ingredientId: ingredients.cheese!.id, quantity: '0.05', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient' },
        ], transformations: productTransform(), yield: { gross: '0.35', net: '0.35', final: '0.3' },
        before: { batchCost: '5.088888888889', costPerFinalUnit: '16.962962962963' },
        after: { batchCost: '5.338888888889', costPerFinalUnit: '17.796296296296' },
      },
    ];
    const productIds: string[] = [];
    for (const product of products) {
      const definition = { name: product.name, components: product.components, transformations: product.transformations, yield: product.yield };
      const result = await measuredRecipe({ ...definition, kind: 'product' });
      productIds.push(result.recipeId);
      const cost = await app.inject({ url: `${base}/${result.recipeId}/cost?locationId=${fixture.locationId}`, headers });
      expect(cost.statusCode, cost.body).toBe(200);
      expect(cost.json()).toMatchObject({
        status: 'available', source: 'inventory_moving_average',
        recipeVersionId: result.versionId, measurementId: result.measurementId,
        finalYield: { quantity: product.yield.final, unit: 'kg' }, ...product.before,
      });
      expect(cost.json().stockSources.map((source: { ingredientId: string }) => source.ingredientId)).toEqual(
        expect.arrayContaining([ingredients.beef!.id, ingredients.onion!.id, ingredients.cheese!.id]),
      );
    }

    const cheeseReceipt = await inventory.createReceipt(...inventoryArgs, {
      supplierId: supplier.id, locationId: fixture.locationId,
      items: [{ ingredientId: ingredients.cheese!.id, quantity: '1', unit: { kind: 'standard', code: 'kg' }, unitPrice: '30' }],
    }, randomUUID());
    await inventory.receiveReceipt(...inventoryArgs, cheeseReceipt.id, { receivedConfirmed: true }, randomUUID());

    for (const [index, product] of products.entries()) {
      const cost = await app.inject({ url: `${base}/${productIds[index]}/cost?locationId=${fixture.locationId}`, headers });
      expect(cost.statusCode, cost.body).toBe(200);
      expect(cost.json()).toMatchObject({ status: 'available', ...product.after });
    }

    const prepCost = await app.inject({ url: `${base}/${prep.recipeId}/cost?locationId=${fixture.locationId}`, headers });
    expect(prepCost.statusCode, prepCost.body).toBe(200);
    expect(prepCost.json()).toMatchObject({ status: 'available', batchCost: '26', costPerFinalUnit: '14.444444444444' });
  } finally {
    await app.close();
    await fixture.close();
  }
}, 300000);
