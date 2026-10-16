import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { buildApp } from '../../apps/api/src/app.js';
import { createDatabase } from '../../packages/db/src/transaction.js';
import { createCore } from '../../packages/domain-core/src/index.js';
import { config, login, runtimePool } from '../helpers/local-db.js';
import { fixtures } from '../helpers/fixtures.js';

const pool = runtimePool();
const db = createDatabase(pool);
afterAll(() => pool.end());

it('pricing-only owner can idempotently create manual catalog and save an exact simulation snapshot', async () => {
  const session = await login('a');
  const verifyActor = createActorVerifier(session.auth.auth, `${config.supabaseUrl}/auth/v1`);
  const actor = await verifyActor(session.token, randomUUID());
  const selection = { organizationId: fixtures.orgC, restaurantId: fixtures.c1 };
  const context = await createCore(db).selectContext(actor, selection);
  const app = buildApp({ database: db, verifyActor });
  await app.ready();
  const base = `/v1/organizations/${selection.organizationId}/restaurants/${selection.restaurantId}/pricing`;
  const headers = { authorization: `Bearer ${session.token}`, 'x-donos-context': context.token };
  try {
    const createBody = { name: `Pricing ${randomUUID()}`, description: null };
    const productKey = randomUUID();
    const createOptions = { method: 'POST' as const, url: `${base}/products`, headers: { ...headers, 'idempotency-key': productKey }, payload: createBody };
    const [created, replay] = await Promise.all([app.inject(createOptions), app.inject(createOptions)]);
    expect(created.statusCode, created.body).toBe(201);
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(created.json());
    expect((await app.inject({ ...createOptions, payload: { name: 'Different payload', description: null } })).statusCode).toBe(409);

    const productId = created.json().id as string;
    const variant = await app.inject({
      method: 'POST', url: `${base}/products/${productId}/variants`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Manual', listPrice: '10', costSource: { kind: 'manual', ingredientCost: '2', currency: 'BRL' }, packaging: [], otherVariableCost: '0' },
    });
    expect(variant.statusCode, variant.body).toBe(201);
    const variantDetails = await app.inject({ url: `${base}/variants/${variant.json().id}`, headers });
    expect(variantDetails.statusCode, variantDetails.body).toBe(200);
    expect(variantDetails.json()).toMatchObject({ id: variant.json().id, packaging: [], costSource: { kind: 'manual', ingredientCost: '2' } });
    const channel = await app.inject({
      method: 'POST', url: `${base}/channels`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Direct', rates: [] },
    });
    expect(channel.statusCode, channel.body).toBe(201);

    const simulation = await app.inject({
      method: 'POST', url: `${base}/simulations`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { variantId: variant.json().id, comboId: null, channelId: channel.json().id, targetContributionMargin: '0.25', targetCmv: null },
    });
    expect(simulation.statusCode, simulation.body).toBe(201);
    expect(simulation.json()).toMatchObject({
      variantId: variant.json().id,
      costSourceSnapshot: { kind: 'manual', ingredientCost: '2', currency: 'BRL' },
      variantSnapshot: {
        variantId: variant.json().id, name: 'Manual', listPrice: '10',
        costSourceSnapshot: { kind: 'manual', ingredientCost: '2', currency: 'BRL' },
        packaging: [], otherVariableCost: '0',
        costComponents: [{ componentPath: ['manual-ingredient'], role: 'ingredient', costPerFinalUnitExact: { numerator: '2000000000000', denominator: '1' } }],
      },
      componentCostSnapshots: [],
      quote: { status: 'available', suggestedPrice: '2.67', costBuckets: { ingredients: '2', packaging: '0', otherVariable: '0' } },
    });

    const history = await app.inject({ url: `${base}/simulations?productId=${productId}`, headers });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json().items.map((item: { id: string }) => item.id)).toContain(simulation.json().id);

    const editVariant = await app.inject({
      method: 'PATCH', url: `${base}/variants/${variant.json().id}`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { listPrice: '15' },
    });
    expect(editVariant.statusCode, editVariant.body).toBe(200);
    const historical = history.json().items.find((item: { id: string }) => item.id === simulation.json().id);
    expect(historical.variantSnapshot.listPrice).toBe('10');
    expect(historical.quote).toEqual(simulation.json().quote);

    const comboPackageId = randomUUID();
    const comboVariant = await app.inject({
      method: 'POST', url: `${base}/products/${productId}/variants`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Com embalagem', listPrice: '10', costSource: { kind: 'manual', ingredientCost: '3', currency: 'BRL' },
        packaging: [{ id: comboPackageId, name: 'Caixa', costPerSale: '0.5' }], otherVariableCost: '0.5' },
    });
    expect(comboVariant.statusCode, comboVariant.body).toBe(201);
    const comboChannel = await app.inject({
      method: 'POST', url: `${base}/channels`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Combo channel', rates: [{ id: randomUUID(), kind: 'fee', mode: 'fixed', value: '2', rateBase: null, fixedBasis: 'per_sale' }] },
    });
    expect(comboChannel.statusCode, comboChannel.body).toBe(201);
    const combo = await app.inject({
      method: 'POST', url: `${base}/combos`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Combo', listPrice: '12', components: [{ variantId: comboVariant.json().id, quantity: '2', replacedPackagingPaths: [['app02-packaging', comboPackageId]] }],
        exclusivePackaging: [{ id: randomUUID(), name: 'Sacola', costPerSale: '1' }] },
    });
    expect(combo.statusCode, combo.body).toBe(201);
    const comboSimulation = await app.inject({
      method: 'POST', url: `${base}/simulations`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { variantId: null, comboId: combo.json().id, channelId: comboChannel.json().id, targetContributionMargin: '0.25', targetCmv: '0.5' },
    });
    expect(comboSimulation.statusCode, comboSimulation.body).toBe(201);
    expect(comboSimulation.json()).toMatchObject({
      variantId: null,
      comboSnapshot: { listPrice: '12' },
      componentCostSnapshots: [{ variantSnapshot: { listPrice: '10', costSourceSnapshot: { kind: 'manual', ingredientCost: '3' } }, quantity: '2' }],
      quote: { suggestedPrice: '13.34', costBuckets: { ingredients: '6', packaging: '1', otherVariable: '1' } },
    });
    const editComboVariant = await app.inject({
      method: 'PATCH', url: `${base}/variants/${comboVariant.json().id}`, headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { listPrice: '20', otherVariableCost: '4' },
    });
    expect(editComboVariant.statusCode, editComboVariant.body).toBe(200);
    const comboHistory = await app.inject({ url: `${base}/simulations?productId=${productId}`, headers });
    expect(comboHistory.statusCode, comboHistory.body).toBe(200);
    const savedCombo = comboHistory.json().items.find((item: { id: string }) => item.id === comboSimulation.json().id);
    expect(savedCombo.componentCostSnapshots[0].variantSnapshot).toMatchObject({ listPrice: '10', otherVariableCost: '0.5' });
    expect(savedCombo.quote).toEqual(comboSimulation.json().quote);
  } finally {
    await app.close();
  }
}, 120000);

it('rejects pricing routes when the owner lacks pricing_core even with a valid restaurant context', async () => {
  const session = await login('a');
  const verifyActor = createActorVerifier(session.auth.auth, `${config.supabaseUrl}/auth/v1`);
  const actor = await verifyActor(session.token, randomUUID());
  const selection = { organizationId: fixtures.orgA, restaurantId: fixtures.a1 };
  const context = await createCore(db).selectContext(actor, selection);
  const app = buildApp({ database: db, verifyActor });
  await app.ready();
  try {
    const response = await app.inject({
      url: `/v1/organizations/${selection.organizationId}/restaurants/${selection.restaurantId}/pricing/products`,
      headers: { authorization: `Bearer ${session.token}`, 'x-donos-context': context.token },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ENTITLEMENT_REQUIRED');
  } finally {
    await app.close();
  }
}, 120000);
