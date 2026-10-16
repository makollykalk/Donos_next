import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { pricingRepository } from '@donos/db';
import { createPricingFixtures } from '../helpers/pricing-fixtures.js';

it('serializes combo catalog edits with a simulation read lock', async () => {
  const fixture = await createPricingFixtures('a');
  try {
    const comboId = await fixture.run(async (ctx, tx) => (await tx.query<{ id: string }>(
      `insert into core.pricing_combos(organization_id,restaurant_id,name,list_price,exclusive_packaging,created_by)
       values($1,$2,$3,10,'[]'::jsonb,$4) returning id`,
      [ctx.organizationId, ctx.restaurantId, `Lock test ${randomUUID()}`, fixture.actor.userId],
    )).rows[0]!.id);

    let markReadStarted!: () => void;
    let releaseRead!: () => void;
    let markUpdateStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
    const updateStarted = new Promise<void>((resolve) => { markUpdateStarted = resolve; });
    const holdRead = new Promise<void>((resolve) => { releaseRead = resolve; });
    const reader = fixture.db.withRestaurantTx(fixture.actor, fixture.selection, fixture.token, async (ctx, tx) => {
      await pricingRepository.getPricingCombo(ctx, comboId, tx);
      markReadStarted();
      await holdRead;
    });
    await readStarted;

    let updateFinished = false;
    const writer = fixture.db.withRestaurantTx(fixture.actor, fixture.selection, fixture.token, async (ctx, tx) => {
      markUpdateStarted();
      await pricingRepository.updatePricingCombo(ctx, comboId, { name: `Updated ${randomUUID()}` }, tx);
      updateFinished = true;
    });
    await updateStarted;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(updateFinished).toBe(false);
    releaseRead();
    await Promise.all([reader, writer]);
    expect(updateFinished).toBe(true);
  } finally {
    await fixture.close();
  }
}, 120000);
