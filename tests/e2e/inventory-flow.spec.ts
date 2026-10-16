import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createInventoryFixtures} from '../helpers/inventory-fixtures.js';
import {login} from './owner-fixture.js';
test('owner operates canonical purchase issue purchase flow with real API balance',async({page})=>{
 test.setTimeout(180000);
 const fixture=await createInventoryFixtures();
 try{
  await openInventory(page,fixture);
  const name=`Arroz UI ${randomUUID()}`,supplier=`Fornecedor UI ${randomUUID()}`;
  await page.getByLabel('Nome do insumo',{exact:true}).fill(name);await page.getByRole('button',{name:'Cadastrar insumo',exact:true}).click();
  await expect(page.getByRole('button',{name:`Arquivar ${name}`,exact:true})).toBeVisible();
  const extra=`Sal UI ${randomUUID()}`;await page.getByLabel('Nome do insumo',{exact:true}).fill(extra);await page.getByRole('button',{name:'Cadastrar insumo',exact:true}).click();await expect(page.getByRole('button',{name:`Arquivar ${extra}`,exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Insumo do item 1',exact:true}).selectOption({label:name});await page.getByRole('combobox',{name:'Insumo da embalagem',exact:true}).selectOption({label:`${name} (kg)`});await page.getByLabel('Nome da embalagem',{exact:true}).fill('Saco UI');await page.getByLabel('Fator para a unidade-base',{exact:true}).fill('2,5');await page.getByRole('button',{name:'Salvar versão da embalagem',exact:true}).click();await expect(page.getByRole('combobox',{name:'Unidade do item 1',exact:true}).getByRole('option',{name:'Saco UI v1 (×2.5)',exact:true})).toHaveCount(1);
  await page.getByLabel('Nome do fornecedor',{exact:true}).fill(supplier);await page.getByRole('button',{name:'Cadastrar fornecedor',exact:true}).click();
  await expect(page.getByRole('button',{name:`Arquivar fornecedor ${supplier}`,exact:true})).toBeVisible();
  async function receive(quantity:string,price:string,reference:string,multiple=false){
   await page.getByRole('combobox',{name:'Fornecedor do recebimento',exact:true}).selectOption({label:supplier});await page.getByLabel('Referência do documento',{exact:true}).fill(reference);await page.getByRole('combobox',{name:'Insumo do item 1',exact:true}).selectOption({label:name});await page.getByLabel('Quantidade do item 1',{exact:true}).fill(quantity);await page.getByLabel('Preço por unidade do item 1',{exact:true}).fill(price);
   if(multiple){await page.getByRole('button',{name:'Adicionar item',exact:true}).click();await page.getByRole('combobox',{name:'Insumo do item 2',exact:true}).selectOption({label:extra});await page.getByLabel('Quantidade do item 2',{exact:true}).fill('1');await page.getByLabel('Preço por unidade do item 2',{exact:true}).fill('2');}
   await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await page.getByRole('button',{name:`Abrir recebimento ${reference}`,exact:true}).click();
   await expect(page.getByRole('button',{name:'Confirmar recebimento',exact:true})).toBeDisabled();await page.getByLabel('Conferi mercadoria, quantidades, unidades e custos efetivos',{exact:true}).check();await page.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();await expect(page.getByRole('article',{name:'Revisão do recebimento'})).toHaveCount(0);
  }
  const firstReference=`primeira-${randomUUID()}`,secondReference=`segunda-${randomUUID()}`;
  await receive('10','20',firstReference);
  await page.getByRole('combobox',{name:'Insumo da saída',exact:true}).selectOption({label:name});await page.getByLabel('Quantidade da saída',{exact:true}).fill('2');await page.getByLabel('Motivo da saída',{exact:true}).fill('Consumo sintético');await page.getByRole('button',{name:'Registrar saída',exact:true}).click();
  const row=page.getByRole('region',{name:'Saldos de estoque'}).getByRole('row').filter({hasText:name});await expect(row).toContainText('8 kg');await expect(row).toContainText('160');
  await receive('7','25',secondReference,true);await expect(row).toContainText('15 kg');await expect(row).toContainText('335/15');await expect(row).toContainText('22,33');
  const endpoint=`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants/${fixture.selection.restaurantId}/inventory`;
  const response=await page.request.get(endpoint+'/balances',{headers:{Authorization:`Bearer ${fixture.jwt}`,'X-Donos-Context':fixture.token}});expect(response.status()).toBe(200);const body=await response.json() as {items:{quantity:string;value:string;averageCostRatio:{numerator:string;denominator:string}}[]};expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({quantity:'15',value:'335',averageCostRatio:{numerator:'335',denominator:'15'}})]));
  await page.getByLabel('Quantidade da saída',{exact:true}).fill('16');await page.getByLabel('Motivo da saída',{exact:true}).fill('Saldo insuficiente sintético');await page.getByRole('button',{name:'Registrar saída',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Saldo insuficiente');await expect(row).toContainText('15 kg');
  await page.getByRole('button',{name:`Ver extrato e preços de ${name}`,exact:true}).click();await expect(page.getByRole('region',{name:'Extrato de movimentos'})).toContainText('Consumo sintético');await expect(page.getByRole('region',{name:'Histórico de preços'})).toContainText(supplier);
  await page.getByRole('button',{name:`Abrir recebimento ${firstReference}`,exact:true}).click();await page.getByLabel('Motivo do estorno do recebimento',{exact:true}).fill('Correção bloqueada por sucessor');await page.getByRole('button',{name:'Estornar recebimento inteiro',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'movimentos posteriores'})).toBeVisible();
  await page.getByRole('button',{name:`Abrir recebimento ${secondReference}`,exact:true}).click();await page.getByLabel('Motivo do estorno do recebimento',{exact:true}).fill('Correção sintética da última compra');await page.getByRole('button',{name:'Estornar recebimento inteiro',exact:true}).click();await expect(row).toContainText('8 kg');await expect(row).toContainText('160');await expect(page.getByRole('region',{name:'Histórico de preços'})).toContainText('original preservado');
 }finally{await fixture.close();}
});
export async function openInventory(page:Page,fixture:Awaited<ReturnType<typeof createInventoryFixtures>>){
 const response=await page.request.get(`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants`,{headers:{Authorization:`Bearer ${fixture.jwt}`}});expect(response.status()).toBe(200);const body=await response.json() as {items:{id:string;name:string}[]};const unit=body.items.find(item=>item.id===fixture.selection.restaurantId);if(!unit)throw Error('Synthetic inventory unit missing');
 await login(page,'a',5174);const orgResponse=await page.request.get('http://127.0.0.1:3001/v1/organizations',{headers:{Authorization:`Bearer ${fixture.jwt}`}});const orgBody=await orgResponse.json() as {items:{id:string;name:string}[]};const org=orgBody.items.find(item=>item.id===fixture.selection.organizationId);if(!org)throw Error('Synthetic inventory organization missing');await page.getByRole('button',{name:org.name,exact:true}).click();
 const loaded=Promise.all(['ingredients','suppliers','receipts','balances'].map(resource=>page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith(`/restaurants/${fixture.selection.restaurantId}/inventory/${resource}`)).then(async result=>{expect(result.status()).toBe(200);await result.finished();})));
 await page.getByRole('button',{name:`Selecionar ${unit.name}`,exact:true}).click();await loaded;await expect(page.getByRole('heading',{name:'Estoque da unidade ativa',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cadastrar insumo',exact:true})).toBeVisible();
}
