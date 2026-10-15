import type { ContextSelection,ReversalInput,MovementResult } from '@donos/contracts';
import type { Database,VerifiedActor,RestaurantContext,Tx,InventoryAuditAction } from '@donos/db';
import { DomainError,executeIdempotent,retryIdempotent,inventoryCatalog as catalog,inventoryRead as reads,purchaseRepository as purchases,appendInventoryAudit,getMovement,lockBalance } from '@donos/db';
import { requireEntitlement } from '@donos/domain-billing';
import { InventoryCalculationError,issueStock,assertReversible,compensate } from '@donos/domain-inventory';
import { draftReceipt,receiveReceipt } from '@donos/domain-purchases';
import type { InventoryService } from './inventory-types.js';
export function createInventoryService(db:Database):InventoryService{
 async function tx<T>(actor:VerifiedActor,selection:ContextSelection,token:string,fn:(ctx:RestaurantContext,tx:Tx)=>Promise<T>):Promise<T>{
  try{return await retryIdempotent(()=>db.withRestaurantTx(actor,selection,token,async(ctx,tx)=>{await requireEntitlement(ctx,'inventory_core',tx);return fn(ctx,tx);}));}
  catch(e){if(e instanceof InventoryCalculationError)throw new DomainError(e.code,['INSUFFICIENT_STOCK','RESOURCE_CONFLICT','REVERSAL_REQUIRES_REVALUATION'].includes(e.code)?409:400);throw e;}
 }
 function mutate<T>(actor:VerifiedActor,selection:ContextSelection,token:string,operation:string,key:string,input:unknown,fn:(ctx:RestaurantContext,tx:Tx)=>Promise<T>){
  return tx(actor,selection,token,(ctx,t)=>executeIdempotent({kind:'organization',context:ctx},`inventory.${operation}`,key,{selection,input},t,()=>fn(ctx,t)));
 }
 async function audit<T extends {id:string}>(ctx:RestaurantContext,action:InventoryAuditAction,entity:Promise<T>,t:Tx):Promise<T>{const r=await entity;await appendInventoryAudit(ctx,{action,entityId:r.id},t);return r;}
 async function reversalHeader(ctx:RestaurantContext,origin:{movementId?:string;receiptId?:string},input:ReversalInput,t:Tx):Promise<string>{
  const r=(await t.query('insert into core.stock_reversals(organization_id,restaurant_id,origin_movement_id,origin_receipt_id,reason,actor_user_id) values($1,$2,$3,$4,$5,$6) returning id',[ctx.organizationId,ctx.restaurantId,origin.movementId??null,origin.receiptId??null,input.reason,ctx.actor.userId])).rows[0]!;return r.id as string;
 }
 const service:InventoryService={
  createIngredient:(a,s,t,i,k)=>mutate(a,s,t,'ingredient.create',k,i,(c,x)=>audit(c,'inventory.ingredient.created',catalog.createIngredient(c,i,x),x)),
  patchIngredient:(a,s,t,id,i,k)=>mutate(a,s,t,'ingredient.patch',k,{id,i},(c,x)=>audit(c,'inventory.ingredient.updated',catalog.patchIngredient(c,id,i,x),x)),
  createSupplier:(a,s,t,i,k)=>mutate(a,s,t,'supplier.create',k,i,(c,x)=>audit(c,'inventory.supplier.created',catalog.createSupplier(c,i,x),x)),
  patchSupplier:(a,s,t,id,i,k)=>mutate(a,s,t,'supplier.patch',k,{id,i},(c,x)=>audit(c,'inventory.supplier.updated',catalog.patchSupplier(c,id,i,x),x)),
  createConversion:(a,s,t,id,i,k)=>mutate(a,s,t,'conversion.create',k,{id,i},(c,x)=>audit(c,'inventory.conversion.created',catalog.createConversion(c,id,i,x),x)),
  createReceipt:(a,s,t,i,k)=>mutate(a,s,t,'receipt.draft',k,i,(c,x)=>audit(c,'inventory.receipt.drafted',draftReceipt(c,i,x),x)),
  receiveReceipt:(a,s,t,id,i,k)=>mutate(a,s,t,'receipt.receive',k,{id,i},async(c,x)=>{if(i.receivedConfirmed!==true)throw new DomainError('VALIDATION_ERROR',400);const r=await receiveReceipt(c,id,k,x);await appendInventoryAudit(c,{action:'inventory.receipt.received',entityId:id},x);return r;}),
  issue:(a,s,t,i,k)=>mutate(a,s,t,'issue',k,i,async(c,x)=>{const r=await issueStock(c,i,k,x);await appendInventoryAudit(c,{action:'inventory.issue.posted',entityId:r.movementId},x);return r;}),
  reverseIssue:(a,s,t,id,i,k)=>mutate(a,s,t,'issue.reverse',k,{id,i},async(c,x)=>{
   const m=await getMovement(c,id,x);if(m.kind!=='ISSUE')throw new DomainError('REVERSAL_REQUIRES_REVALUATION',409);
   await catalog.requireIngredient(c,m.ingredientId,x);const b=await lockBalance(c,m.ingredientId,x);await assertReversible(c,m,b,x);
   const rid=await reversalHeader(c,{movementId:id},i,x),r=await compensate(c,m,b,rid,i.reason,k,x);await appendInventoryAudit(c,{action:'inventory.reversal.posted',entityId:rid},x);return r;
  }),
  reverseReceipt:(a,s,t,id,i,k)=>mutate(a,s,t,'receipt.reverse',k,{id,i},async(c,x)=>{
   const h=await purchases.getReceipt(c,id,x,true);if(h.status==='reversed')throw new DomainError('REVERSAL_ALREADY_APPLIED',409);if(h.status!=='received')throw new DomainError('RESOURCE_CONFLICT',409);
   await catalog.requireSupplier(c,h.supplierId,x);
   for(const item of h.items)await catalog.requireIngredient(c,item.ingredientId,x);
   const origins=[];
   for(const item of h.items){const b=await lockBalance(c,item.ingredientId,x);const row=(await x.query('select id from core.stock_movements where organization_id=$1 and restaurant_id=$2 and receipt_item_id=$3',[c.organizationId,c.restaurantId,item.id])).rows[0]!;const m=await getMovement(c,row.id as string,x);await assertReversible(c,m,b,x);origins.push({m,b});}
   const rid=await reversalHeader(c,{receiptId:id},i,x),movements:MovementResult[]=[];
   for(const {m,b} of origins)movements.push(await compensate(c,m,b,rid,i.reason,k,x));
   await appendInventoryAudit(c,{action:'inventory.reversal.posted',entityId:rid},x);return {reversalId:rid,movements};
  }),
  listIngredients:(a,s,t,q)=>tx(a,s,t,(c,x)=>catalog.listIngredients(c,q,x)),
  listSuppliers:(a,s,t,q)=>tx(a,s,t,(c,x)=>catalog.listSuppliers(c,q,x)),
  listConversions:(a,s,t,id)=>tx(a,s,t,(c,x)=>catalog.listConversions(c,id,x)),
  getReceipt:(a,s,t,id)=>tx(a,s,t,(c,x)=>purchases.getReceipt(c,id,x)),
  listReceipts:(a,s,t,q)=>tx(a,s,t,(c,x)=>purchases.listReceipts(c,q,x)),
  listBalances:(a,s,t,q)=>tx(a,s,t,(c,x)=>reads.listBalances(c,q,x)),
  listMovements:(a,s,t,id,q)=>tx(a,s,t,(c,x)=>reads.listMovements(c,id,q,x)),
  listPriceHistory:(a,s,t,id,q)=>tx(a,s,t,(c,x)=>reads.listPriceHistory(c,id,q,x)),
 };return service;
}
