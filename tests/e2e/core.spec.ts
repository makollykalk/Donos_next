import { expect, test } from '@playwright/test';
import {login} from './owner-fixture.js';
test('owner creates an organization and unit, then logout clears access',async({page})=>{
  await login(page);
  const name=`Browser ${crypto.randomUUID()}`;
  await page.getByLabel('Nome da empresa').fill(name);
  await page.getByLabel('Primeira unidade').fill('Matriz browser');
  await page.getByRole('button',{name:'Criar empresa'}).click();
  await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('button',{name:'Selecionar Matriz browser'}).click();
  await expect(page.getByText('Unidade ativa: Matriz browser')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Selecione explicitamente uma unidade.')).toBeVisible();
  const logoutRequest=page.waitForRequest(request=>request.url()==='http://127.0.0.1:3001/v1/auth/logout');
  const logoutOrder:string[]=[];
  page.on('request',request=>{if(request.url().includes('/v1/auth/logout'))logoutOrder.push('api');if(request.url().includes('/auth/v1/logout'))logoutOrder.push('provider');});
  await page.getByRole('button',{name:'Sair'}).click();
  const oldBearer=(await logoutRequest).headers()['authorization'];
  await expect(page.getByLabel('Senha')).toBeVisible();
  const replay=await page.request.get('http://127.0.0.1:3001/v1/me',{headers:{Authorization:oldBearer!}});
  expect(replay.status()).toBe(401);
  expect(logoutOrder[0]).toBe('api');
});
test('owner B sees no organizations belonging to A',async({page})=>{
  await login(page,'b');
  await expect(page.getByRole('button',{name:'DEV Empresa B',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'DEV Empresa A',exact:true})).toHaveCount(0);
});
test('unauthenticated protected route requires login',async({page})=>{
  await page.goto('http://127.0.0.1:5173/organizations');
  await expect(page.getByLabel('Senha')).toBeVisible();
});
test('bad credentials produce a readable error',async({page})=>{
  await page.goto('http://127.0.0.1:5173/login');
  await page.getByLabel('Email').fill('nobody@donos-next.invalid');
  await page.getByLabel('Senha').fill('deliberately-invalid-synthetic');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Confira email e senha');
});
