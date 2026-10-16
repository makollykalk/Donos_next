import type { CreateOrganizationInput,Organization,Restaurant } from '@donos/contracts';
import { appendAudit,executeIdempotent,retryIdempotent } from '@donos/db';
import type { Database,VerifiedActor } from '@donos/db';
export async function createOrganization(db:Database,actor:VerifiedActor,input:CreateOrganizationInput,key:string):Promise<{organization:Organization;restaurant:Restaurant}> {
  return retryIdempotent(()=>db.withActorTx(actor,tx=>executeIdempotent({kind:'actor',actor},'organization.create',key,input,tx,async()=>{
    const organization=(await tx.query<Organization>('insert into core.organizations(owner_user_id,name) values($1,$2) returning id,name',[actor.userId,input.name])).rows[0]!;
    const ctx=await db.setOrganization(actor,organization.id,tx);
    const restaurant=(await tx.query<Restaurant>('insert into core.restaurants(organization_id,name) values($1,$2) returning id,organization_id as "organizationId",name',[organization.id,input.firstRestaurant.name])).rows[0]!;
    await tx.query("select set_config('app.restaurant_id',$1,true)",[restaurant.id]);
    await tx.query("insert into core.stock_locations(organization_id,restaurant_id,name,is_default) values($1,$2,'Principal',true)",[organization.id,restaurant.id]);
    await appendAudit(ctx,{action:'organization.created',entityId:organization.id},tx);
    await appendAudit(ctx,{action:'restaurant.created',entityId:restaurant.id},tx);
    return {organization,restaurant};
  })));
}
