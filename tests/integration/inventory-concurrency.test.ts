import { expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T06: independent runtime connections cannot issue6+6 from10; no negative or orphan',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();await o.receive(i.id,supplier.id);
  let arrivals=0;let release!:()=>void;const barrier=new Promise<void>(r=>{release=r;});
  const db={...f.db,withRestaurantTx:((actor,selection,token,fn)=>f.db.withRestaurantTx(actor,selection,token,async(c,t)=>fn(c,{query:async(text,values)=>{
   if(text.startsWith('select id,organization_id')&&text.includes('core.ingredients')&&text.includes('for update')){if(++arrivals===2)release();await barrier;}
   return t.query(text,values);
  }}))) as typeof f.db.withRestaurantTx};
  const concurrent=inventoryOperations(createInventoryService(db),f);
  const results=await Promise.allSettled([concurrent.issue(i.id,'6'),concurrent.issue(i.id,'6')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'INSUFFICIENT_STOCK'}});
  expect((await s.listBalances(...o.a,{})).items[0]).toMatchObject({quantity:'4',value:'80',sequence:'2'});
  expect((await s.listMovements(...o.a,i.id,{})).items).toHaveLength(2);
 }finally{await f.close();}
},120000);
it('two first multi-item receipts with reverse input order preserve both values without deadlock',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),j=await o.ingredient('segundo'),p=await o.supplier(),q=await o.supplier();
  const draft=(supplierId:string,ids:string[],quantity:string)=>s.createReceipt(...o.a,{supplierId,items:ids.map(ingredientId=>({ingredientId,quantity,unit:{kind:'standard' as const,code:'kg' as const},unitPrice:'2'}))},randomUUID());
  const d1=await draft(p.id,[i.id,j.id],'3'),d2=await draft(q.id,[j.id,i.id],'4');
  let arrivals=0;let release!:()=>void;const barrier=new Promise<void>(r=>{release=r;});
  const db={...f.db,withRestaurantTx:((a,b,c,fn)=>f.db.withRestaurantTx(a,b,c,async(ctx,t)=>fn(ctx,{query:async(text,values)=>{if(text.startsWith('select id,organization_id')&&text.includes('core.ingredients')&&text.includes('for update')){if(++arrivals===2)release();await barrier;}return t.query(text,values);}}))) as typeof f.db.withRestaurantTx};
  const concurrent=createInventoryService(db);
  await Promise.all([concurrent.receiveReceipt(...o.a,d1.id,{receivedConfirmed:true},randomUUID()),concurrent.receiveReceipt(...o.a,d2.id,{receivedConfirmed:true},randomUUID())]);
  expect((await s.listBalances(...o.a,{})).items).toEqual(expect.arrayContaining([expect.objectContaining({ingredientId:i.id,quantity:'7',value:'14',sequence:'2'}),expect.objectContaining({ingredientId:j.id,quantity:'7',value:'14',sequence:'2'})]));
 }finally{await f.close();}
},120000);
