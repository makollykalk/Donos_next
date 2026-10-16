import type { CreateReceiptInput,ReceiptPosted } from '@donos/contracts';
import type { RestaurantContext,Tx } from '@donos/db';
import { inventoryCatalog as catalog,stockLocations,purchaseRepository as repo,lockBalance,postMovement,DomainError } from '@donos/db';
import { normalizeQuantity,calculateAcquisitionValue,calculateReceipt } from '@donos/domain-inventory';
export async function draftReceipt(ctx:RestaurantContext,input:CreateReceiptInput,tx:Tx){
 await stockLocations.requireStockLocation(ctx,input.locationId,tx);
 const supplier=await catalog.requireSupplier(ctx,input.supplierId,tx,true),items=[];
 for(const line of [...input.items].sort((a,b)=>a.ingredientId.localeCompare(b.ingredientId))){
  const ingredient=await catalog.requireIngredient(ctx,line.ingredientId,tx,true),conversion=await catalog.resolveConversion(ctx,ingredient,line.unit,tx);
  items.push({input:line,ingredientName:ingredient.name,conversion,baseQuantity:normalizeQuantity(line.quantity,line.unit,conversion),lineValue:calculateAcquisitionValue(line.quantity,line.unitPrice)});
 }
 return repo.insertDraft(ctx,input,supplier.name,items,tx);
}
export async function receiveReceipt(ctx:RestaurantContext,id:string,key:string,tx:Tx):Promise<ReceiptPosted>{
 const h=await repo.getReceipt(ctx,id,tx,true);if(h.status!=='draft')throw new DomainError('RESOURCE_CONFLICT',409);
 await catalog.requireSupplier(ctx,h.supplierId,tx,true);
 for(const item of h.items)await catalog.requireIngredient(ctx,item.ingredientId,tx,true);
 const balances=new Map();for(const item of h.items)balances.set(item.ingredientId,await lockBalance(ctx,item.ingredientId,h.locationId,tx));
 const movements=[];
 for(const item of h.items){
  const calculation=calculateReceipt(balances.get(item.ingredientId)!,item.baseQuantity,item.lineValue);
  const movement=await postMovement(ctx,item.ingredientId,h.locationId,calculation,{kind:'RECEIPT',receiptItemId:item.id,key,reason:'Compra recebida e conferida'},tx);
  movements.push(movement);await repo.insertPriceHistory(ctx,item.id,movement.movementId,tx);
 }
 await repo.markReceived(ctx,id,tx);return {receiptId:id,status:'received',movements};
}
