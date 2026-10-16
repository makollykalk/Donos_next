import { afterAll, expect, it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';

const pool = runtimePool();
afterAll(() => pool.end());

const tables = [
  'recipes', 'recipe_versions', 'recipe_transformations', 'recipe_components',
  'recipe_yield_measurements', 'recipe_transformation_measurements', 'recipe_validation_events',
  'recipe_cost_snapshot_lines',
];

it('recipe schema is context scoped, force-RLS protected, append-only and unavailable to public roles', async () => {
  const rows = (await pool.query(
    "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r' and c.relname=any($1)",
    [tables],
  )).rows;
  expect(rows.map((row) => row.relname).sort()).toEqual([...tables].sort());
  expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

  for (const table of tables) {
    expect((await pool.query(`select * from core.${table} limit 0`)).rowCount).toBe(0);
  }
  for (const role of ['anon', 'authenticated']) {
    expect((await pool.query("select has_schema_privilege($1,'core','usage') as allowed", [role])).rows[0]?.allowed).toBe(false);
    expect((await pool.query(
      "select count(*)::text n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r' and c.relname=any($2) and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",
      [role, tables],
    )).rows[0]?.n).toBe('0');
  }
  expect((await pool.query(
    "select count(*)::text n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relname=any($1) and has_table_privilege('donos_api',c.oid,'DELETE,TRUNCATE')",
    [tables],
  )).rows[0]?.n).toBe('0');

  const uniqueConstraints = (await pool.query(
    "select count(*)::text n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='core' and t.relname=any($1) and c.contype='f' and array_position(c.conkey, (select attnum from pg_attribute where attrelid=t.oid and attname='organization_id')) is not null and array_position(c.conkey, (select attnum from pg_attribute where attrelid=t.oid and attname='restaurant_id')) is not null",
    [tables],
  )).rows[0]?.n;
  expect(BigInt(uniqueConstraints ?? '0')).toBeGreaterThanOrEqual(8n);
  expect((await pool.query("select 1 from information_schema.columns where table_schema='core' and table_name='recipe_cost_snapshot_lines' and column_name='location_id'")).rowCount).toBe(1);
  expect((await pool.query("select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='core' and t.relname='recipe_cost_snapshot_lines' and c.contype='f' and pg_get_constraintdef(c.oid) like '%location_id%'")).rowCount).toBeGreaterThan(0);
});
