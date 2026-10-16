import type { CreateReceiptInput,ReceiptPosted,ConversionSnapshot } from '@donos/contracts';
import type { RestaurantContext,Tx } from '@donos/db';
import { inventoryCatalog as catalog,stockLocations,purchaseRepository as repo,lockBalance,postMovement,DomainError } from '@donos/db';
import { normalizeQuantity,calculateAcquisitionValue,calculateReceipt } from '@donos/domain-inventory';
export async function draftReceipt(ctx:RestaurantContext,input:CreateReceiptInput,tx:Tx){
 await stockLocations.requireStockLocation(ctx,input.locationId,tx);
 const supplier=await catalog.requireSupplier(ctx,input.supplierId,tx,true),items=[];
 for(const line of [...input.items].sort((a,b)=>a.ingredientId.localeCompare(b.ingredientId))){
  const ingredient=await catalog.requireIngredient(ctx,line.ingredientId,tx,true);
  let conversion:ConversionSnapshot;
  if(line.commitmentId){
   const commitment=(await tx.query<{status:string;supplier_id:string|null;base_unit:string;original_unit:string;conversion_id:string|null;conversion_label:string|null;conversion_version:string|null;factor_to_base:string;allow_fractional_count:boolean}>('select status,supplier_id,base_unit,original_unit,conversion_id,conversion_label,conversion_version::text,factor_to_base::text,allow_fractional_count from core.shopping_commitments where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=$4 and id=$5 for update',[ctx.organizationId,ctx.restaurantId,input.locationId,line.ingredientId,line.commitmentId])).rows[0];
   if(!commitment||commitment.status!=='confirmed'||commitment.supplier_id!==input.supplierId||commitment.base_unit!==ingredient.baseUnit||commitment.original_unit!==(line.unit.kind==='standard'?line.unit.code:'package')||(line.unit.kind==='package'&&commitment.conversion_id!==line.unit.conversionId)||commitment.allow_fractional_count!==ingredient.allowFractionalCount)throw new DomainError('RESOURCE_CONFLICT',409);
   // The commitment freezes the conversion used when the owner confirmed it.
   // A later catalog version must not make that already-confirmed purchase impossible to receive.
   conversion={ingredientId:ingredient.id,baseUnit:ingredient.baseUnit,allowFractionalCount:commitment.allow_fractional_count,inputUnit:line.unit,factorToBase:commitment.factor_to_base,conversionId:commitment.conversion_id,version:commitment.conversion_version,label:commitment.conversion_label};
  }else conversion=await catalog.resolveConversion(ctx,ingredient,line.unit,tx);
  items.push({input:line,ingredientName:ingredient.name,conversion,baseQuantity:normalizeQuantity(line.quantity,line.unit,conversion),lineValue:calculateAcquisitionValue(line.quantity,line.unitPrice)});
 }
 return repo.insertDraft(ctx,input,supplier.name,items,tx);
}
export async function receiveReceipt(ctx:RestaurantContext,id:string,key:string,tx:Tx):Promise<ReceiptPosted>{
 const h=await repo.getReceipt(ctx,id,tx,true);if(h.status!=='draft')throw new DomainError('RESOURCE_CONFLICT',409);
 await catalog.requireSupplier(ctx,h.supplierId,tx,true);
 for(const item of h.items)await catalog.requireIngredient(ctx,item.ingredientId,tx,true);
 const commitments=new Set<string>();
 for(const item of h.items){if(!item.commitmentId)continue;const row=(await tx.query<{status:string;supplier_id:string|null}>('select status,supplier_id from core.shopping_commitments where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=$4 and id=$5 for update',[ctx.organizationId,ctx.restaurantId,h.locationId,item.ingredientId,item.commitmentId])).rows[0];if(!row||row.status!=='confirmed'||row.supplier_id!==h.supplierId)throw new DomainError('RESOURCE_CONFLICT',409);commitments.add(item.id);}
 const balances=new Map();for(const item of h.items)balances.set(item.ingredientId,await lockBalance(ctx,item.ingredientId,h.locationId,tx));
 const movements=[];
 for(const item of h.items){
  const calculation=calculateReceipt(balances.get(item.ingredientId)!,item.baseQuantity,item.lineValue);
  const movement=await postMovement(ctx,item.ingredientId,h.locationId,calculation,{kind:'RECEIPT',receiptItemId:item.id,key,reason:'Compra recebida e conferida'},tx);
  movements.push(movement);await repo.insertPriceHistory(ctx,item.id,movement.movementId,tx);
  if(item.commitmentId&&commitments.has(item.id)){const updated=await tx.query("update core.shopping_commitments set received_base_quantity=received_base_quantity+$6,remaining_base_quantity=remaining_base_quantity-$6,status=case when remaining_base_quantity=$6 then 'fulfilled' else 'confirmed' end where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=$4 and id=$5 and status='confirmed' and remaining_base_quantity>=$6",[ctx.organizationId,ctx.restaurantId,h.locationId,item.ingredientId,item.commitmentId,item.baseQuantity]);if(updated.rowCount!==1)throw new DomainError('RESOURCE_CONFLICT',409);}
 }
 await repo.markReceived(ctx,id,tx);return {receiptId:id,status:'received',movements};
}
