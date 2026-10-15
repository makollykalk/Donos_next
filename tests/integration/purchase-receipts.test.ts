import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T09/T10: draft has no movement or prices; received history immutable after edits',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier(),draft=await o.draft(i.id,supplier.id);
  expect(draft.status).toBe('draft');expect((await s.listPriceHistory(...o.a,i.id,{})).items).toHaveLength(0);expect((await s.listMovements(...o.a,i.id,{})).items).toHaveLength(0);
  await expect(s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:false as true},randomUUID())).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},randomUUID());
  await s.patchSupplier(...o.a,supplier.id,{name:'nome novo'},randomUUID());
  await o.receive(i.id,supplier.id,'7','25');
  const prices=(await s.listPriceHistory(...o.a,i.id,{})).items;
  expect(prices.map(p=>p.unitPrice)).toEqual(['25','20']);expect(prices[1]?.supplierName).toBe(supplier.name);expect(prices[0]?.supplierName).toBe('nome novo');
  await expect(f.run((_c,t)=>t.query("update core.purchase_receipts set status='draft',received_by=null,received_at=null where id=$1",[draft.id]))).rejects.toMatchObject({code:'23514'});
 }finally{await f.close();}
},120000);
