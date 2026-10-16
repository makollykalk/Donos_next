import { afterAll, expect, it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';

const pool = runtimePool();
afterAll(() => pool.end());

const tables = [
  'pricing_products', 'pricing_variants', 'pricing_channel_profiles', 'pricing_channel_rates',
  'pricing_combos', 'pricing_combo_components', 'pricing_simulations',
];

it('pricing tables are context scoped, FORCE-RLS protected and simulation snapshots are insert-only', async () => {
  const rows = (await pool.query(
    "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r' and c.relname=any($1)",
    [tables],
  )).rows;
  expect(rows.map((row) => row.relname).sort()).toEqual([...tables].sort());
  expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

  const contextualTables = (await pool.query(
    "select c.relname,count(*) filter(where a.attname=any(array['organization_id','restaurant_id']))::int as context_columns from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where n.nspname='core' and c.relname=any($1) group by c.relname",
    [tables],
  )).rows;
  expect(contextualTables).toHaveLength(tables.length);
  expect(contextualTables.every((row) => row.context_columns === 2)).toBe(true);

  const contextualForeignKeys = (await pool.query(
    "select count(*)::int as count from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='core' and t.relname=any($1) and c.contype='f' and array_position(c.conkey,(select attnum from pg_attribute where attrelid=t.oid and attname='organization_id')) is not null and array_position(c.conkey,(select attnum from pg_attribute where attrelid=t.oid and attname='restaurant_id')) is not null",
    [tables],
  )).rows[0]?.count;
  expect(contextualForeignKeys).toBeGreaterThanOrEqual(tables.length);

  for (const role of ['anon', 'authenticated']) {
    expect((await pool.query("select has_schema_privilege($1,'core','usage') as allowed", [role])).rows[0]?.allowed).toBe(false);
    expect((await pool.query(
      "select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relname=any($2) and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",
      [role, tables],
    )).rows[0]?.count).toBe(0);
  }
  expect((await pool.query("select has_table_privilege('donos_api','core.pricing_simulations','SELECT') as allowed")).rows[0]?.allowed).toBe(true);
  expect((await pool.query("select has_table_privilege('donos_api','core.pricing_simulations','INSERT') as allowed")).rows[0]?.allowed).toBe(true);
  expect((await pool.query("select has_table_privilege('donos_api','core.pricing_simulations','UPDATE,DELETE,TRUNCATE') as allowed")).rows[0]?.allowed).toBe(false);
  for (const table of ['pricing_channel_rates', 'pricing_combo_components']) {
    expect((await pool.query('select has_table_privilege($1,$2,$3) as allowed', ['donos_api', `core.${table}`, 'DELETE'])).rows[0]?.allowed).toBe(true);
  }
});
