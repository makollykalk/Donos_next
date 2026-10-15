import { afterAll, expect, it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';
const pool=runtimePool(); afterAll(()=>pool.end());
it('runtime não possui bypass, ownership, membership ou mutações administrativas',async()=>{
  const role=(await pool.query("select rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit from pg_roles where rolname=current_user")).rows[0];
  expect(Object.values(role).every(v=>v===false)).toBe(true);
  expect((await pool.query('select 1 from pg_auth_members where member=(select oid from pg_roles where rolname=current_user)')).rowCount).toBe(0);
  expect((await pool.query("select 1 from pg_class where relnamespace='core'::regnamespace and relowner=(select oid from pg_roles where rolname=current_user)")).rowCount).toBe(0);
  for(const role of ['anon','authenticated','public']) {
    expect((await pool.query("select has_schema_privilege($1,'core','usage') as allowed",[role])).rows[0].allowed).toBe(false);
  }
  for(const sql of ['delete from core.audit_events','update core.organizations set name=\'hacked\'','select * from auth.users'])
    await expect(pool.query(sql)).rejects.toMatchObject({code:'42501'});
});
