import {expect, type Page} from '@playwright/test';
import type {AiTextProposal} from '@donos/contracts';

export const aiIds = {
  organization: '10000000-0000-4000-8000-000000000001',
  restaurant: '20000000-0000-4000-8000-000000000001',
  location: '30000000-0000-4000-8000-000000000001',
  otherLocation: '30000000-0000-4000-8000-000000000002',
  ingredient: '40000000-0000-4000-8000-000000000001',
  supplier: '50000000-0000-4000-8000-000000000001',
  proposal: '60000000-0000-4000-8000-000000000001',
  result: '70000000-0000-4000-8000-000000000001',
};
export const canonicalText = 'Recebi 5 kg de Farinha por R$ 190';
export async function openSyntheticAi(page:Page, options:{quota?:boolean; uncertain?:boolean; delayed?:boolean}={}) {
  const confirms:Array<{key:string|undefined; body:unknown}>=[];
  const unexpected:string[]=[];
  let releaseCreate: (()=>void)|undefined;
  let markStarted:()=>void=()=>{};
  const started=new Promise<void>(resolve=>{markStarted=resolve;});
  let proposal:AiTextProposal={
    id:aiIds.proposal, organizationId:aiIds.organization, restaurantId:aiIds.restaurant,
    locationId:aiIds.location, action:'receipt', status:'needs_review', version:1,
    candidate:{action:'receipt',ingredientDescription:'Farinha',quantity:'5',unit:'kg',totalPrice:'190',unitPrice:'38',reason:null,ambiguous:false,explanations:[]},
    missingFields:['supplier'], resultId:null, createdAt:'2026-10-23T12:00:00.000Z',updatedAt:'2026-10-23T12:00:00.000Z',expiresAt:'2026-11-22T12:00:00.000Z',
  };
  await page.addInitScript(()=>{
    sessionStorage.setItem('donos-estoque-auth',JSON.stringify({
      access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',token_type:'bearer',
      expires_at:4102444800,expires_in:2147483647,
      user:{id:'80000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'owner@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'},
    }));
  });
  await page.route('**/*', async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
    // Only Vite assets may reach the loopback UI server. Everything else is synthetic.
    if(url.origin==='http://127.0.0.1:5187')return route.continue();
    if(url.origin!=='http://127.0.0.1:3001'&&url.origin!=='http://127.0.0.1:59999') {unexpected.push(request.url());return route.abort();}
    if(method==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});
    const json=(value:unknown,status=200)=>route.fulfill({status,json:value,headers:{'Access-Control-Allow-Origin':'*'}});
    if(url.origin==='http://127.0.0.1:59999')return json({error:'Synthetic Auth request not supported'},400);
    if(path==='/v1/me')return json({});
    if(path==='/v1/organizations')return json({items:[{id:aiIds.organization,name:'Empresa sintética'}]});
    if(path.endsWith('/restaurants'))return json({items:[{id:aiIds.restaurant,organizationId:aiIds.organization,name:'Unidade sintética'}]});
    if(path.endsWith('/capabilities'))return json({items:[]});
    if(path==='/v1/contexts')return json({organizationId:aiIds.organization,restaurantId:aiIds.restaurant,token:'a'.repeat(64),expiresAt:'2100-01-01T00:00:00.000Z'});
    if(path.endsWith('/access/estoque'))return json({});
    if(path.endsWith('/ai/text/proposals')&&method==='POST'){
      expect(request.postDataJSON()).toEqual({locationId:aiIds.location,text:canonicalText});
      if(options.quota)return json({error:{code:'QUOTA_EXCEEDED'}},429);
      if(options.delayed)await new Promise<void>(resolve=>{releaseCreate=resolve;markStarted();});
      return json(proposal);
    }
    if(path.endsWith(`/ai/text/proposals/${aiIds.proposal}`)){
      if(method==='PATCH'){
        const body=request.postDataJSON() as {supplierId?:string;quantity?:string;unitPrice?:string};
        expect(body.supplierId).toBe(aiIds.supplier);
        proposal={...proposal,version:proposal.version+1,status:'ready',missingFields:[],candidate:{...proposal.candidate,quantity:body.quantity??'5',unitPrice:body.unitPrice??proposal.candidate.unitPrice}};
      }
      return json(proposal);
    }
    if(path.endsWith('/confirm')){
      confirms.push({key:request.headers()['idempotency-key'],body:request.postDataJSON()});
      if(options.uncertain&&confirms.length===1)return route.abort('failed');
      proposal={...proposal,status:'confirmed',resultId:aiIds.result};
      return json({proposal,result:{receiptId:aiIds.result}});
    }
    if(path.endsWith('/discard')){proposal={...proposal,status:'discarded'};return json({id:proposal.id,status:'discarded'});}
    if(path.endsWith('/ingredients'))return json({items:[{id:aiIds.ingredient,organizationId:aiIds.organization,restaurantId:aiIds.restaurant,name:'Farinha',baseUnit:'kg',allowFractionalCount:true,archived:false}],nextCursor:null});
    if(path.endsWith('/suppliers'))return json({items:[{id:aiIds.supplier,name:'Fornecedor sintético',archived:false}],nextCursor:null});
    if(path.endsWith('/locations'))return json({items:[{id:aiIds.location,name:'Cozinha',isDefault:true,archived:false},{id:aiIds.otherLocation,name:'Depósito',isDefault:false,archived:false}]});
    if(path.endsWith('/balances'))return json({items:[],nextCursor:null,totalValue:'0'});
    return json({items:[],nextCursor:null});
  });
  await page.goto('http://127.0.0.1:5187');
  await page.getByRole('button',{name:'Empresa sintética',exact:true}).click();
  await page.getByRole('button',{name:'Selecionar Unidade sintética'}).click();
  await expect(page.getByRole('heading',{name:'Estoque da unidade ativa'})).toBeVisible();
  return {confirms,unexpected,started,release:()=>releaseCreate?.()};
}
