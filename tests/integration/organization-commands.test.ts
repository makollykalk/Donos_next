import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor,Database,Tx } from '../../packages/db/src/index.js';
import { createOrganization } from '../../packages/domain-core/src/organizations.js';
import { createCore } from '../../packages/domain-core/src/context.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool); afterAll(()=>pool.end());
const actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
it('organization bootstrap creates exactly one active default stock location in the same unit transaction',async()=>{
  const created=await createOrganization(db,actor,{name:`Location bootstrap ${randomUUID()}`,firstRestaurant:{name:'Initial unit'}},randomUUID());
  const selection={organizationId:created.organization.id,restaurantId:created.restaurant.id};
  const selected=await createCore(db).selectContext(actor,selection);
  const locations=await db.withRestaurantTx(actor,selection,selected.token,async(ctx,tx)=>(await tx.query('select id,is_default,archived from core.stock_locations where organization_id=$1 and restaurant_id=$2',[ctx.organizationId,ctx.restaurantId])).rows);
  expect(locations).toHaveLength(1);
  expect(locations[0]).toMatchObject({is_default:true,archived:false});
});
it('database rejects a restaurant committed without its active default stock location',async()=>{
  const id=randomUUID();
  await expect(db.withOrganizationTx(actor,f.orgA,async(ctx,tx)=>tx.query('insert into core.restaurants(id,organization_id,name) values($1,$2,$3)',[id,ctx.organizationId,`Missing location ${id}`]))).rejects.toMatchObject({code:'23514'});
});
it.each(['insert into core.restaurants','insert into core.audit_events','update core.idempotency_records'])('falha em %s reverte bootstrap inteiro',async phase=>{
  const name=`Rollback ${randomUUID()}`;
  const failing:Database={...db,withActorTx:async(a,fn,allow)=>db.withActorTx(a,tx=>{
    const proxy:Tx={query:async(text,values)=>{if(text.startsWith(phase)) throw new Error('injected failure');return tx.query(text,values);}};
    return fn(proxy);
  },allow)};
  await expect(createOrganization(failing,actor,{name,firstRestaurant:{name:'Synthetic'}},randomUUID())).rejects.toThrow('injected failure');
  expect((await db.withActorTx(actor,tx=>tx.query('select id from core.organizations where name=$1',[name]))).rowCount).toBe(0);
});
