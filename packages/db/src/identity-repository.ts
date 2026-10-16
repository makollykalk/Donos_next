import type { Organization,Restaurant } from '@donos/contracts';
import type { Tx,VerifiedActor,OrganizationContext } from './types.js';
export async function listOwnedOrganizations(actor:VerifiedActor,tx:Tx):Promise<Organization[]> {
  return (await tx.query<Organization>('select id,name from core.organizations where owner_user_id=$1 order by created_at,id',[actor.userId])).rows;
}
export async function listRestaurants(ctx:OrganizationContext,tx:Tx):Promise<Restaurant[]> {
  return (await tx.query<Restaurant>('select id,organization_id as "organizationId",name from core.restaurants where organization_id=$1 order by created_at,id',[ctx.organizationId])).rows;
}
