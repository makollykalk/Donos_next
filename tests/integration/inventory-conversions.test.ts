import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T07: package snapshot5 survives version4; incompatible dimension/precision creates no draft',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();
  const c1=await s.createConversion(...o.a,i.id,{label:'caixa',factorToBase:'5'},randomUUID());
  const input={supplierId:supplier.id,locationId:o.locationId,items:[{ingredientId:i.id,quantity:'2',unit:{kind:'package' as const,conversionId:c1.id},unitPrice:'100'}]};
  const draft=await s.createReceipt(...o.a,input,randomUUID());await s.createConversion(...o.a,i.id,{label:'caixa',factorToBase:'4'},randomUUID());
  await expect(s.createReceipt(...o.a,input,randomUUID())).rejects.toMatchObject({code:'RESOURCE_CONFLICT'});
  const posted=await s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},randomUUID());expect(posted.movements[0]?.balance).toMatchObject({quantity:'10',value:'200'});
  expect((await s.listPriceHistory(...o.a,i.id,{locationId:o.locationId})).items[0]?.conversion.factorToBase).toBe('5');
  await expect(s.issue(...o.a,{ingredientId:i.id,locationId:o.locationId,quantity:'1',unit:{kind:'standard',code:'L'},reason:'invalid'},randomUUID())).rejects.toMatchObject({code:'UNIT_INCOMPATIBLE'});
  await expect(s.issue(...o.a,{ingredientId:i.id,locationId:o.locationId,quantity:'0.000001',unit:{kind:'standard',code:'g'},reason:'invalid'},randomUUID())).rejects.toMatchObject({code:'QUANTITY_PRECISION'});
  const out=await s.issue(...o.a,{ingredientId:i.id,locationId:o.locationId,quantity:'2000',unit:{kind:'standard',code:'g'},reason:'uso'},randomUUID());expect(out.balance.quantity).toBe('8');
 }finally{await f.close();}
},120000);
