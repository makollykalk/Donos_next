import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createInventoryFixtures} from '../helpers/inventory-fixtures.js';
import {login} from './owner-fixture.js';
type Fixture=Awaited<ReturnType<typeof createInventoryFixtures>>;
async function select(page:Page,fixture:Fixture,first=false){
 const headers={Authorization:`Bearer ${fixture.jwt}`};
 if(first){await login(page,'a',5174);const response=await page.request.get('http://127.0.0.1:3001/v1/organizations',{headers});const data=await response.json() as {items:{id:string;name:string}[]};const org=data.items.find(i=>i.id===fixture.selection.organizationId)!;await page.getByRole('button',{name:org.name,exact:true}).click();}
 const response=await page.request.get(`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants`,{headers});const data=await response.json() as {items:{id:string;name:string}[]};const unit=data.items.find(i=>i.id===fixture.selection.restaurantId)!;
 const loaded=Promise.all(['ingredients','suppliers','receipts','balances'].map(resource=>page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith(`/restaurants/${fixture.selection.restaurantId}/inventory/${resource}`)).then(async result=>{expect(result.status()).toBe(200);await result.finished();})));
 await page.getByRole('button',{name:`Selecionar ${unit.name}`,exact:true}).click();await loaded;await expect(page.getByLabel('Nome do insumo',{exact:true})).toBeVisible();
}
test('timeout after committed catalog write retries the same key exactly once',async({page})=>{
 test.setTimeout(120000);const fixture=await createInventoryFixtures();try{await select(page,fixture,true);const keys:string[]=[];let count=0;
 await page.route('**/inventory/ingredients',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}keys.push(route.request().headers()['idempotency-key']??'');count++;if(count===1){const response=await route.fetch();expect(response.status()).toBe(201);await route.abort('timedout');}else await route.continue();});
 const name=`Retry UI ${randomUUID()}`;await page.getByLabel('Nome do insumo',{exact:true}).fill(name);await page.getByRole('button',{name:'Cadastrar insumo',exact:true}).click();await expect(page.getByRole('alert')).toContainText('indisponível');expect(count).toBe(1);await page.getByRole('button',{name:'Cadastrar insumo',exact:true}).click();await expect(page.getByRole('button',{name:`Arquivar ${name}`,exact:true})).toHaveCount(1);expect(keys).toHaveLength(2);expect(keys[0]).toBeTruthy();expect(keys[1]).toBe(keys[0]);
 }finally{await fixture.close();}
});
test('unit change discards old draft and delayed catalog response',async({page})=>{
 test.setTimeout(120000);const a=await createInventoryFixtures(),b=await createInventoryFixtures();try{await select(page,a,true);
 await page.getByLabel('Nome do insumo',{exact:true}).fill('Rascunho exclusivo A1');let release:()=>void=()=>{};let captured:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{captured=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});let delayed=false;
 await page.route(`**/restaurants/${a.selection.restaurantId}/inventory/ingredients?**`,async route=>{if(delayed){await route.continue();return;}delayed=true;const response=await route.fetch();captured();await gate;await route.fulfill({response});});
 await page.getByRole('button',{name:'Atualizar estoque',exact:true}).click();await waiting;await select(page,b);release();await expect(page.getByLabel('Nome do insumo',{exact:true})).toHaveValue('');await expect(page.getByRole('region',{name:'Operações de estoque',exact:true})).toHaveAttribute('data-restaurant-id',b.selection.restaurantId);await expect(page.getByText('Rascunho exclusivo A1',{exact:true})).toHaveCount(0);
 }finally{await a.close();await b.close();}
});
test('API entitlement and expired context errors never permit a stock write',async({page})=>{
 test.setTimeout(120000);const fixture=await createInventoryFixtures();try{await select(page,fixture,true);let writes=0;
 await page.route('**/inventory/**',async route=>{if(route.request().method()!=='GET')writes++;await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'ENTITLEMENT_REQUIRED'}})});});
 await page.getByRole('button',{name:'Atualizar estoque',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Acesso não concedido');await expect(page.getByRole('button',{name:'Cadastrar insumo',exact:true})).toHaveCount(0);expect(writes).toBe(0);
 await page.unroute('**/inventory/**');await page.route('**/inventory/**',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'CONTEXT_EXPIRED'}})}));await page.getByRole('button',{name:'Atualizar estoque',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Selecione novamente');expect(writes).toBe(0);
 }finally{await fixture.close();}
});
test('delayed receipt A cannot replace reviewed receipt B or reuse its confirmation',async({page})=>{
 test.setTimeout(120000);const fixture=await createInventoryFixtures();try{await select(page,fixture,true);
 const base=`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/inventory`,headers={Authorization:`Bearer ${fixture.jwt}`,'X-Donos-Context':fixture.token};
 async function post<T>(path:string,data:unknown){const response=await page.request.post(base+path,{headers:{...headers,'Idempotency-Key':randomUUID()},data});expect(response.status()).toBe(201);return await response.json() as T;}
 const ingredient=await post<{id:string}>('/ingredients',{name:`Race UI ${randomUUID()}`,baseUnit:'kg',allowFractionalCount:false}),supplier=await post<{id:string}>('/suppliers',{name:`Race supplier ${randomUUID()}`});
 const first=await post<{id:string}>('/receipts',{supplierId:supplier.id,documentReference:'Documento A',items:[{ingredientId:ingredient.id,quantity:'1',unit:{kind:'standard',code:'kg'},unitPrice:'10'}]}),second=await post<{id:string}>('/receipts',{supplierId:supplier.id,documentReference:'Documento B',items:[{ingredientId:ingredient.id,quantity:'2',unit:{kind:'standard',code:'kg'},unitPrice:'10'}]});
 await page.getByRole('button',{name:'Atualizar estoque',exact:true}).click();await expect(page.getByRole('button',{name:'Abrir recebimento Documento B',exact:true})).toBeVisible();
 let release:()=>void=()=>{},captured:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{captured=resolve;});await page.route(`**/inventory/receipts/${first.id}`,async route=>{const response=await route.fetch();captured();await gate;await route.fulfill({response});});
 await page.getByRole('button',{name:'Abrir recebimento Documento A',exact:true}).click();await waiting;await page.getByRole('button',{name:'Abrir recebimento Documento B',exact:true}).click();const article=page.getByRole('article',{name:'Revisão do recebimento'});await expect(article).toContainText('Documento: Documento B');await page.getByLabel('Conferi mercadoria, quantidades, unidades e custos efetivos',{exact:true}).check();
 const finished=page.waitForResponse(response=>response.url().endsWith(`/inventory/receipts/${first.id}`));release();await (await finished).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(article).toContainText('Documento: Documento B');await expect(article).not.toContainText('Documento: Documento A');
 const received=page.waitForRequest(request=>request.method()==='POST'&&request.url().endsWith(`/receipts/${second.id}/receive`));await page.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();await received;await expect(article).toHaveCount(0);
 const response=await page.request.get(base+`/receipts/${first.id}`,{headers});expect((await response.json() as {status:string}).status).toBe('draft');
 }finally{await fixture.close();}
});
test('late history page cannot overwrite a newly selected supplier filter',async({page})=>{
 test.setTimeout(120000);const fixture=await createInventoryFixtures();try{await select(page,fixture,true);
 const base=`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/inventory`,headers={Authorization:`Bearer ${fixture.jwt}`,'X-Donos-Context':fixture.token};
 async function post(path:string,data:unknown){const response=await page.request.post(base+path,{headers:{...headers,'Idempotency-Key':randomUUID()},data});expect(response.status()).toBe(201);return await response.json() as {id:string;name:string};}
 const ingredient=await post('/ingredients',{name:`History race ${randomUUID()}`,baseUnit:'kg',allowFractionalCount:false}),supplier=await post('/suppliers',{name:`Filtro B ${randomUUID()}`});await page.getByRole('button',{name:'Atualizar estoque',exact:true}).click();await expect(page.getByRole('button',{name:`Ver extrato e preços de ${ingredient.name}`,exact:true})).toBeVisible();
 const item=(name:string)=>({id:randomUUID(),supplierName:name,originalQuantity:'1',originalUnit:{kind:'standard',code:'kg'},unitPrice:'1',normalizedPrice:{numerator:'1',denominator:'1'},postedAt:'2026-10-15T12:00:00.000Z',reversalId:null});
 let release:()=>void=()=>{},captured:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{captured=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/ingredients/${ingredient.id}/price-history**`,async route=>{const url=new URL(route.request().url());if(url.searchParams.has('beforeSequence')){captured();await gate;await route.fulfill({json:{items:[item('Página antiga A')],highWatermark:'100',nextCursor:null}});}else if(url.searchParams.get('supplierId')===supplier.id)await route.fulfill({json:{items:[item(supplier.name)],highWatermark:'90',nextCursor:null}});else await route.fulfill({json:{items:[item('Primeira página A')],highWatermark:'100',nextCursor:'50'}});});
 await page.getByRole('button',{name:`Ver extrato e preços de ${ingredient.name}`,exact:true}).click();await page.getByRole('button',{name:'Mais preços',exact:true}).click();await waiting;await page.getByRole('combobox',{name:'Filtrar histórico por fornecedor',exact:true}).selectOption(supplier.id);const history=page.getByRole('region',{name:'Histórico de preços'});await expect(history).toContainText(supplier.name);const finished=page.waitForResponse(response=>response.url().includes('beforeSequence=50'));release();await (await finished).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(history).toContainText(supplier.name);await expect(history).not.toContainText('Página antiga A');await expect(history).not.toContainText('Primeira página A');
 }finally{await fixture.close();}
});
test('received purchase retry after committed response failure preserves key and one movement',async({page})=>{
 test.setTimeout(120000);const fixture=await createInventoryFixtures();try{await select(page,fixture,true);
 const base=`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/inventory`,headers={Authorization:`Bearer ${fixture.jwt}`,'X-Donos-Context':fixture.token};
 async function post(path:string,data:unknown){const response=await page.request.post(base+path,{headers:{...headers,'Idempotency-Key':randomUUID()},data});expect(response.status()).toBe(201);return await response.json() as {id:string;name:string};}
 const ingredient=await post('/ingredients',{name:`Receive retry ${randomUUID()}`,baseUnit:'kg',allowFractionalCount:false}),supplier=await post('/suppliers',{name:`Receive retry supplier ${randomUUID()}`});
 const receipt=await post('/receipts',{supplierId:supplier.id,documentReference:'Compra com resposta perdida',items:[{ingredientId:ingredient.id,quantity:'3',unit:{kind:'standard',code:'kg'},unitPrice:'7'}]});
 await page.getByRole('button',{name:'Atualizar estoque',exact:true}).click();await page.getByRole('button',{name:'Abrir recebimento Compra com resposta perdida',exact:true}).click();await page.getByLabel('Conferi mercadoria, quantidades, unidades e custos efetivos',{exact:true}).check();
 const keys:string[]=[],bodies:string[]=[];let writes=0;await page.route(`**/receipts/${receipt.id}/receive`,async route=>{writes++;keys.push(route.request().headers()['idempotency-key']??'');bodies.push(route.request().postData()??'');if(writes===1){const committed=await route.fetch();expect(committed.status()).toBe(201);await route.fulfill({status:503,json:{error:{code:'SERVICE_UNAVAILABLE'}}});}else await route.continue();});
 await page.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();await expect(page.getByRole('alert')).toContainText('indisponível');await expect(page.getByLabel('Conferi mercadoria, quantidades, unidades e custos efetivos',{exact:true})).toBeChecked();await page.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();await expect(page.getByRole('article',{name:'Revisão do recebimento'})).toHaveCount(0);
 expect(writes).toBe(2);expect(keys[0]).toBeTruthy();expect(keys[1]).toBe(keys[0]);expect(bodies[1]).toBe(bodies[0]);
 const movementsResponse=await page.request.get(base+`/ingredients/${ingredient.id}/movements`,{headers});expect(movementsResponse.status()).toBe(200);const movements=await movementsResponse.json() as {items:{kind:string;quantityDelta:string;valueDelta:string}[]};expect(movements.items).toEqual([expect.objectContaining({kind:'RECEIPT',quantityDelta:'3',valueDelta:'21'})]);
 const balancesResponse=await page.request.get(base+'/balances',{headers});expect(balancesResponse.status()).toBe(200);const balances=await balancesResponse.json() as {items:{ingredientId:string;quantity:string;value:string}[]};expect(balances.items).toEqual([expect.objectContaining({ingredientId:ingredient.id,quantity:'3',value:'21'})]);await expect(page.getByRole('region',{name:'Saldos de estoque'}).getByRole('row').filter({hasText:ingredient.name})).toContainText('3 kg');
 }finally{await fixture.close();}
});
