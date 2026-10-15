import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures,inventoryOrganizations } from '../helpers/inventory-fixtures.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('real runtime A/B and A/C/A1/A2 isolate local stock and share only organization suppliers',async()=>{
 const a=await createInventoryFixtures(),a2=await createInventoryFixtures(),c=await createInventoryFixtures('a',inventoryOrganizations.c),b=await createInventoryFixtures('b');
 try{
  const s=createInventoryService(a.db),args=[a.actor,a.selection,a.token] as const;
  const supplier=await s.createSupplier(...args,{name:'only organization A'},randomUUID());
  const ingredient=await s.createIngredient(...args,{name:'only unit A1',baseUnit:'kg',allowFractionalCount:false},randomUUID());
  const conversion=await s.createConversion(...args,ingredient.id,{label:'caixa privada',factorToBase:'5'},randomUUID());
  expect((await s.listSuppliers(a2.actor,a2.selection,a2.token,{})).items.map(x=>x.id)).toContain(supplier.id);
  for(const f of [a2,c,b]){
   expect((await s.listIngredients(f.actor,f.selection,f.token,{})).items).toHaveLength(0);
   await expect(s.patchIngredient(f.actor,f.selection,f.token,ingredient.id,{name:'forged'},randomUUID())).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
   await expect(s.createReceipt(f.actor,f.selection,f.token,{supplierId:supplier.id,items:[{ingredientId:ingredient.id,quantity:'1',unit:{kind:'package',conversionId:conversion.id},unitPrice:'20'}]},randomUUID())).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
   expect((await f.run((_c,t)=>t.query('select id from core.ingredients where id=$1',[ingredient.id]))).rowCount).toBe(0);
  }
  for(const f of [c,b])expect((await s.listSuppliers(f.actor,f.selection,f.token,{})).items.map(x=>x.id)).not.toContain(supplier.id);
  await expect(a2.run((ctx,t)=>t.query('insert into core.stock_balances(organization_id,restaurant_id,ingredient_id) values($1,$2,$3)',[ctx.organizationId,ctx.restaurantId,ingredient.id]))).rejects.toMatchObject({code:'23503'});
  await expect(a.run((_c,t)=>t.query("insert into core.ingredients(organization_id,restaurant_id,name,base_unit) values($1,$2,'forged','kg')",[b.selection.organizationId,b.selection.restaurantId]))).rejects.toMatchObject({code:'42501'});
  expect(a.jwt).not.toBe(b.jwt);
 }finally{await Promise.all([a.close(),a2.close(),b.close(),c.close()]);}
},120000);
