import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T05: concurrent receipt retry returns identical result; altered key/body and unit cannot leak',async()=>{
 const f=await createInventoryFixtures(),other=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier(),draft=await o.draft(i.id,supplier.id),key=randomUUID();
  const [a,b]=await Promise.all([s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},key),s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},key)]);expect(a).toEqual(b);
  expect(await s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},key)).toEqual(a);
  await expect(s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},randomUUID())).rejects.toMatchObject({code:'RESOURCE_CONFLICT'});
  await expect(s.receiveReceipt(other.actor,other.selection,other.token,draft.id,{receivedConfirmed:true},key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect((await s.listMovements(...o.a,i.id,{locationId:o.locationId})).items).toHaveLength(1);
 }finally{await f.close();await other.close();}
},120000);
