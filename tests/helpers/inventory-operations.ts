import { randomUUID } from 'node:crypto';
import type { InventoryService } from '../../apps/api/src/services/inventory-types.js';
import type { createInventoryFixtures } from './inventory-fixtures.js';
export function inventoryOperations(s:InventoryService,f:Awaited<ReturnType<typeof createInventoryFixtures>>){
 const a=[f.actor,f.selection,f.token] as const;
 const ingredient=(name='Arroz',baseUnit:'kg'|'L'|'un'='kg',allowFractionalCount=false)=>s.createIngredient(...a,{name,baseUnit,allowFractionalCount},randomUUID());
 const supplier=()=>s.createSupplier(...a,{name:`Fornecedor ${randomUUID()}`},randomUUID());
 async function draft(ingredientId:string,supplierId:string,quantity='10',unitPrice='20'){
  return s.createReceipt(...a,{supplierId,items:[{ingredientId,quantity,unit:{kind:'standard',code:'kg'},unitPrice}]},randomUUID());
 }
 async function receive(ingredientId:string,supplierId:string,quantity='10',unitPrice='20'){const d=await draft(ingredientId,supplierId,quantity,unitPrice);return s.receiveReceipt(...a,d.id,{receivedConfirmed:true},randomUUID());}
 const issue=(ingredientId:string,quantity:string,key=randomUUID())=>s.issue(...a,{ingredientId,quantity,unit:{kind:'standard',code:'kg'},reason:'Consumo sintético'},key);
 return {a,ingredient,supplier,draft,receive,issue};
}
