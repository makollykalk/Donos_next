import type { OrganizationContext,RestaurantContext,Tx } from './types.js';
export type InventoryAuditAction='inventory.ingredient.created'|'inventory.ingredient.updated'|'inventory.supplier.created'|'inventory.supplier.updated'|'inventory.conversion.created'|'inventory.receipt.drafted'|'inventory.receipt.received'|'inventory.issue.posted'|'inventory.reversal.posted';
export async function appendInventoryAudit(ctx:RestaurantContext,event:{action:InventoryAuditAction;entityId:string},tx:Tx):Promise<void>{
 await tx.query('insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5,$6)',[ctx.organizationId,ctx.restaurantId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
export async function appendAudit(ctx:OrganizationContext,event:{action:'organization.created'|'restaurant.created';entityId:string},tx:Tx):Promise<void> {
  // Organization registration events describe an entity; they do not expose unit-local data.
  await tx.query('insert into core.audit_events(organization_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5)',[ctx.organizationId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
