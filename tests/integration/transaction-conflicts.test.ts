import { randomBytes,randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll,expect,it } from 'vitest';
import { createDatabase,executeIdempotent,retryIdempotent } from '../../packages/db/src/index.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { createOrganization } from '../../packages/domain-core/src/organizations.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(4);afterAll(()=>pool.end());
const actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
function rendezvous(count:number){let arrived=0;let release!:()=>void;const ready=new Promise<void>(r=>{release=r;});return async()=>{if(++arrived===count)release();await ready;};}
it('retry recebe40001real por disputa serializable e conserva bootstrap único',async()=>{
  const meet=rendezvous(2),codes:string[]=[];let firstReads=0;
  // Test adapter changes isolation only; every query/result still comes from PostgreSQL.
  const serialPool={connect:async()=>{
    const client=await pool.connect();return {
      query:async(text:string,values?:unknown[])=>{
        try{
          const result=await client.query(text==='begin'?'begin isolation level serializable':text,values);
          if(text.startsWith('select 1 from core.session_revocations')&&firstReads++<2)await meet();
          return result;
        }catch(error){if(typeof error==='object'&&error!==null&&'code' in error)codes.push(String(error.code));throw error;}
      },release:()=>client.release(),
    };
  }} as unknown as pg.Pool;
  const db=createDatabase(serialPool),key=randomUUID(),input={name:`Serializable ${randomUUID()}`,firstRestaurant:{name:'Synthetic'}};
  const [a,b]=await Promise.all([createOrganization(db,actor,input,key),createOrganization(db,actor,input,key)]);
  expect(a).toEqual(b);expect(codes).toContain('40001');
  expect((await createDatabase(pool).withOrganizationTx(actor,a.organization.id,(_ctx,tx)=>tx.query('select id from core.restaurants'))).rowCount).toBe(1);
});
it('retry recebe40P01real de deadlock e confirma cada comando idempotente uma vez',async()=>{
  const db=createDatabase(pool),meet=rendezvous(2),codes:string[]=[];
  const locks=[BigInt(`0x${randomBytes(6).toString('hex')}`).toString(),BigInt(`0x${randomBytes(6).toString('hex')}`).toString()];
  async function command(order:string[],key:string){let attempt=0;return retryIdempotent(()=>db.withActorTx(actor,async tx=>{
    const first=attempt++===0;
    try{
      await tx.query('select pg_advisory_xact_lock($1::bigint)',[order[0]]);
      if(first)await meet();
      await tx.query('select pg_advisory_xact_lock($1::bigint)',[order[1]]);
      return executeIdempotent({kind:'actor',actor},'test.deadlock.probe',key,{key},tx,async()=>({key,committed:true}));
    }catch(error){if(typeof error==='object'&&error!==null&&'code' in error)codes.push(String(error.code));throw error;}
  }));}
  const keys=[randomUUID(),randomUUID()];
  const results=await Promise.all([command(locks,keys[0]!),command([...locks].reverse(),keys[1]!)]);
  expect(results.every(r=>r.committed)).toBe(true);expect(codes).toContain('40P01');
  expect((await db.withActorTx(actor,tx=>tx.query('select key from core.idempotency_records where operation=$1 and key=any($2::uuid[])',['test.deadlock.probe',keys]))).rowCount).toBe(2);
});
