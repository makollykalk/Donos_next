import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('T04: five fractional movements reconcile exactly and SQL half-even is independent oracle',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient(),supplier=await o.supplier();
  const first=await o.receive(i.id,supplier.id,'0.3','1.1');expect(first.movements[0]?.balance).toMatchObject({quantity:'0.3',value:'0.33'});
  expect((await o.issue(i.id,'0.1')).balance).toMatchObject({quantity:'0.2',value:'0.22'});
  expect((await o.receive(i.id,supplier.id,'0.2','1.3')).movements[0]?.balance).toMatchObject({quantity:'0.4',value:'0.48'});
  expect((await o.issue(i.id,'0.15')).balance).toMatchObject({quantity:'0.25',value:'0.3'});
  expect((await o.receive(i.id,supplier.id,'0.05','1.7')).movements[0]?.balance).toMatchObject({quantity:'0.3',value:'0.385',averageCostRatio:{numerator:'0.385',denominator:'0.3'}});
  await f.run(async(_c,t)=>{
   const r=(await t.query(`select sum(quantity_delta)::text as q,sum(value_delta)::text as v,bool_and(core.inventory_valid_state(after_quantity,after_value,after_reference_quantity,after_reference_value,after_issued_quantity)) as valid from core.stock_movements where ingredient_id=$1`,[i.id])).rows[0]!;
   expect(r.valid).toBe(true);expect(r.q.replace(/0+$/u,'')).toBe('0.3');expect(r.v.replace(/0+$/u,'')).toBe('0.385');
   expect((await t.query('select core.inventory_half_even(5,2)::text a,core.inventory_half_even(7,2)::text b,core.inventory_half_even(-5,2)::text c')).rows[0]).toEqual({a:'2',b:'4',c:'-2'});
  });
 }finally{await f.close();}
},120000);
