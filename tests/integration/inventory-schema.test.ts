import { afterAll,expect,it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';
const pool=runtimePool(); afterAll(()=>pool.end());
export const inventoryTables=['ingredients','suppliers','ingredient_conversions','purchase_receipts','purchase_receipt_items','stock_balances','stock_movements','purchase_price_history','stock_reversals'];
it('inventory exists with FORCE RLS and no anonymous grants or bypass runtime',async()=>{
 const rows=(await pool.query("select relname,relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='core' and relkind='r' and relname=any($1)",[inventoryTables])).rows;
 expect(rows).toHaveLength(9); expect(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
 for(const table of inventoryTables) expect((await pool.query(`select * from core.${table}`)).rowCount).toBe(0);
 expect((await pool.query("select rolbypassrls or rolsuper as bypass from pg_roles where rolname=current_user")).rows[0]?.bypass).toBe(false);
 for(const role of ['anon','authenticated']){
  expect((await pool.query("select has_schema_privilege($1,'core','usage') as allowed",[role])).rows[0]?.allowed).toBe(false);
  expect((await pool.query("select count(*)::text n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r' and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",[role])).rows[0]?.n).toBe('0');
  expect((await pool.query("select count(*)::text n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='core' and has_function_privilege($1,p.oid,'EXECUTE')",[role])).rows[0]?.n).toBe('0');
 }
 expect((await pool.query("select count(*)::text n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='core' and p.prosecdef")).rows[0]?.n).toBe('0');
});
