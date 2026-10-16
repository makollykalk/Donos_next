import { expect, it } from 'vitest';
import type { Database, Tx } from '@donos/db';
import { createPricingService } from '../../apps/api/src/services/pricing.js';

it('returns recipe-linked catalog details under pricing_core when inventory_core is unavailable', async () => {
  const queries: string[] = [];
  const actor = { userId: '10000000-0000-4000-8000-000000000001', sessionId: '10000000-0000-4000-8000-000000000002' };
  const context = { actor, organizationId: '10000000-0000-4000-8000-000000000010', restaurantId: '10000000-0000-4000-8000-000000000011' };
  const tx = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes('from core.entitlements')) return { rows: [
        { feature_key: 'pricing_core', enabled: true, valid: true, subscribed: true },
        { feature_key: 'inventory_core', enabled: false, valid: false, subscribed: true },
      ], rowCount: 2 };
      if (sql.includes('from core.pricing_variants')) return { rows: [{
        id: '10000000-0000-4000-8000-000000000021', product_id: '10000000-0000-4000-8000-000000000022',
        name: 'Ficha vinculada', list_price: '25', cost_source_kind: 'recipe', manual_ingredient_cost: null,
        manual_cost_updated_at: null, manual_currency: null, recipe_id: '10000000-0000-4000-8000-000000000023',
        location_id: '10000000-0000-4000-8000-000000000024', quantity_per_sale: '2',
        packaging: [{ id: '10000000-0000-4000-8000-000000000025', name: 'Caixa', costPerSale: '1' }],
        other_variable_cost: '0', archived_at: null,
      }], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    },
  } as unknown as Tx;
  const database = {
    async withRestaurantTx(_actor: unknown, _selection: unknown, _token: unknown, fn: (ctx: typeof context, tx: Tx) => Promise<unknown>) {
      return fn(context, tx);
    },
  } as unknown as Database;

  const variant = await createPricingService(database).getVariant(
    actor as never,
    { organizationId: context.organizationId, restaurantId: context.restaurantId },
    'context-token',
    '10000000-0000-4000-8000-000000000021',
  );

  expect(variant.costSource.kind).toBe('recipe');
  expect(variant.packagingPaths).toEqual([]);
  expect(variant.packagingPathsAvailable).toBe(false);
  expect(queries.filter((sql) => sql.includes('core.entitlements'))).toHaveLength(2);
  expect(queries.filter((sql) => sql.includes('core.pricing_variants'))).toHaveLength(1);
  expect(queries.some((sql) => sql.includes('core.recipes'))).toBe(false);
});
