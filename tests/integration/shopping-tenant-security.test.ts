import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createInventoryFixtures, inventoryOrganizations } from '../helpers/inventory-fixtures.js';

const shoppingTables = ['stock_thresholds', 'shopping_lists', 'shopping_list_items', 'shopping_commitments'] as const;

it('runtime RLS keeps shopping tables scoped and exposes composite tenant-reference constraints', async () => {
  const a1 = await createInventoryFixtures();
  const a2 = await createInventoryFixtures('a', inventoryOrganizations.a);
  const b = await createInventoryFixtures('b');
  try {
    const role = await a1.run(async (_ctx, tx) => (await tx.query<{ role: string }>('select current_user as role')).rows[0]?.role);
    expect(role).toBe('donos_api');
    // Create a synthetic threshold under A1 in a rollback-only transaction, then switch the
    // transaction context to a sibling unit and another organization and prove RLS hides it.
    const client = await a1.pool.connect();
    try {
      await client.query('begin');
      const setContext = async (fixture: typeof a1) => client.query(
        "select set_config('app.user_id',$1,true),set_config('app.session_id',$2,true),set_config('app.organization_id',$3,true),set_config('app.restaurant_id',$4,true)",
        [fixture.actor.userId, fixture.actor.sessionId, fixture.selection.organizationId, fixture.selection.restaurantId],
      );
      await setContext(a1);
      const ingredientId = randomUUID();
      const thresholdId = randomUUID();
      await client.query('insert into core.ingredients(id,organization_id,restaurant_id,name,base_unit) values($1,$2,$3,$4,$5)',
        [ingredientId, a1.selection.organizationId, a1.selection.restaurantId, `Shopping RLS ${ingredientId}`, 'kg']);
      await client.query(`insert into core.stock_thresholds(id,organization_id,restaurant_id,location_id,ingredient_id,base_unit,minimum_quantity,target_quantity,created_by,updated_by)
        values($1,$2,$3,$4,$5,'kg',1,2,$6,$6)`,
      [thresholdId, a1.selection.organizationId, a1.selection.restaurantId, a1.locationId, ingredientId, a1.actor.userId]);
      expect((await client.query('select id from core.stock_thresholds where id=$1', [thresholdId])).rowCount).toBe(1);
      for (const other of [a2, b]) {
        await setContext(other);
        expect((await client.query('select id from core.stock_thresholds where id=$1', [thresholdId])).rowCount).toBe(0);
      }
      await client.query('rollback');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // Constraint metadata proves every table has tenant/unit composite references. Also verify
    // location and ingredient references are composite on tables that expose those dimensions.
    const constraints = await a1.run(async (_ctx, tx) => tx.query<{ table_name: string; def: string }>(
      `select t.relname table_name,pg_get_constraintdef(c.oid) def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
       where n.nspname='core' and t.relname=any($1) and c.contype='f'`, [[...shoppingTables, 'purchase_receipt_items']],
    ));
    for (const table of shoppingTables) {
      const definitions = constraints.rows.filter((row) => row.table_name === table).map((row) => row.def);
      expect(definitions.some((def) => def.includes('organization_id') && def.includes('restaurant_id')), `${table} tenant/unit FK`).toBe(true);
      expect(definitions.some((def) => def.includes('location_id')), `${table} scoped location FK`).toBe(true);
    }
    expect(constraints.rows.some((row) => row.table_name === 'shopping_list_items' && row.def.includes('ingredient_id'))).toBe(true);
    expect(constraints.rows.some((row) => row.table_name === 'shopping_commitments' && row.def.includes('list_item_id'))).toBe(true);
    expect(constraints.rows.some((row) => row.table_name === 'purchase_receipt_items' && row.def.includes('commitment_id'))).toBe(true);
  } finally {
    await Promise.all([a1.close(), a2.close(), b.close()]);
  }
}, 120000);
