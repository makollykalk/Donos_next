import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('compensation restores full exhausted state with growing sequence; immutable origins and idempotence',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();const receipt=await o.receive(i.id,supplier.id);
  const issue=await o.issue(i.id,'10'),before=(await s.listMovements(...o.a,i.id,{})).items;
  const keys=[randomUUID(),randomUUID()] as const;
  const attempts=await Promise.allSettled(keys.map(key=>s.reverseIssue(...o.a,issue.movementId,{reason:'erro de lançamento'},key)));
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(attempts.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'REVERSAL_ALREADY_APPLIED'}});
  const success=attempts.find(r=>r.status==='fulfilled');if(!success||success.status!=='fulfilled')throw new Error('No compensation committed');
  const key=attempts[0]?.status==='fulfilled'?keys[0]:keys[1],rev=success.value;
  expect(rev.balance).toMatchObject({quantity:'10',value:'200',referenceQuantity:'10',referenceValue:'200',issuedQuantity:'0',sequence:'3'});
  expect(await s.reverseIssue(...o.a,issue.movementId,{reason:'erro de lançamento'},key)).toEqual(rev);
  await expect(s.reverseIssue(...o.a,issue.movementId,{reason:'de novo'},randomUUID())).rejects.toMatchObject({code:'REVERSAL_ALREADY_APPLIED'});
  await expect(s.reverseReceipt(...o.a,receipt.receiptId,{reason:'tarde'},randomUUID())).rejects.toMatchObject({code:'REVERSAL_REQUIRES_REVALUATION'});
  expect((await s.listMovements(...o.a,i.id,{})).items.slice(1)).toEqual(before);
  expect((await o.issue(i.id,'2')).balance).toMatchObject({quantity:'8',value:'160',sequence:'4'});
 }finally{await f.close();}
},120000);
it('whole multi-item receipt reversal is all-or-none and successful reversal leaves price history',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),j=await o.ingredient('outro'),supplier=await o.supplier();
  const draft=await s.createReceipt(...o.a,{supplierId:supplier.id,items:[i,j].map(x=>({ingredientId:x.id,quantity:'2',unit:{kind:'standard' as const,code:'kg' as const},unitPrice:'10'}))},randomUUID());
  await s.receiveReceipt(...o.a,draft.id,{receivedConfirmed:true},randomUUID());await o.issue(i.id,'1');
  await expect(s.reverseReceipt(...o.a,draft.id,{reason:'incompatível'},randomUUID())).rejects.toMatchObject({code:'REVERSAL_REQUIRES_REVALUATION'});
  expect((await s.listMovements(...o.a,j.id,{})).items).toHaveLength(1);
  const fresh=await o.receive(j.id,supplier.id,'1','9');const r=await s.reverseReceipt(...o.a,fresh.receiptId,{reason:'recebimento incorreto'},randomUUID());
  expect(r.movements[0]?.balance).toMatchObject({quantity:'2',value:'20'});
  expect((await s.getReceipt(...o.a,fresh.receiptId)).status).toBe('reversed');expect((await s.listPriceHistory(...o.a,j.id,{})).items[0]?.reversalId).toBe(r.reversalId);
 }finally{await f.close();}
},120000);
