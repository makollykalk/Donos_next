import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor,Database,Tx } from '../../packages/db/src/index.js';
import { createOrganization } from '../../packages/domain-core/src/organizations.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool); afterAll(()=>pool.end());
const actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
it.each(['insert into core.restaurants','insert into core.audit_events','update core.idempotency_records'])('falha em %s reverte bootstrap inteiro',async phase=>{
  const name=`Rollback ${randomUUID()}`;
  const failing:Database={...db,withActorTx:async(a,fn,allow)=>db.withActorTx(a,tx=>{
    const proxy:Tx={query:async(text,values)=>{if(text.startsWith(phase)) throw new Error('injected failure');return tx.query(text,values);}};
    return fn(proxy);
  },allow)};
  await expect(createOrganization(failing,actor,{name,firstRestaurant:{name:'Synthetic'}},randomUUID())).rejects.toThrow('injected failure');
  expect((await db.withActorTx(actor,tx=>tx.query('select id from core.organizations where name=$1',[name]))).rowCount).toBe(0);
});
