import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
it('COMMIT rejects standalone nonzero projection and rolls it back',async()=>{
 const f=await createInventoryFixtures();
 try {
  const id=await f.run(async(ctx,tx)=>{
   const row=(await tx.query("insert into core.ingredients(organization_id,restaurant_id,name,base_unit) values($1,$2,'integrity probe','kg') returning id",[ctx.organizationId,ctx.restaurantId])).rows[0]!;
   await tx.query('insert into core.stock_balances(organization_id,restaurant_id,ingredient_id) values($1,$2,$3)',[ctx.organizationId,ctx.restaurantId,row.id]);return row.id as string;
  });
  await expect(f.run(async(_ctx,tx)=>{
   await tx.query('update core.stock_balances set quantity=1,value=1,reference_quantity=1,reference_value=1 where ingredient_id=$1',[id]);
  })).rejects.toMatchObject({code:'23514'});
  expect((await f.run((_ctx,tx)=>tx.query('select quantity::text from core.stock_balances where ingredient_id=$1',[id]))).rows[0]?.quantity).toBe('0');
  for(const table of ['stock_movements','purchase_price_history','stock_reversals','purchase_receipt_items','ingredient_conversions']) {
   for(const command of [`delete from core.${table}`,`truncate core.${table}`,`update core.${table} set id=id`]) await expect(f.run((_ctx,tx)=>tx.query(command))).rejects.toMatchObject({code:'42501'});
  }
 } finally {await f.close();}
});
