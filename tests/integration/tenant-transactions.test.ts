import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(1), db=createDatabase(pool);
const actor=(id:string)=>({userId:id,sessionId:randomUUID(),requestId:randomUUID()}) as VerifiedActor;
afterAll(()=>pool.end());
it('T-01: A tem duas empresas; B não as vê; sem login não há linhas',async()=>{
  const a=await db.withActorTx(actor(f.a),tx=>tx.query('select id from core.organizations order by id'));
  expect(a.rows.map(r=>r.id)).toContain(f.orgA); expect(a.rows.map(r=>r.id)).toContain(f.orgC);
  expect(a.rows.map(r=>r.id)).not.toContain(f.orgB);
  expect((await db.withActorTx(actor(f.b),tx=>tx.query('select id from core.organizations where id=$1',[f.orgA]))).rowCount).toBe(0);
  await expect(db.withOrganizationTx(actor(f.a),f.orgB,async()=>true)).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
  expect((await pool.query('select id from core.organizations')).rowCount).toBe(0);
});
it('escopo de organização não mistura A/C/B; ID forjado falha no RLS',async()=>{
  await db.withOrganizationTx(actor(f.a),f.orgA,async(_ctx,tx)=>{
    expect((await tx.query('select id from core.restaurants order by id')).rows.map(r=>r.id)).toEqual([f.a1,f.a2]);
    await expect(tx.query('insert into core.restaurants(organization_id,name) values($1,$2)',[f.orgB,'forged'])).rejects.toMatchObject({code:'42501'});
  }).catch(error=>{if(error.code!=='25P02') throw error;});
});
it('pool max1 limpa ator/org/unidade após rollback e commit, inclusive paralelo',async()=>{
  await expect(db.withOrganizationTx(actor(f.a),f.orgA,async()=>{throw new Error('rollback');})).rejects.toThrow('rollback');
  for(const user of [f.b,f.a,f.b]) await db.withActorTx(actor(user),async tx=>{
    const rows=(await tx.query('select owner_user_id from core.organizations')).rows;
    expect(rows.every(r=>r.owner_user_id===user)).toBe(true);
    expect((await tx.query('select core.organization_id() as org,core.restaurant_id() as unit')).rows[0]).toEqual({org:null,unit:null});
  });
  await Promise.all([f.a,f.b,f.a,f.b].map(user=>db.withActorTx(actor(user),async tx=>{
    expect((await tx.query('select owner_user_id from core.organizations')).rows.every(r=>r.owner_user_id===user)).toBe(true);
  })));
  expect((await pool.query('select core.actor_id() as actor,core.organization_id() as org,core.restaurant_id() as unit')).rows[0]).toEqual({actor:null,org:null,unit:null});
});
