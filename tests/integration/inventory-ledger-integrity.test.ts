import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { issueStock } from '@donos/domain-inventory';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('ledger without projection fails COMMIT; multiple coherent movements in one Tx pass final-state guard',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();await o.receive(i.id,supplier.id);
  await expect(f.run(async(ctx,t)=>{
   await t.query(`insert into core.stock_movements(organization_id,restaurant_id,ingredient_id,sequence,kind,quantity_delta,value_delta,before_quantity,before_value,before_reference_quantity,before_reference_value,before_issued_quantity,after_quantity,after_value,after_reference_quantity,after_reference_value,after_issued_quantity,reason,actor_user_id,command_key)
    select organization_id,restaurant_id,ingredient_id,sequence+1,'ISSUE',-1,-20,quantity,value,reference_quantity,reference_value,issued_quantity,quantity-1,value-20,reference_quantity,reference_value,issued_quantity+1,'ledger without projection',$2,$3 from core.stock_balances where ingredient_id=$1`,[i.id,ctx.actor.userId,randomUUID()]);
  })).rejects.toMatchObject({code:'23514'});
  expect((await s.listMovements(...o.a,i.id,{})).items).toHaveLength(1);
  await f.run(async(ctx,t)=>{
   for(let n=0;n<2;n++)await issueStock(ctx,{ingredientId:i.id,quantity:'1',unit:{kind:'standard',code:'kg'},reason:'same transaction'},randomUUID(),t);
  });
  expect((await s.listBalances(...o.a,{})).items[0]).toMatchObject({quantity:'8',value:'160',sequence:'3'});
 }finally{await f.close();}
},120000);
