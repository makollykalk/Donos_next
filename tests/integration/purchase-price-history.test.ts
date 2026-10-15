import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('large value receipt and issue preserve twelve decimals through SQL guards and history',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();
  await o.receive(i.id,supplier.id,'1','123456789012345678.901234567891');
  expect((await s.listPriceHistory(...o.a,i.id,{})).items[0]?.lineValue).toBe('123456789012345678.901234567891');
  expect((await o.issue(i.id,'0.5')).balance.value).toBe('61728394506172839.450617283945');
 }finally{await f.close();}
},120000);
