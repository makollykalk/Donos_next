import { afterAll, expect, it } from 'vitest';
import { runtimePool, login } from '../helpers/local-db.js';
const pool=runtimePool();
afterAll(()=>pool.end());
it('conecta diretamente como runtime e não vaza domínio sem contexto',async()=>{
  expect((await pool.query('select current_user as role')).rows).toEqual([{role:'donos_api'}]);
  expect((await pool.query('select * from core.organizations')).rowCount).toBe(0);
  const tables=await pool.query("select relname,relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='core' and relkind='r'");
  expect(tables.rowCount).toBe(11);
  expect(tables.rows.every(t=>t.relrowsecurity&&t.relforcerowsecurity)).toBe(true);
});
it('autentica dois tenants com credenciais sintéticas distintas',async()=>{
  const a=await login('a'), b=await login('b');
  expect(a.userId).not.toBe(b.userId); expect(a.token).not.toBe(b.token);
});
