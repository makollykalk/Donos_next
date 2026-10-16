import type { OrganizationContext,RestaurantContext,Tx } from './types.js';
export type InventoryAuditAction='inventory.ingredient.created'|'inventory.ingredient.updated'|'inventory.supplier.created'|'inventory.supplier.updated'|'inventory.conversion.created'|'inventory.location.created'|'inventory.location.updated'|'inventory.receipt.drafted'|'inventory.receipt.received'|'inventory.issue.posted'|'inventory.reversal.posted'|'inventory.count.opened'|'inventory.count.item.recorded'|'inventory.count.item.reviewed'|'inventory.count.item.validated'|'inventory.count.closed'|'inventory.count.cancelled';
export type RecipeAuditAction='recipe.created'|'recipe.version.created'|'recipe.measurement.recorded'|'recipe.measurement.validated';
export type PricingAuditAction='pricing.product.created'|'pricing.product.updated'|'pricing.product.archived'|'pricing.variant.created'|'pricing.variant.updated'|'pricing.channel.created'|'pricing.channel.updated'|'pricing.combo.created'|'pricing.combo.updated'|'pricing.simulation.created';
export async function appendInventoryAudit(ctx:RestaurantContext,event:{action:InventoryAuditAction;entityId:string},tx:Tx):Promise<void>{
 await tx.query('insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5,$6)',[ctx.organizationId,ctx.restaurantId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
export async function appendRecipeAudit(ctx:RestaurantContext,event:{action:RecipeAuditAction;entityId:string},tx:Tx):Promise<void>{
 await tx.query('insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5,$6)',[ctx.organizationId,ctx.restaurantId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
export async function appendPricingAudit(ctx:RestaurantContext,event:{action:PricingAuditAction;entityId:string},tx:Tx):Promise<void>{
 await tx.query('insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5,$6)',[ctx.organizationId,ctx.restaurantId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
export async function appendAudit(ctx:OrganizationContext,event:{action:'organization.created'|'restaurant.created';entityId:string},tx:Tx):Promise<void> {
  // Organization registration events describe an entity; they do not expose unit-local data.
  await tx.query('insert into core.audit_events(organization_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,$4,$5)',[ctx.organizationId,ctx.actor.userId,event.action,event.entityId,ctx.actor.requestId]);
}
