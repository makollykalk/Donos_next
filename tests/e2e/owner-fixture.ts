import {expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const actors=JSON.parse(readFileSync('.local/fixtures.json','utf8')) as {actors:{name:string;email:string;password:string}[]};
export async function login(page:Page,actor='a',port=5173){
  const credentials=actors.actors.find(item=>item.name===actor)!;
  await page.goto(`http://127.0.0.1:${port}/login`);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Senha').fill(credentials.password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Empresas'})).toBeVisible();
}
