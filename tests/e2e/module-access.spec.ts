import {expect,test} from '@playwright/test';
import {login} from './owner-fixture.js';
test('pricing shell checks real API entitlement independently',async({page})=>{
  await login(page,'a',5175);
  await page.getByRole('button',{name:'DEV Empresa C',exact:true}).click();
  await page.getByRole('button',{name:'Selecionar DEV C1'}).click();
  await expect(page.getByText('Acesso de demonstração — Precificação')).toBeVisible();
});
test('API 503 is explicit and does not show a protected shell',async({page})=>{
  await login(page,'a',5174);
  await page.route('**/access/estoque',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'DEPENDENCY_UNAVAILABLE'}})}));
  await page.getByRole('button',{name:'DEV Empresa A',exact:true}).click();
  await page.getByRole('button',{name:'Selecionar DEV A1'}).click();
  await expect(page.getByRole('alert')).toContainText('indisponível');
  await expect(page.getByText('Acesso de demonstração — Estoque')).toHaveCount(0);
});
test('inventory shell denied to pricing-only organization',async({page})=>{
  await login(page,'a',5174);
  await page.getByRole('button',{name:'DEV Empresa C',exact:true}).click();
  await page.getByRole('button',{name:'Selecionar DEV C1'}).click();
  await expect(page.getByRole('alert')).toContainText('Acesso não concedido');
  await expect(page.getByText('Acesso de demonstração — Estoque')).toHaveCount(0);
});
test('expired context never opens protected shell',async({page})=>{
  await login(page,'a',5174);
  await page.route('**/access/estoque',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'CONTEXT_EXPIRED'}})}));
  await page.getByRole('button',{name:'DEV Empresa A',exact:true}).click();
  await page.getByRole('button',{name:'Selecionar DEV A1'}).click();
  await expect(page.getByRole('alert')).toContainText('Selecione novamente');
  await expect(page.getByText('Acesso de demonstração — Estoque')).toHaveCount(0);
});

test('failed unit loading stays closed and can be retried explicitly without creating context',async({page})=>{
  await login(page,'a',5174);
  let requests=0;let contexts=0;
  page.on('request',request=>{if(request.url().endsWith('/v1/contexts'))contexts++;});
  await page.route('**/organizations/10000000-0000-4000-8000-000000000010/restaurants',async route=>{
    requests++;
    if(requests===1)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'DEPENDENCY_UNAVAILABLE'}})});
    else await route.continue();
  });
  await page.getByRole('button',{name:'DEV Empresa A',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('indisponível');
  await expect(page.getByRole('button',{name:'Selecionar DEV A1'})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Módulo protegido'})).toHaveCount(0);
  await page.getByRole('button',{name:'Tentar carregar unidades novamente'}).click();
  await expect(page.getByRole('button',{name:'Selecionar DEV A1'})).toBeVisible();
  expect(requests).toBe(2);
  expect(contexts).toBe(0);
});
