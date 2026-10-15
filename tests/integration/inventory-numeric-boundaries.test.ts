import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('zero cost is explicit; positive underflow is rejected without a draft; fractional count is opt-in',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();
  await expect(o.draft(i.id,supplier.id,'0.000001','0.000000000001')).rejects.toMatchObject({code:'VALUATION_UNDERFLOW'});
  expect((await s.listReceipts(...o.a,{})).items).toHaveLength(0);
  const free=await s.createReceipt(...o.a,{supplierId:supplier.id,items:[{ingredientId:i.id,quantity:'2',unit:{kind:'standard',code:'kg'},unitPrice:'0',zeroCostReason:'Amostra gratuita'}]},randomUUID());
  await s.receiveReceipt(...o.a,free.id,{receivedConfirmed:true},randomUUID());expect((await o.issue(i.id,'1')).balance).toMatchObject({quantity:'1',value:'0'});
  const un=await o.ingredient('unidade','un');
  await expect(s.createReceipt(...o.a,{supplierId:supplier.id,items:[{ingredientId:un.id,quantity:'0.5',unit:{kind:'standard',code:'un'},unitPrice:'2'}]},randomUUID())).rejects.toMatchObject({code:'QUANTITY_PRECISION'});
  const fraction=await o.ingredient('unidade fracionável','un',true);
  const d=await s.createReceipt(...o.a,{supplierId:supplier.id,items:[{ingredientId:fraction.id,quantity:'0.5',unit:{kind:'standard',code:'un'},unitPrice:'2'}]},randomUUID());
  expect((await s.receiveReceipt(...o.a,d.id,{receivedConfirmed:true},randomUUID())).movements[0]?.balance).toMatchObject({quantity:'0.5',value:'1'});
 }finally{await f.close();}
},120000);
it('unit total remains exact even beyond the individual value envelope',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),j=await o.ingredient('segundo'),supplier=await o.supplier();
  const d=await s.createReceipt(...o.a,{supplierId:supplier.id,items:[i,j].map(x=>({ingredientId:x.id,quantity:'100000000',unit:{kind:'standard' as const,code:'kg' as const},unitPrice:'500000000000000000'}))},randomUUID());
  await s.receiveReceipt(...o.a,d.id,{receivedConfirmed:true},randomUUID());
  expect((await s.listBalances(...o.a,{})).totalValue).toBe('100000000000000000000000000');
 }finally{await f.close();}
},120000);
