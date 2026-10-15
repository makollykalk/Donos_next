import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T03 real PostgreSQL: 10x20, issue2=-40, receive7x25 => Q15 V335 ratio335/15',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),a=[f.actor,f.selection,f.token] as const;
  const i=await s.createIngredient(...a,{name:'Arroz canônico',baseUnit:'kg',allowFractionalCount:false},randomUUID());
  const supplier=await s.createSupplier(...a,{name:'Fornecedor canônico'},randomUUID());
  async function receive(quantity:string,unitPrice:string){
   const draft=await s.createReceipt(...a,{supplierId:supplier.id,items:[{ingredientId:i.id,quantity,unit:{kind:'standard',code:'kg'},unitPrice}]},randomUUID());
   expect((await s.listBalances(...a,{})).items.find(x=>x.ingredientId===i.id)?.quantity).toBe(quantity==='10'?'0':'8');
   return s.receiveReceipt(...a,draft.id,{receivedConfirmed:true},randomUUID());
  }
  await receive('10','20');
  const issue=await s.issue(...a,{ingredientId:i.id,quantity:'2',unit:{kind:'standard',code:'kg'},reason:'consumo'},randomUUID());
  expect(issue.balance).toMatchObject({quantity:'8',value:'160',averageCostRatio:{numerator:'200',denominator:'10'}});
  await receive('7','25');
  const b=(await s.listBalances(...a,{})).items.find(x=>x.ingredientId===i.id)!;
  expect(b).toMatchObject({quantity:'15',value:'335',averageCostRatio:{numerator:'335',denominator:'15'}});
  await f.run(async(_ctx,tx)=>{
   const r=(await tx.query('select sum(quantity_delta)::text as q,sum(value_delta)::text as v from core.stock_movements where ingredient_id=$1',[i.id])).rows[0];
   expect(r).toEqual({q:'15',v:'335'});
   expect((await tx.query("select value_delta::text from core.stock_movements where ingredient_id=$1 and kind='ISSUE'",[i.id])).rows[0]?.value_delta).toBe('-40');
  });
 }finally{await f.close();}
});
