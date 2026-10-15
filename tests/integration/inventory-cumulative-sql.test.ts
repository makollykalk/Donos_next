import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('SQL reconciles fragmented recurring average 1/3 through exact exhaustion',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();
  const conversion=await s.createConversion(...o.a,i.id,{label:'embalagem 3kg',factorToBase:'3'},randomUUID());
  const d=await s.createReceipt(...o.a,{supplierId:supplier.id,items:[{ingredientId:i.id,quantity:'1',unit:{kind:'package',conversionId:conversion.id},unitPrice:'1'}]},randomUUID());
  expect((await s.receiveReceipt(...o.a,d.id,{receivedConfirmed:true},randomUUID())).movements[0]?.balance.averageCostRatio).toEqual({numerator:'1',denominator:'3'});
  await o.issue(i.id,'1');await o.issue(i.id,'1');
  expect((await o.issue(i.id,'1')).balance).toMatchObject({quantity:'0',value:'0',referenceQuantity:'0',referenceValue:'0',issuedQuantity:'0',averageCostRatio:null});
  await f.run(async(_ctx,t)=>{
   const r=(await t.query('select sum(quantity_delta)=0 as quantity_zero,sum(value_delta)=0 as value_zero,array_agg(value_delta::text order by sequence) as deltas from core.stock_movements where ingredient_id=$1',[i.id])).rows[0]!;
   expect(r).toEqual({quantity_zero:true,value_zero:true,deltas:['1','-0.333333333333','-0.333333333334','-0.333333333333']});
  });
 }finally{await f.close();}
},120000);
