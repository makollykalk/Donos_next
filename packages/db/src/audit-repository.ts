import type { OrganizationContext,Tx } from './types.js';
export async function appendAudit(ctx:OrganizationContext,event:{action:'organization.created'|'restaurant.created';entityId:string},tx:Tx):Promise<void> {
  // Organization registration events describe an entity; they do not expose unit-local data.
  await tx.query('insert into core.audit_events(organization_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5)',[ctx.organizationId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
