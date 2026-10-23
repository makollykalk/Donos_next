import {expect,test} from '@playwright/test';
import type {AiTextProposal,AiTextProposalReview} from '@donos/contracts';
import {aiIds,canonicalText,openSyntheticAi} from './ai-text-fixture.js';

async function generate(page:import('@playwright/test').Page){
  const workspace=page.getByRole('region',{name:'Estoque por texto'});
  await expect(workspace).toBeVisible();
  await workspace.getByRole('textbox',{name:'Descreva a entrada ou baixa'}).fill(canonicalText);
  await workspace.getByRole('button',{name:'Gerar proposta',exact:true}).click();
  return workspace;
}
async function ready(page:import('@playwright/test').Page){
  const workspace=await generate(page);
  await workspace.getByLabel('Fornecedor da proposta').selectOption(aiIds.supplier);
  await workspace.getByRole('button',{name:'Salvar revisão'}).click();
  await expect(workspace.getByRole('button',{name:'Confirmar entrada de 5 kg de Farinha'})).toBeEnabled();
  return workspace;
}

test('saved review with lost PATCH response reconciles by GET and the frozen idempotent review',async({page})=>{
  const mock=await openSyntheticAi(page);
  const patches:Array<{key:string|undefined;body:AiTextProposalReview}>=[];
  let statusReads=0;
  let saved:AiTextProposal|null=null;
  await page.route(`**/inventory/ai/text/proposals/${aiIds.proposal}`,async route=>{
    const request=route.request();
    if(request.method()==='PATCH'){
      const body=request.postDataJSON() as AiTextProposalReview;
      patches.push({key:request.headers()['idempotency-key'],body});
      saved={id:aiIds.proposal,organizationId:aiIds.organization,restaurantId:aiIds.restaurant,locationId:aiIds.location,action:'receipt',status:'ready',version:2,
        candidate:{action:'receipt',ingredientDescription:'Farinha',quantity:'6',unit:'kg',totalPrice:'190',unitPrice:'40',reason:null,ambiguous:false,explanations:[]},missingFields:[],resultId:null,
        createdAt:'2026-10-23T12:00:00.000Z',updatedAt:'2026-10-23T12:01:00.000Z',expiresAt:'2026-11-22T12:00:00.000Z'};
      if(patches.length===1)return route.abort('failed');
      expect(statusReads).toBeGreaterThan(0);
      expect(patches[1]).toEqual(patches[0]);
      return route.fulfill({json:saved,headers:{'Access-Control-Allow-Origin':'*'}});
    }
    if(request.method()==='GET'){statusReads++;return route.fulfill({json:saved,headers:{'Access-Control-Allow-Origin':'*'}});}
    return route.fallback();
  });
  const workspace=await generate(page);
  await workspace.getByLabel('Fornecedor da proposta').selectOption(aiIds.supplier);
  await workspace.getByLabel('Quantidade da proposta').fill('6');
  await workspace.getByLabel('Preço unitário da proposta').fill('40');
  await workspace.getByRole('button',{name:'Salvar revisão'}).click();
  await expect(workspace.getByLabel('Quantidade da proposta')).toBeDisabled();
  await expect(workspace.getByRole('button',{name:'Descartar proposta'})).toHaveCount(0);
  await expect(workspace.getByRole('button',{name:'Confirmar entrada de 6 kg de Farinha'})).toHaveCount(0);
  await expect(workspace.getByRole('button',{name:'Usar formulários manuais'})).toBeEnabled();
  expect(mock.confirms).toHaveLength(0);
  await workspace.getByRole('button',{name:'Verificar status da revisão'}).click();
  await workspace.getByRole('button',{name:'Recuperar a mesma revisão'}).click();
  await expect(workspace.getByLabel('Fornecedor da proposta')).toHaveValue(aiIds.supplier);
  await expect(workspace.getByLabel('Quantidade da proposta')).toHaveValue('6');
  await expect(workspace.getByLabel('Preço unitário da proposta')).toHaveValue('40');
  await expect(workspace.getByRole('button',{name:'Confirmar entrada de 6 kg de Farinha'})).toBeEnabled();
  expect(patches).toHaveLength(2);
  expect(patches[1]).toEqual(patches[0]);
  expect(patches[0]?.body.expectedVersion).toBe(1);
  expect(patches[0]?.key).toBeTruthy();
  expect(statusReads).toBe(1);
  expect(mock.confirms).toHaveLength(0);
  await workspace.getByRole('button',{name:'Confirmar entrada de 6 kg de Farinha'}).click();
  await expect(workspace.getByRole('status')).toContainText('Entrada confirmada');
  expect(mock.confirms[0]?.body).toEqual({expectedVersion:2,confirmed:true,supplierId:aiIds.supplier});
});

