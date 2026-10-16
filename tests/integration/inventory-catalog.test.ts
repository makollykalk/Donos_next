import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
it('catalog has immutable base, zero initial stock and serialized conversion versions',async()=>{
 const f=await createInventoryFixtures();try{
  const s=createInventoryService(f.db),o=inventoryOperations(s,f),i=await o.ingredient();
  expect((await s.listBalances(...o.a,{locationId:o.locationId})).items[0]).toMatchObject({quantity:'0',value:'0',sequence:'0'});
  expect((await s.listMovements(...o.a,i.id,{locationId:o.locationId})).items).toHaveLength(0);
  const versions=await Promise.all([s.createConversion(...o.a,i.id,{label:'caixa',factorToBase:'5'},randomUUID()),s.createConversion(...o.a,i.id,{label:'caixa',factorToBase:'4'},randomUUID())]);
  expect(versions.map(v=>v.version).sort()).toEqual(['1','2']);
  await s.patchIngredient(...o.a,i.id,{archived:true},randomUUID());
  expect((await s.listIngredients(...o.a,{})).items).toHaveLength(0);
  expect((await s.listIngredients(...o.a,{includeArchived:true})).items[0]?.archived).toBe(true);
  await s.patchIngredient(...o.a,i.id,{name:'renomeado',archived:false},randomUUID());
  await expect(f.run((_c,t)=>t.query("update core.ingredients set base_unit='L' where id=$1",[i.id]))).rejects.toMatchObject({code:'42501'});
 }finally{await f.close();}
},120000);
