import { expect, test } from '@playwright/test';
import { login } from './owner-fixture.js';
test('two tabs keep independent selection and context tokens never persist',async({page,context})=>{
  await login(page);
  await page.getByRole('button',{name:'DEV Empresa A',exact:true}).click();
  await page.getByRole('button',{name:'Selecionar DEV A1'}).click();
  const second=await context.newPage();
  await login(second);
  await second.getByRole('button',{name:'DEV Empresa A',exact:true}).click();
  await second.getByRole('button',{name:'Selecionar DEV A2'}).click();
  await expect(page.getByText('Unidade ativa: DEV A1')).toBeVisible();
  await expect(second.getByText('Unidade ativa: DEV A2')).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
  expect(new URL(page.url()).search).toBe('');
});
test('a delayed A1 selection never overwrites already selected A2',async({page})=>{
  await login(page);
  await page.getByRole('button',{name:'DEV Empresa A',exact:true}).click();
  let release!:()=>void;let arrived!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{arrived=resolve;});
  await page.route('**/v1/contexts',async route=>{
    const body=route.request().postDataJSON() as {restaurantId:string};
    if(body.restaurantId==='10000000-0000-4000-8000-000000000011'){
      const response=await route.fetch();arrived();await waiting;await route.fulfill({response});
    }else await route.continue();
  });
  try{
    await page.getByRole('button',{name:'Selecionar DEV A1'}).click();
    await started;
    await page.getByRole('button',{name:'Selecionar DEV A2'}).click();
    await expect(page.getByText('Unidade ativa: DEV A2')).toBeVisible();
    release();
    await expect(page.getByText('Unidade ativa: DEV A2')).toBeVisible();
    await expect(page.getByText('Unidade ativa: DEV A1')).toHaveCount(0);
  }finally{release();}
});