for(const foreignField of ['organizationId','restaurantId'] as const){
  test(`rejects a proposal with a foreign ${foreignField} in the active location`,async({page})=>{
    const mock=await openSyntheticAi(page);
    await page.route('**/inventory/ai/text/proposals',route=>route.fulfill({json:{
      id:aiIds.proposal,organizationId:aiIds.organization,restaurantId:aiIds.restaurant,locationId:aiIds.location,
      [foreignField]:'90000000-0000-4000-8000-000000000001',action:'receipt',status:'ready',version:1,
      candidate:{action:'receipt',ingredientDescription:'Foreign secret ingredient',quantity:'5',unit:'kg',totalPrice:'190',unitPrice:'38',reason:null,ambiguous:false,explanations:[]},
      missingFields:[],resultId:null,createdAt:'2026-10-23T12:00:00.000Z',updatedAt:'2026-10-23T12:00:00.000Z',expiresAt:'2026-11-22T12:00:00.000Z',
    },headers:{'Access-Control-Allow-Origin':'*'}}));
    const workspace=await generate(page);
    await expect(workspace.getByRole('alert')).toBeVisible();
    await expect(workspace.getByLabel('Quantidade da proposta')).toHaveCount(0);
    await expect(workspace).not.toContainText('Foreign secret ingredient');
    expect(mock.confirms).toHaveLength(0);
  });
}

test('receipt requires supplier review and explicit confirmation, then displays the result envelope',async({page})=>{
  const mock=await openSyntheticAi(page);
  const workspace=await generate(page);
  await expect(workspace.getByText('Total interpretado: R$ 190',{exact:true})).toBeVisible();
  await expect(workspace.getByLabel('Preço unitário da proposta')).toHaveValue('38');
  await expect(workspace.getByRole('button',{name:'Confirmar entrada de 5 kg de Farinha'})).toBeDisabled();
  expect(mock.confirms).toHaveLength(0);
  await workspace.getByLabel('Fornecedor da proposta').selectOption(aiIds.supplier);
  await workspace.getByRole('button',{name:'Salvar revisão'}).click();
  await expect(workspace.getByLabel('Fornecedor da proposta')).toHaveValue(aiIds.supplier);
  expect(mock.confirms).toHaveLength(0);
  await workspace.getByRole('button',{name:'Confirmar entrada de 5 kg de Farinha'}).click();
  await expect(workspace.getByRole('status')).toContainText('Entrada confirmada');
  await expect(workspace).toContainText(aiIds.result);
  expect(mock.confirms).toHaveLength(1);
  expect(mock.confirms[0]?.body).toEqual({expectedVersion:2,confirmed:true,supplierId:aiIds.supplier});
  expect(mock.confirms[0]?.key).toBeTruthy();
  expect(mock.unexpected).toEqual([]);
});

test('quota failure preserves text and offers a working manual fallback',async({page})=>{
  const mock=await openSyntheticAi(page,{quota:true});
  const workspace=await generate(page);
  await expect(workspace.getByRole('alert')).toContainText('franquia');
  await expect(workspace.getByRole('textbox',{name:'Descreva a entrada ou baixa'})).toHaveValue(canonicalText);
  await workspace.getByRole('button',{name:'Usar formulários manuais'}).click();
  await expect(page.locator('#manual-stock-entry')).toBeFocused();
  expect(mock.confirms).toHaveLength(0);
  expect(mock.unexpected).toEqual([]);
});

test('uncertain confirmation freezes edits and retries exact payload/key only after status read',async({page})=>{
  const mock=await openSyntheticAi(page,{uncertain:true});
  const workspace=await ready(page);
  await workspace.getByRole('button',{name:'Confirmar entrada de 5 kg de Farinha'}).click();
  await expect(workspace.getByRole('alert')).toContainText('resultado');
  await expect(workspace.getByLabel('Quantidade da proposta')).toBeDisabled();
  await expect(workspace.getByRole('button',{name:'Usar formulários manuais'})).toBeDisabled();
  await expect(workspace.getByRole('button',{name:'Repetir a mesma confirmação'})).toHaveCount(0);
  await workspace.getByRole('button',{name:'Verificar status da confirmação'}).click();
  await workspace.getByRole('button',{name:'Repetir a mesma confirmação'}).click();
  await expect(workspace.getByRole('status')).toContainText('Entrada confirmada');
  expect(mock.confirms).toHaveLength(2);
  expect(mock.confirms[1]).toEqual(mock.confirms[0]);
  expect(mock.unexpected).toEqual([]);
});

test('location change removes the old proposal and ignores a late create response',async({page})=>{
  const mock=await openSyntheticAi(page,{delayed:true});
  const workspace=await generate(page);
  await expect(workspace).toHaveAttribute('aria-busy','true');
  await mock.started;
  await page.getByLabel('Local de estoque',{exact:true}).selectOption(aiIds.otherLocation);
  mock.release();
  await expect(workspace).toContainText('Depósito');
  await expect(workspace.getByRole('textbox',{name:'Descreva a entrada ou baixa'})).toHaveValue('');
  await expect(workspace.getByLabel('Quantidade da proposta')).toHaveCount(0);
  expect(mock.confirms).toHaveLength(0);
});

test('keyboard navigation and reduced motion preserve review focus and manual access',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await openSyntheticAi(page);
  const workspace=await generate(page);
  await expect(workspace.getByRole('heading',{name:'Revise a proposta'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(workspace.getByLabel('Ação da proposta')).toBeFocused();
  expect(await workspace.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await workspace.getByRole('button',{name:'Usar formulários manuais'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#manual-stock-entry')).toBeFocused();
});
