import type { CreateOrganizationInput,Organization,Restaurant } from '@donos/contracts';
import { appendAudit,executeIdempotent,retryIdempotent } from '@donos/db';
import type { Database,VerifiedActor } from '@donos/db';
export async function createOrganization(db:Database,actor:VerifiedActor,input:CreateOrganizationInput,key:string):Promise<{organization:Organization;restaurant:Restaurant}> {
  return retryIdempotent(()=>db.withActorTx(actor,tx=>executeIdempotent({kind:'actor',actor},'organization.create',key,input,tx,async()=>{
    const organization=(await tx.query<Organization>('insert into core.organizations(owner_user_id,name) values($1,$2) returning id,name',[actor.userId,input.name])).rows[0]!;
    const ctx=await db.setOrganization(actor,organization.id,tx);
    const restaurant=(await tx.query<Restaurant>('insert into core.restaurants(organization_id,name) values($1,$2) returning id,organization_id as "organizationId",name',[organization.id,input.firstRestaurant.name])).rows[0]!;
    await appendAudit(ctx,{action:'organization.created',entityId:organization.id},tx);
    await appendAudit(ctx,{action:'restaurant.created',entityId:restaurant.id},tx);
    return {organization,restaurant};
  })));
}
