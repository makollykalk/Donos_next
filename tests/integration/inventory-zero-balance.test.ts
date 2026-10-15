import { expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T08: full issue zeroes references and next receipt starts new cost epoch',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();await o.receive(i.id,supplier.id);
  expect((await o.issue(i.id,'10')).balance).toMatchObject({quantity:'0',value:'0',referenceQuantity:'0',referenceValue:'0',issuedQuantity:'0',averageCostRatio:null});
  const next=await o.receive(i.id,supplier.id,'3','7');expect(next.movements[0]?.balance).toMatchObject({quantity:'3',value:'21',referenceQuantity:'3',referenceValue:'21'});
  expect((await s.listPriceHistory(...o.a,i.id,{})).items).toHaveLength(2);
  await s.patchIngredient(...o.a,i.id,{archived:true},randomUUID());
  expect(await s.listBalances(...o.a,{})).toEqual({items:[],totalValue:'21',nextCursor:null});
  expect((await s.listBalances(...o.a,{includeArchived:true})).items[0]?.value).toBe('21');
 }finally{await f.close();}
},120000);
