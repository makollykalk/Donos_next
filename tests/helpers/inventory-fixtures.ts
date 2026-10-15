import { randomUUID } from 'node:crypto';
import { createDatabase } from '@donos/db';
import { createCore,createRestaurant } from '@donos/domain-core';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { runtimePool,login,config } from './local-db.js';
export const inventoryOrganizations={a:'31000000-0000-4000-8000-000000000010',c:'31000000-0000-4000-8000-000000000020',b:'32000000-0000-4000-8000-000000000010'};
export async function createInventoryFixtures(name:'a'|'b'='a',organizationId=inventoryOrganizations[name]) {
 const pool=runtimePool(),db=createDatabase(pool),auth=await login(name);
 const verify=createActorVerifier(auth.auth.auth,`${config.supabaseUrl}/auth/v1`);
 const actor=await verify(auth.token,randomUUID());
 const unit=await createRestaurant(db,actor,organizationId,{name:`Inventory synthetic ${randomUUID()}`},randomUUID());
 const selection={organizationId,restaurantId:unit.id},selected=await createCore(db).selectContext(actor,selection);
 const run=<T>(fn:Parameters<typeof db.withRestaurantTx<T>>[3])=>db.withRestaurantTx(actor,selection,selected.token,fn);
 return {pool,db,actor,selection,token:selected.token,jwt:auth.token,verify,run,close:()=>pool.end()};
}
