import type { CreateRestaurantInput,Restaurant } from '@donos/contracts';
import { appendAudit,executeIdempotent,retryIdempotent } from '@donos/db';
import type { Database,VerifiedActor } from '@donos/db';
export async function createRestaurant(db:Database,actor:VerifiedActor,organizationId:string,input:CreateRestaurantInput,key:string):Promise<Restaurant> {
  return retryIdempotent(()=>db.withOrganizationTx(actor,organizationId,(ctx,tx)=>executeIdempotent({kind:'organization',context:ctx},'restaurant.create',key,input,tx,async()=>{
    const restaurant=(await tx.query<Restaurant>('insert into core.restaurants(organization_id,name) values($1,$2) returning id,organization_id as "organizationId",name',[organizationId,input.name])).rows[0]!;
    await appendAudit(ctx,{action:'restaurant.created',entityId:restaurant.id},tx); return restaurant;
  })));
}
