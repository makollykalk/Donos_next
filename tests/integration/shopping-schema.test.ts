import { afterAll, expect, it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';

const pool = runtimePool();
afterAll(() => pool.end());

const tables = ['stock_thresholds', 'shopping_lists', 'shopping_list_items', 'shopping_commitments'];

it('shopping schema exists with scoped keys, FORCE RLS, runtime access and minimum grants', async () => {
  const relations = (await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
     join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r' and c.relname=any($1)`, [tables],
  )).rows;
  expect(relations.map((row) => row.relname).sort()).toEqual([...tables].sort());
  expect(relations.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

  const scopeColumns = (await pool.query<{ table_name: string; column_name: string }>(
    `select table_name,column_name from information_schema.columns where table_schema='core'
     and table_name=any($1) and column_name=any($2)`, [tables, ['organization_id', 'restaurant_id', 'location_id']],
  )).rows;
  for (const table of tables) {
    const found = scopeColumns.filter((column) => column.table_name === table).map((column) => column.column_name);
    expect(found.sort(), `${table} scope columns`).toEqual(['location_id', 'organization_id', 'restaurant_id']);
    // Runtime role must be able to query each object; SELECT 0 reads metadata, not tenant data.
    expect((await pool.query(`select * from core.${table} limit 0`)).rowCount).toBe(0);
  }
  const composedFks = (await pool.query<{ table_name: string; count: string }>(
    `select t.relname table_name,count(*)::text count from pg_constraint c
     join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='core' and t.relname=any($1) and c.contype='f'
       and array_position(c.conkey,(select attnum from pg_attribute where attrelid=t.oid and attname='organization_id')) is not null
       and array_position(c.conkey,(select attnum from pg_attribute where attrelid=t.oid and attname='restaurant_id')) is not null
     group by t.relname`, [tables],
  )).rows;
  expect(composedFks.length).toBe(4);
  expect(composedFks.every((row) => Number(row.count) > 0)).toBe(true);

  const receiptLink = await pool.query(
    `select 1 from information_schema.columns where table_schema='core' and table_name='purchase_receipt_items'
     and column_name='commitment_id' and is_nullable='YES'`,
  );
  expect(receiptLink.rowCount).toBe(1);
  expect((await pool.query(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='core' and t.relname='purchase_receipt_items' and c.contype='f'
       and pg_get_constraintdef(c.oid) like '%commitment_id%'`,
  )).rowCount).toBeGreaterThan(0);

  const role = (await pool.query<{ role: string; bypass: boolean }>('select current_user role, rolsuper or rolbypassrls bypass from pg_roles where rolname=current_user')).rows[0];
  expect(role?.role).toBe('donos_api');
  expect(role?.bypass).toBe(false);
  for (const table of tables) {
    expect((await pool.query('select has_table_privilege(current_user,$1,\'SELECT\') allowed', [`core.${table}`])).rows[0]?.allowed).toBe(true);
    expect((await pool.query('select has_table_privilege(current_user,$1,\'DELETE,TRUNCATE\') allowed', [`core.${table}`])).rows[0]?.allowed).toBe(false);
  }
  for (const roleName of ['anon', 'authenticated']) {
    expect((await pool.query("select has_schema_privilege($1,'core','usage') allowed", [roleName])).rows[0]?.allowed).toBe(false);
    expect((await pool.query(
      `select count(*)::text n from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='core' and c.relname=any($2) and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`, [roleName, tables],
    )).rows[0]?.n).toBe('0');
  }
});
