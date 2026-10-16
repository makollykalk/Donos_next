import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createRecipeService } from '../../apps/api/src/services/recipes.js';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';

it('version composition is atomic and duplicate stock occurrences require explicit per-line reasons in Postgres', async () => {
  const fixture = await createInventoryFixtures();
  const app = buildApp({ database: fixture.db, verifyActor: fixture.verify });
  const recipes = createRecipeService(fixture.db);
  const inventory = createInventoryService(fixture.db);
  const args = [fixture.actor, fixture.selection, fixture.token] as const;
  try {
    await app.ready();
    const ingredient = await inventory.createIngredient(...args, { name: `Duplicate check ${randomUUID()}`, baseUnit: 'kg', allowFractionalCount: false }, randomUUID());
    const recipe = await recipes.createRecipe(...args, { name: 'Duplicate fixture', kind: 'product' }, randomUUID());
    const invalid = await fixture.run(async (ctx, tx) => {
      const versionId = randomUUID();
      await tx.query(`insert into core.recipe_versions(id,organization_id,restaurant_id,recipe_id,version_number,name,kind,output_unit,created_by)
        values($1,$2,$3,$4,1,'bad composition','product','kg',$5)`, [versionId, ctx.organizationId, ctx.restaurantId, recipe.id, ctx.actor.userId]);
      for (let lineIndex = 0; lineIndex < 2; lineIndex += 1) {
        await tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,ingredient_id,quantity,unit,role,factor_to_base)
          values($1,$2,$3,$4,$5,'ingredient',$6,1,'kg','ingredient',1)`, [randomUUID(), ctx.organizationId, ctx.restaurantId, recipe.id, versionId, ingredient.id]);
      }
    }).then(() => null).catch((error: unknown) => error);
    expect(invalid).toMatchObject({ code: '23514' });
    expect((await recipes.getRecipe(...args, recipe.id)).versions).toHaveLength(0);

    const base = `/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/recipes`;
    const headers = { authorization: `Bearer ${fixture.jwt}`, 'x-donos-context': fixture.token, 'idempotency-key': randomUUID() };
    const response = await app.inject({ method: 'POST', url: `${base}/${recipe.id}/versions`, headers, payload: {
      name: 'Confirmed duplicate', kind: 'product', outputUnit: 'kg', transformations: [],
      components: [
        { id: randomUUID(), kind: 'ingredient', ingredientId: ingredient.id, quantity: '1', unit: { kind: 'standard', code: 'kg' }, role: 'ingredient', duplicateUseReason: 'Primeira porção independente' },
        { id: randomUUID(), kind: 'ingredient', ingredientId: ingredient.id, quantity: '1', unit: { kind: 'standard', code: 'kg' }, role: 'packaging', duplicateUseReason: 'Uso adicional explícito' },
      ],
    } });
    expect(response.statusCode).toBe(201);
    expect((await recipes.getRecipe(...args, recipe.id)).versions).toHaveLength(1);

    const prepA = await recipes.createRecipe(...args, { name: 'Prep A', kind: 'preparation' }, randomUUID());
    const prepB = await recipes.createRecipe(...args, { name: 'Prep B', kind: 'preparation' }, randomUUID());
    const cycle = await fixture.run(async (ctx, tx) => {
      const versionA = randomUUID(), versionB = randomUUID();
      await tx.query(`insert into core.recipe_versions(id,organization_id,restaurant_id,recipe_id,version_number,name,kind,output_unit,created_by)
        values($1,$2,$3,$4,1,'A v1','preparation','kg',$5),($6,$2,$3,$7,1,'B v1','preparation','kg',$5)`, [versionA, ctx.organizationId, ctx.restaurantId, prepA.id, ctx.actor.userId, versionB, prepB.id]);
      await tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,child_recipe_id,child_version_id,quantity,unit,role)
        values($1,$2,$3,$4,$5,'recipe',$6,$7,1,'kg','ingredient')`, [randomUUID(), ctx.organizationId, ctx.restaurantId, prepA.id, versionA, prepB.id, versionB]);
      await tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,child_recipe_id,child_version_id,quantity,unit,role)
        values($1,$2,$3,$4,$5,'recipe',$6,$7,1,'kg','ingredient')`, [randomUUID(), ctx.organizationId, ctx.restaurantId, prepB.id, versionB, prepA.id, versionA]);
    }).then(() => null).catch((error: unknown) => error);
    expect(cycle).toMatchObject({ code: '23514' });
    expect((await recipes.getRecipe(...args, prepA.id)).versions).toHaveLength(0);
    expect((await recipes.getRecipe(...args, prepB.id)).versions).toHaveLength(0);
  } finally {
    await app.close();
    await fixture.close();
  }
}, 120000);

