import type { CreateRestaurantInput,Restaurant } from '@donos/contracts';
import { appendAudit,executeIdempotent,retryIdempotent } from '@donos/db';
import type { Database,VerifiedActor } from '@donos/db';
export async function createRestaurant(db:Database,actor:VerifiedActor,organizationId:string,input:CreateRestaurantInput,key:string):Promise<Restaurant> {
  return retryIdempotent(()=>db.withOrganizationTx(actor,organizationId,(ctx,tx)=>executeIdempotent({kind:'organization',context:ctx},'restaurant.create',key,input,tx,async()=>{
    const restaurant=(await tx.query<Restaurant>('insert into core.restaurants(organization_id,name) values($1,$2) returning id,organization_id as "organizationId",name',[organizationId,input.name])).rows[0]!;
    await tx.query("select set_config('app.restaurant_id',$1,true)",[restaurant.id]);
    await tx.query("insert into core.stock_locations(organization_id,restaurant_id,name,is_default) values($1,$2,'Principal',true)",[organizationId,restaurant.id]);
    await appendAudit(ctx,{action:'restaurant.created',entityId:restaurant.id},tx); return restaurant;
  })));
}
