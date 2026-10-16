import type { ContextSelection,ShoppingNeed,UpdateShoppingListItemInput } from '@donos/contracts';
import { DomainError,appendShoppingAudit,executeIdempotent,retryIdempotent,shoppingRepository as repo } from '@donos/db';
import type { Database,RestaurantContext,Tx,VerifiedActor } from '@donos/db';
import { requireEntitlement } from '@donos/domain-billing';
import { calculateReplenishment } from '@donos/domain-purchases';
import { normalizeQuantity } from '@donos/domain-inventory';
import type { ShoppingService } from './shopping-types.js';

const str=(v:unknown)=>String(v);
export function createShoppingService(db:Database):ShoppingService {
 async function access<T>(actor:VerifiedActor,selection:ContextSelection,token:string,premium:boolean,fn:(ctx:RestaurantContext,tx:Tx)=>Promise<T>):Promise<T>{
  try{return await retryIdempotent(()=>db.withRestaurantTx(actor,selection,token,async(ctx,tx)=>{await requireEntitlement(ctx,'inventory_core',tx);if(premium)await requireEntitlement(ctx,'shopping_premium',tx);return fn(ctx,tx);}));}
  catch(error){const code=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;if(code==='23503'||code==='P0002')throw new DomainError('RESOURCE_NOT_FOUND',404);if(code==='23505'||code==='40001'||code==='40P01')throw new DomainError('RESOURCE_CONFLICT',409);if(code==='23514')throw new DomainError('VALIDATION_ERROR',400);throw error;}
 }
 function mutate<T>(actor:VerifiedActor,selection:ContextSelection,token:string,premium:boolean,operation:string,key:string,input:unknown,fn:(ctx:RestaurantContext,tx:Tx)=>Promise<T>){
  return access(actor,selection,token,premium,(ctx,tx)=>executeIdempotent({kind:'organization',context:ctx},`shopping.${operation}`,key,{selection,input},tx,()=>fn(ctx,tx)));
 }
 const service:ShoppingService={
  setThreshold:(a,s,t,id,input,key)=>mutate(a,s,t,false,'threshold.update',key,{id,input},async(c,x)=>{const result=await repo.setThreshold(c,id,input,x);await appendShoppingAudit(c,{action:'shopping.threshold.updated',entityId:result.id},x);return result;}),
  listThresholds:(a,s,t,id)=>access(a,s,t,false,(c,x)=>repo.listThresholds(c,id,x)),
  generateList:(a,s,t,locationId,key)=>mutate(a,s,t,true,'list.generate',key,{locationId},async(c,x)=>{
   const snapshot=await repo.generationSnapshot(c,locationId,x),listId=await repo.insertShoppingList(c,locationId,snapshot.sequence,x);
   for(const r of snapshot.rows){
    const baseUnit=str(r.baseUnit) as 'kg'|'L'|'un',hasPackage=r.conversionId!==null&&r.conversionId!==undefined;
    const conversion={ingredientId:str(r.ingredientId),baseUnit,allowFractionalCount:Boolean(r.allowFractionalCount),inputUnit:hasPackage?{kind:'package' as const,conversionId:str(r.conversionId)}:{kind:'standard' as const,code:baseUnit},factorToBase:hasPackage?str(r.factorToBase):'1',conversionId:hasPackage?str(r.conversionId):null,version:hasPackage?str(r.conversionVersion):null,label:hasPackage?str(r.conversionLabel):null};
    const calc=calculateReplenishment({balanceQuantity:str(r.balanceQuantity),minimumQuantity:str(r.minimumQuantity),targetQuantity:str(r.targetQuantity),committedPendingQuantity:str(r.committedPendingQuantity),conversion});
    if(calc.suggestedPurchaseQuantity==='0')continue;
    const item={ingredientId:str(r.ingredientId),ingredientName:str(r.ingredientName),locationId,baseUnit,balanceQuantity:str(r.balanceQuantity),minimumQuantity:str(r.minimumQuantity),targetQuantity:str(r.targetQuantity),committedPendingQuantity:str(r.committedPendingQuantity),neededBaseQuantity:calc.neededBaseQuantity,suggestedBaseQuantity:calc.suggestedBaseQuantity,suggestedPurchaseQuantity:calc.suggestedPurchaseQuantity,conversion,critical:calc.critical,supplierSuggestion:r.supplierId?{supplierId:str(r.supplierId),name:str(r.supplierName),normalizedPrice:{numerator:str(r.lineValue),denominator:str(r.baseQuantity)},postedAt:new Date(r.postedAt as Date).toISOString(),documentDate:r.documentDate?String(r.documentDate).slice(0,10):null}:null} satisfies ShoppingNeed;
    await repo.insertShoppingItem(c,listId,{...item,originalUnit:hasPackage?'package':baseUnit,conversionId:conversion.conversionId,conversionLabel:conversion.label,conversionVersion:conversion.version,factorToBase:conversion.factorToBase,allowFractionalCount:conversion.allowFractionalCount,supplierId:item.supplierSuggestion?.supplierId??null,supplierName:item.supplierSuggestion?.name??null,lineValue:item.supplierSuggestion?.normalizedPrice.numerator??null,baseQuantity:item.supplierSuggestion?.normalizedPrice.denominator??null,postedAt:item.supplierSuggestion?.postedAt??null,documentDate:item.supplierSuggestion?.documentDate??null,ledgerSequence:snapshot.sequence},x);
   }
   const result=await repo.getShoppingList(c,listId,x);await appendShoppingAudit(c,{action:'shopping.list.generated',entityId:listId},x);return result;
  }),
  listLists:(a,s,t,q)=>access(a,s,t,false,(c,x)=>repo.listShoppingLists(c,q,x)),
  getList:(a,s,t,id)=>access(a,s,t,false,(c,x)=>repo.getShoppingList(c,id,x)),
  updateItem:(a,s,t,listId,itemId,input,key)=>mutate(a,s,t,true,'item.update',key,{listId,itemId,input},async(c,x)=>{const result=await repo.updateShoppingItem(c,listId,itemId,input,x);await appendShoppingAudit(c,{action:'shopping.item.updated',entityId:itemId},x);return result;}),
  confirmCommitment:(a,s,t,listId,itemId,input,key)=>mutate(a,s,t,true,'commitment.confirm',key,{listId,itemId,input},async(c,x)=>{const list=await repo.getShoppingList(c,listId,x),item=list.items.find(row=>row.id===itemId);if(!item)throw new DomainError('RESOURCE_NOT_FOUND',404);const committedBaseQuantity=normalizeQuantity(input.purchaseQuantity,item.needSnapshot.conversion.inputUnit,item.needSnapshot.conversion);const itemInput:UpdateShoppingListItemInput={purchaseQuantity:input.purchaseQuantity,...(input.supplierId!==undefined?{supplierId:input.supplierId}:{})};await repo.updateShoppingItem(c,listId,itemId,itemInput,x);const result=await repo.confirmShoppingCommitment(c,listId,itemId,input,committedBaseQuantity,x);await appendShoppingAudit(c,{action:'shopping.commitment.confirmed',entityId:result.id},x);return result;}),
  cancelCommitment:(a,s,t,id,input,key)=>mutate(a,s,t,true,'commitment.cancel',key,{id,input},async(c,x)=>{const result=await repo.cancelShoppingCommitment(c,id,input,x);await appendShoppingAudit(c,{action:'shopping.commitment.cancelled',entityId:result.id},x);return result;}),
  exportList:(a,s,t,id)=>access(a,s,t,true,async(c,x)=>{const list=await repo.getShoppingList(c,id,x);const quote=(value:string)=>{const safe=/^\s*[=+\-@]/.test(value)?`'${value}`:value;return `"${safe.replaceAll('"','""')}"`;};const rows=[['Ingrediente','Quantidade','Unidade','Fornecedor','Observação'],...list.items.filter(i=>!i.removed).map(i=>{const unit=i.needSnapshot.conversion.inputUnit;const label=unit.kind==='package'?`pacote (${i.needSnapshot.conversion.label??unit.conversionId})`:unit.code;return [i.needSnapshot.ingredientName,i.purchaseQuantity,label,i.supplierId??'',i.note??''];})];return rows.map(row=>row.map(value=>quote(String(value))).join(',')).join('\r\n');}),
 };
 return service;
}
