import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createRecipeService } from '../../apps/api/src/services/recipes.js';
import { createInventoryFixtures, inventoryOrganizations } from '../helpers/inventory-fixtures.js';

it('real donos_api RLS isolates organization and restaurant contexts and rejects forged cross-tenant writes', async () => {
  const a1 = await createInventoryFixtures();
  const a2 = await createInventoryFixtures('a', inventoryOrganizations.a);
  const b = await createInventoryFixtures('b');
  try {
    const role = await a1.run(async (_ctx, tx) => (await tx.query<{ role: string }>('select current_user as role')).rows[0]?.role);
    expect(role).toBe('donos_api');
    const recipeA = await createRecipeService(a1.db).createRecipe(a1.actor, a1.selection, a1.token, { name: 'Tenant A recipe', kind: 'product' }, randomUUID());
    const recipeB = await createRecipeService(b.db).createRecipe(b.actor, b.selection, b.token, { name: 'Tenant B recipe', kind: 'product' }, randomUUID());
    const [a1Rows, a2Rows, bRows] = await Promise.all([
      createRecipeService(a1.db).listRecipes(a1.actor, a1.selection, a1.token, {}),
      createRecipeService(a2.db).listRecipes(a2.actor, a2.selection, a2.token, {}),
      createRecipeService(b.db).listRecipes(b.actor, b.selection, b.token, {}),
    ]);
    expect(a1Rows.items.map((item) => item.id)).toContain(recipeA.id);
    expect(a2Rows.items.map((item) => item.id)).not.toContain(recipeA.id);
    expect(bRows.items.map((item) => item.id)).toContain(recipeB.id);
    await expect(createRecipeService(b.db).getRecipe(b.actor, b.selection, b.token, recipeA.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(createRecipeService(a2.db).getRecipeCost(a2.actor, a2.selection, a2.token, recipeA.id, a1.locationId)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(createRecipeService(b.db).getRecipeCost(b.actor, b.selection, b.token, recipeA.id, a1.locationId)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(a1.run((_ctx, tx) => tx.query(`insert into core.recipes(organization_id,restaurant_id,kind,name,created_by)
      values($1,$2,'product','forged',$3)`, [b.selection.organizationId, b.selection.restaurantId, a1.actor.userId]))).rejects.toMatchObject({ code: '42501' });
  } finally {
    await Promise.all([a1.close(), a2.close(), b.close()]);
  }
}, 120000);
