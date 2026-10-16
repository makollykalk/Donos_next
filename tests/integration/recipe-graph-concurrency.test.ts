import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createRecipeService } from '../../apps/api/src/services/recipes.js';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';

it('serializes cross-transaction recipe edges so concurrent inserts cannot create a cycle', async () => {
  const fixture = await createInventoryFixtures();
  const recipes = createRecipeService(fixture.db);
  const args = [fixture.actor, fixture.selection, fixture.token] as const;
  try {
    const first = await recipes.createRecipe(...args, { name: 'Concurrent prep A', kind: 'preparation' }, randomUUID());
    const second = await recipes.createRecipe(...args, { name: 'Concurrent prep B', kind: 'preparation' }, randomUUID());
    const [versionA, versionB] = [randomUUID(), randomUUID()];
    await fixture.run(async (ctx, tx) => {
      await tx.query(`insert into core.recipe_versions(id,organization_id,restaurant_id,recipe_id,version_number,name,kind,output_unit,created_by)
        values($1,$2,$3,$4,1,'A v1','preparation','kg',$5),($6,$2,$3,$7,1,'B v1','preparation','kg',$5)`, [versionA, ctx.organizationId, ctx.restaurantId, first.id, ctx.actor.userId, versionB, second.id]);
      await tx.query('update core.recipes set current_version_id=$1 where id=$2', [versionA, first.id]);
      await tx.query('update core.recipes set current_version_id=$1 where id=$2', [versionB, second.id]);
    });
    const insertEdge = (parentRecipeId: string, parentVersionId: string, childRecipeId: string, childVersionId: string) => fixture.run(async (ctx, tx) => {
      await tx.query(`insert into core.recipe_components(id,organization_id,restaurant_id,recipe_id,recipe_version_id,kind,child_recipe_id,child_version_id,quantity,unit,role)
        values($1,$2,$3,$4,$5,'recipe',$6,$7,1,'kg','ingredient')`, [randomUUID(), ctx.organizationId, ctx.restaurantId, parentRecipeId, parentVersionId, childRecipeId, childVersionId]);
    });
    const results = await Promise.allSettled([
      insertEdge(first.id, versionA, second.id, versionB),
      insertEdge(second.id, versionB, first.id, versionA),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') expect(rejected.reason).toMatchObject({ code: '23514' });
  } finally {
    await fixture.close();
  }
}, 120000);
