import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { createCore } from '@donos/domain-core';
import { fixtures as core } from '../helpers/fixtures.js';
it('Inventory API validates Auth, entitlement, strict input, real JWT A/B and forged IDs',async()=>{
 const f=await createInventoryFixtures(),b=await createInventoryFixtures('b');
 const app=buildApp({database:f.db,verifyActor:f.verify});
 try{
  const path=(org:string,unit:string)=>`/v1/organizations/${org}/restaurants/${unit}/inventory`;
  const base=path(f.selection.organizationId,f.selection.restaurantId),headers={authorization:`Bearer ${f.jwt}`,'x-donos-context':f.token,'idempotency-key':randomUUID()};
  const id=randomUUID();
  for(const [method,suffix] of [['GET','/ingredients'],['POST','/ingredients'],['PATCH',`/ingredients/${id}`],['GET',`/ingredients/${id}/conversions`],['POST',`/ingredients/${id}/conversions`],['GET','/suppliers'],['POST','/suppliers'],['PATCH',`/suppliers/${id}`],['GET','/receipts'],['GET',`/receipts/${id}`],['POST','/receipts'],['POST',`/receipts/${id}/receive`],['POST','/issues'],['POST',`/movements/${id}/reversal`],['POST',`/receipts/${id}/reversal`],['GET','/balances'],['GET',`/ingredients/${id}/movements`],['GET',`/ingredients/${id}/price-history`]] as const){expect((await app.inject({method,url:base+suffix})).statusCode).toBe(401);}
  expect((await app.inject({method:'POST',url:base+'/ingredients',headers,payload:{name:'teste',baseUnit:'kg',ownerId:f.actor.userId}})).statusCode).toBe(400);
  const created=await app.inject({method:'POST',url:base+'/ingredients',headers,payload:{name:'API arroz',baseUnit:'kg'}});expect(created.statusCode).toBe(201);
  const ingredient=created.json<{id:string}>();
  const foreign=await app.inject({method:'PATCH',url:path(b.selection.organizationId,b.selection.restaurantId)+`/ingredients/${ingredient.id}`,headers:{authorization:`Bearer ${b.jwt}`,'x-donos-context':b.token,'idempotency-key':randomUUID()},payload:{name:'forged'}});expect(foreign.statusCode).toBe(404);
  expect((await app.inject({method:'GET',url:base+'/balances',headers:{...headers,'x-donos-context':b.token}})).statusCode).toBe(409);
  const selection={organizationId:core.orgC,restaurantId:core.c1},selected=await createCore(f.db).selectContext(f.actor,selection);
  for(const suffix of ['/ingredients','/balances','/receipts','/suppliers'])expect((await app.inject({method:'GET',url:path(core.orgC,core.c1)+suffix,headers:{...headers,'x-donos-context':selected.token}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:base+'/ingredients',headers,payload:{name:'API arroz',baseUnit:'kg'}})).statusCode).toBe(201);
 }finally{await app.close();await f.close();await b.close();}
},120000);
