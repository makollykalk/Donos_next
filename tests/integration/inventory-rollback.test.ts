import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('two-item receive rolls back every persistence phase and releases idempotency key',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),j=await o.ingredient('outro'),supplier=await o.supplier();
  const draft=await s.createReceipt(...o.a,{supplierId:supplier.id,items:[i,j].map(x=>({ingredientId:x.id,quantity:'2',unit:{kind:'standard' as const,code:'kg' as const},unitPrice:'10'}))},randomUUID()),key=randomUUID();
  for(const phase of ['insert into core.stock_movements','update core.stock_balances','insert into core.purchase_price_history','update core.purchase_receipts','insert into core.audit_events','update core.idempotency_records']){
   const db={...f.db,withRestaurantTx:((actor,sel,token,fn)=>f.db.withRestaurantTx(actor,sel,token,async(c,t)=>fn(c,{query:(async(text:string,values?:readonly unknown[])=>{const r=await t.query(text,values);if(text.startsWith(phase))throw new Error('injected persistence failure');return r;}) as typeof t.query}))) as typeof f.db.withRestaurantTx};
   await expect(createInventoryService(db).receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},key)).rejects.toThrow('injected persistence failure');
   expect((await s.getReceipt(...o.a,draft.id)).status).toBe('draft');
   await f.run(async(_c,t)=>{expect((await t.query('select * from core.stock_movements')).rowCount).toBe(0);expect((await t.query('select * from core.purchase_price_history')).rowCount).toBe(0);expect((await t.query('select * from core.stock_balances where quantity<>0 or value<>0')).rowCount).toBe(0);expect((await t.query('select * from core.idempotency_records where key=$1',[key])).rowCount).toBe(0);expect((await t.query("select * from core.audit_events where restaurant_id=$1 and action='inventory.receipt.received'",[f.selection.restaurantId])).rowCount).toBe(0);});
  }
  expect((await s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},key)).movements).toHaveLength(2);
 }finally{await f.close();}
},240000);
it('deferred COMMIT failure rolls back ledger, status and response atomically',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier(),d=await o.draft(i.id,supplier.id),key=randomUUID();
  const db={...f.db,withRestaurantTx:((actor,sel,token,fn)=>f.db.withRestaurantTx(actor,sel,token,async(c,t)=>fn(c,{query:(async(text:string,values?:readonly unknown[])=>{const r=await t.query(text,values);if(text.startsWith('update core.idempotency_records'))await t.query('update core.stock_balances set quantity=quantity+1,reference_quantity=reference_quantity+1 where ingredient_id=$1',[i.id]);return r;}) as typeof t.query}))) as typeof f.db.withRestaurantTx};
  await expect(createInventoryService(db).receiveReceipt(...o.a,d.id,{receivedConfirmed:true},key)).rejects.toMatchObject({code:'23514'});
  expect((await s.getReceipt(...o.a,d.id)).status).toBe('draft');expect((await s.listMovements(...o.a,i.id,{})).items).toHaveLength(0);
  expect((await s.listBalances(...o.a,{})).items[0]?.quantity).toBe('0');expect((await s.receiveReceipt(...o.a,d.id,{receivedConfirmed:true},key)).movements).toHaveLength(1);
 }finally{await f.close();}
},120000);
it('draft failure after header or first item creates no orphan receipt or key',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),j=await o.ingredient('segundo'),supplier=await o.supplier(),key=randomUUID();
  const input={supplierId:supplier.id,items:[i,j].map(v=>({ingredientId:v.id,quantity:'1',unit:{kind:'standard' as const,code:'kg' as const},unitPrice:'20'}))};
  for(const phase of ['insert into core.purchase_receipts(','insert into core.purchase_receipt_items(']){
   const db={...f.db,withRestaurantTx:((a,b,c,fn)=>f.db.withRestaurantTx(a,b,c,async(ctx,t)=>fn(ctx,{query:(async(text:string,values?:readonly unknown[])=>{const r=await t.query(text,values);if(text.startsWith(phase))throw new Error('draft injected');return r;}) as typeof t.query}))) as typeof f.db.withRestaurantTx};
   await expect(createInventoryService(db).createReceipt(...o.a,input,key)).rejects.toThrow('draft injected');
   expect((await s.listReceipts(...o.a,{})).items).toHaveLength(0);
  }
  expect((await s.createReceipt(...o.a,input,key)).items).toHaveLength(2);
 }finally{await f.close();}
},120000);
