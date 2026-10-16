import { afterAll,expect,it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';
const pool=runtimePool(); afterAll(()=>pool.end());
export const inventoryTables=['ingredients','suppliers','ingredient_conversions','purchase_receipts','purchase_receipt_items','stock_balances','stock_movements','purchase_price_history','stock_reversals','stock_locations','inventory_counts','inventory_count_items','inventory_count_observations'];
it('inventory exists with FORCE RLS and no anonymous grants or bypass runtime',async()=>{
 const rows=(await pool.query("select relname,relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='core' and relkind='r' and relname=any($1)",[inventoryTables])).rows;
 expect(rows).toHaveLength(13); expect(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
 for(const table of inventoryTables.filter(table=>table!=='stock_locations')) expect((await pool.query(`select * from core.${table}`)).rowCount).toBe(0);
 const locations=(await pool.query('select organization_id,restaurant_id,id,is_default,archived from core.stock_locations')).rows;
 expect(locations.every((l)=>l.is_default&&!l.archived)).toBe(true);
 expect((await pool.query(`select count(*)::text n from core.restaurants r where not exists(select 1 from core.stock_locations l where l.organization_id=r.organization_id and l.restaurant_id=r.id and l.is_default and not l.archived)`)).rows[0]?.n).toBe('0');
 const columns=(await pool.query("select table_name,column_name from information_schema.columns where table_schema='core' and (table_name,column_name) in (('stock_balances','location_id'),('stock_movements','location_id'),('purchase_receipts','location_id'),('purchase_price_history','location_id'),('recipe_cost_snapshot_lines','location_id'))")).rows;
 expect(columns).toHaveLength(5);
 expect((await pool.query("select rolbypassrls or rolsuper as bypass from pg_roles where rolname=current_user")).rows[0]?.bypass).toBe(false);
 for(const role of ['anon','authenticated']){
  expect((await pool.query("select has_schema_privilege($1,'core','usage') as allowed",[role])).rows[0]?.allowed).toBe(false);
  expect((await pool.query("select count(*)::text n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r' and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",[role])).rows[0]?.n).toBe('0');
  expect((await pool.query("select count(*)::text n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='core' and has_function_privilege($1,p.oid,'EXECUTE')",[role])).rows[0]?.n).toBe('0');
 }
 expect((await pool.query("select count(*)::text n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='core' and p.prosecdef")).rows[0]?.n).toBe('0');
});
