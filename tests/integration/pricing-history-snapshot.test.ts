import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { pricingRepository } from '@donos/db';
import { createPricingFixtures } from '../helpers/pricing-fixtures.js';

it('keeps combo simulations in product history after the live combo composition changes', async () => {
  const fixture = await createPricingFixtures('a');
  try {
    const ids = await fixture.run(async (ctx, tx) => {
      const productId = (await tx.query<{ id: string }>(
        `insert into core.pricing_products(organization_id,restaurant_id,name,created_by)
         values($1,$2,$3,$4) returning id`,
        [ctx.organizationId, ctx.restaurantId, `History ${randomUUID()}`, fixture.actor.userId],
      )).rows[0]!.id;
      const createVariant = async (name: string) => (await tx.query<{ id: string }>(
        `insert into core.pricing_variants(organization_id,restaurant_id,product_id,name,list_price,cost_source_kind,
           manual_ingredient_cost,manual_cost_updated_at,manual_currency,packaging,other_variable_cost,created_by)
         values($1,$2,$3,$4,10,'manual',2,now(),'BRL','[]',0,$5) returning id`,
        [ctx.organizationId, ctx.restaurantId, productId, name, fixture.actor.userId],
      )).rows[0]!.id;
      const originalVariantId = await createVariant('Original');
      const replacementVariantId = await createVariant('Replacement');
      const channelId = (await tx.query<{ id: string }>(
        `insert into core.pricing_channel_profiles(organization_id,restaurant_id,name,created_by)
         values($1,$2,'Direct',$3) returning id`, [ctx.organizationId, ctx.restaurantId, fixture.actor.userId],
      )).rows[0]!.id;
      const comboId = (await tx.query<{ id: string }>(
        `insert into core.pricing_combos(organization_id,restaurant_id,name,created_by)
         values($1,$2,'Combo',$3) returning id`, [ctx.organizationId, ctx.restaurantId, fixture.actor.userId],
      )).rows[0]!.id;
      await tx.query(
        `insert into core.pricing_combo_components(organization_id,restaurant_id,combo_id,variant_id,position,quantity)
         values($1,$2,$3,$4,1,1)`, [ctx.organizationId, ctx.restaurantId, comboId, originalVariantId],
      );
      const timestamp = new Date().toISOString();
      const simulationId = (await tx.query<{ id: string }>(
        `insert into core.pricing_simulations(organization_id,restaurant_id,combo_id,channel_id,input_snapshot,
           component_cost_snapshots,channel_snapshot,combo_snapshot,quote,created_by)
         values($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10) returning id`,
        [ctx.organizationId, ctx.restaurantId, comboId, channelId,
          JSON.stringify({ variantId: null, comboId, channelId, targetContributionMargin: '0.25', targetCmv: null }),
          JSON.stringify([{ variantId: originalVariantId, quantity: '1', costSourceSnapshot: { kind: 'manual', ingredientCost: '2', currency: 'BRL', updatedAt: timestamp }, costComponents: [], otherVariableCost: '0', replacedPackagingPaths: [] }]),
          JSON.stringify({ name: 'Direct', rates: [] }),
          JSON.stringify({ id: comboId, name: 'Combo', archivedAt: null, exclusivePackaging: [], components: [{ variantId: originalVariantId, quantity: '1', replacedPackagingPaths: [] }] }),
          JSON.stringify({ status: 'available', reason: null, suggestedPrice: '10', costBuckets: { ingredients: '2', packaging: '0', otherVariable: '0' }, totalVariableCost: '2', currentPriceMetrics: null, suggestedPriceMetrics: null, rateBreakdown: [] }),
          fixture.actor.userId],
      )).rows[0]!.id;
      await tx.query('delete from core.pricing_combo_components where organization_id=$1 and restaurant_id=$2 and combo_id=$3', [ctx.organizationId, ctx.restaurantId, comboId]);
      await tx.query(
        `insert into core.pricing_combo_components(organization_id,restaurant_id,combo_id,variant_id,position,quantity)
         values($1,$2,$3,$4,1,2)`, [ctx.organizationId, ctx.restaurantId, comboId, replacementVariantId],
      );
      return { productId, simulationId };
    });

    const page = await fixture.run((ctx, tx) => pricingRepository.listPricingSimulations(ctx, ids.productId, { limit: 10 }, tx));
    expect(page.items.map((item) => item.id)).toContain(ids.simulationId);
    expect(page.items[0]?.componentCostSnapshots[0]?.variantId).not.toBeUndefined();
  } finally {
    await fixture.close();
  }
}, 120000);
