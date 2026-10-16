import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createRecipeService } from '../../apps/api/src/services/recipes.js';
import { createPricingFixtures, pricingOrganizations } from '../helpers/pricing-fixtures.js';

it('pricing rows isolate organizations and restaurants, reject cross-unit references, and keep simulations immutable', async () => {
  const a1 = await createPricingFixtures('a', pricingOrganizations.a);
  const a2 = await createPricingFixtures('a', pricingOrganizations.a);
  const b = await createPricingFixtures('b');
  try {
    const productA = await a1.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_products(organization_id,restaurant_id,name,description,created_by)
       values($1,$2,$3,null,$4) returning id`,
      [ctx.organizationId, ctx.restaurantId, `Tenant A ${randomUUID()}`, a1.actor.userId],
    )).rows[0]!.id);
    const productB = await b.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_products(organization_id,restaurant_id,name,description,created_by)
       values($1,$2,$3,null,$4) returning id`,
      [ctx.organizationId, ctx.restaurantId, `Tenant B ${randomUUID()}`, b.actor.userId],
    )).rows[0]!.id);

    expect((await a1.run((_ctx, tx) => tx.query('select id from core.pricing_products where id=$1', [productA]))).rowCount).toBe(1);
    expect((await a1.run((_ctx, tx) => tx.query('select id from core.pricing_products where id=$1', [productB]))).rowCount).toBe(0);
    expect((await a2.run((_ctx, tx) => tx.query('select id from core.pricing_products where id=$1', [productA]))).rowCount).toBe(0);
    await expect(a1.run((_ctx, tx) => tx.query(
      `insert into core.pricing_products(organization_id,restaurant_id,name,description,created_by)
       values($1,$2,$3,null,$4)`,
      [b.selection.organizationId, b.selection.restaurantId, `Forged ${randomUUID()}`, a1.actor.userId],
    ))).rejects.toMatchObject({ code: '42501' });
    await expect(a1.run((ctx, tx) => tx.query(
      `insert into core.pricing_products(organization_id,restaurant_id,name,description,created_by)
       values($1,$2,$3,null,$4)`,
      [ctx.organizationId, ctx.restaurantId, `Forged actor ${randomUUID()}`, b.actor.userId],
    ))).rejects.toMatchObject({ code: '42501' });

    await expect(a2.run((ctx, tx) => tx.query(
      `insert into core.pricing_variants(
         organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,
         manual_cost_updated_at,manual_currency,recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,created_by
       ) values($1,$2,$3,'Cross-unit',1,'manual',0,now(),'BRL',null,null,null,'[]'::jsonb,0,$4)`,
      [ctx.organizationId, ctx.restaurantId, productA, a2.actor.userId],
    ))).rejects.toMatchObject({ code: '23503' });

    const productA2 = await a2.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_products(organization_id,restaurant_id,name,description,created_by)
       values($1,$2,$3,null,$4) returning id`,
      [ctx.organizationId, ctx.restaurantId, `Unit A2 ${randomUUID()}`, a2.actor.userId],
    )).rows[0]!.id);
    const recipeA = await createRecipeService(a1.db).createRecipe(a1.actor, a1.selection, a1.token, { name: `Recipe A1 ${randomUUID()}`, kind: 'product' }, randomUUID());
    await expect(a2.run((ctx, tx) => tx.query(
      `insert into core.pricing_variants(
         organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,
         manual_cost_updated_at,manual_currency,recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,created_by
       ) values($1,$2,$3,'Cross-unit recipe',1,'recipe',null,null,null,$4,$5,1,'[]'::jsonb,0,$6)`,
      [ctx.organizationId, ctx.restaurantId, productA2, recipeA.id, a2.locationId, a2.actor.userId],
    ))).rejects.toMatchObject({ code: '23503' });
    await expect(a1.run((ctx, tx) => tx.query(
      `insert into core.pricing_variants(
         organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,
         manual_cost_updated_at,manual_currency,recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,created_by
       ) values($1,$2,$3,'Cross-unit location',1,'recipe',null,null,null,$4,$5,1,'[]'::jsonb,0,$6)`,
      [ctx.organizationId, ctx.restaurantId, productA, recipeA.id, a2.locationId, a1.actor.userId],
    ))).rejects.toMatchObject({ code: '23503' });

    const variantId = await a1.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_variants(
         organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,
         manual_cost_updated_at,manual_currency,recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,created_by
       ) values($1,$2,$3,'Manual',10,'manual',2,now(),'BRL',null,null,null,'[]'::jsonb,0,$4) returning id`,
      [ctx.organizationId, ctx.restaurantId, productA, a1.actor.userId],
    )).rows[0]!.id);
    for (const [field, value] of [['list_price', 'NaN'], ['manual_ingredient_cost', 'NaN'], ['other_variable_cost', 'NaN']] as const) {
      await expect(a1.run((ctx, tx) => tx.query(
        `insert into core.pricing_variants(
           organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,manual_ingredient_cost,
           manual_cost_updated_at,manual_currency,recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,created_by
         ) values($1,$2,$3,'Reject NaN',${field === 'list_price' ? '$4' : '10'},'manual',${field === 'manual_ingredient_cost' ? '$4' : '2'},now(),'BRL',null,null,null,'[]'::jsonb,${field === 'other_variable_cost' ? '$4' : '0'},$5)`,
        [ctx.organizationId, ctx.restaurantId, productA, value, a1.actor.userId],
      ))).rejects.toMatchObject({ code: '23514' });
    }
    const channelId = await a1.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_channel_profiles(organization_id,restaurant_id,name,created_by)
       values($1,$2,'Direct',$3) returning id`, [ctx.organizationId, ctx.restaurantId, a1.actor.userId],
    )).rows[0]!.id);
    await expect(a1.run((ctx, tx) => tx.query(
      `insert into core.pricing_channel_rates(id,organization_id,restaurant_id,channel_id,kind,mode,value,rate_base,fixed_basis)
       values($1,$2,$3,$4,'fee','fixed','NaN',null,'per_sale')`,
      [randomUUID(), ctx.organizationId, ctx.restaurantId, channelId],
    ))).rejects.toMatchObject({ code: '23514' });
    await expect(a1.run((ctx, tx) => tx.query(
      `insert into core.pricing_simulations(organization_id,restaurant_id,variant_id,combo_id,channel_id,input_snapshot,cost_source_snapshot,
         channel_snapshot,combo_snapshot,quote,created_by)
       values($1,$2,$3,null,$4,'{}','{}','{}',null,'{}',$5)`,
      [ctx.organizationId, ctx.restaurantId, variantId, channelId, a1.actor.userId],
    ))).rejects.toMatchObject({ code: '23514' });
    const simulationId = await a1.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_simulations(
         organization_id,restaurant_id,variant_id,combo_id,channel_id,input_snapshot,cost_source_snapshot,variant_snapshot,
         channel_snapshot,combo_snapshot,quote,created_by
       ) values($1,$2,$3,null,$4,'{}','{}','{}','{}',null,'{}',$5) returning id`,
      [ctx.organizationId, ctx.restaurantId, variantId, channelId, a1.actor.userId],
    )).rows[0]!.id);
    for (const operation of ['update', 'delete'] as const) {
      await expect(a1.run((_ctx, tx) => tx.query(
        operation === 'update'
          ? 'update core.pricing_simulations set input_snapshot=input_snapshot where id=$1'
          : 'delete from core.pricing_simulations where id=$1', [simulationId],
      ))).rejects.toMatchObject({ code: '42501' });
    }
    expect((await a1.run((_ctx, tx) => tx.query('select id from core.pricing_simulations where id=$1', [simulationId]))).rowCount).toBe(1);
  } finally {
    await Promise.all([a1.close(), a2.close(), b.close()]);
  }
}, 120000);
