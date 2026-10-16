import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {login} from './owner-fixture.js';

test('owner creates a priced combo, simulates it, and sees its frozen component history',async({page})=>{
 const organizationId='10000000-0000-4000-8000-000000000020',restaurantId='10000000-0000-4000-8000-000000000021';
 const productId=randomUUID(),variantId=randomUUID(),channelId=randomUUID(),comboId=randomUUID();let packagingId='';
 let product:Record<string,unknown>|null=null,variant:Record<string,unknown>|null=null,channel:Record<string,unknown>|null=null,combo:Record<string,unknown>|null=null,simulation:Record<string,unknown>|null=null,comboInput:unknown=null,packagingPathsAvailable=true;
 const pageOf=(items:unknown[])=>({items,nextCursor:null});
 await page.route('http://127.0.0.1:3001/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  let status=200,body:unknown={};
  if(path==='/v1/me')body={userId:'10000000-0000-4000-8000-000000000001'};
  else if(path==='/v1/organizations'&&method==='GET')body=pageOf([{id:organizationId,name:'DEV Empresa C'}]);
  else if(path===`/v1/organizations/${organizationId}/restaurants`&&method==='GET')body=pageOf([{id:restaurantId,organizationId,name:'DEV C1'}]);
  else if(path===`/v1/organizations/${organizationId}/capabilities`&&method==='GET')body=pageOf([{feature:'pricing_core',allowed:true,reason:'ACTIVE'}]);
  else if(path==='/v1/contexts'&&method==='POST')body={organizationId,restaurantId,token:'a'.repeat(64),expiresAt:'2026-10-17T00:00:00.000Z'};
  else if(path.endsWith('/access/precificacao'))body={feature:'pricing_core',allowed:true,reason:'ACTIVE'};
  else if(path.endsWith('/pricing/products')&&method==='GET')body=pageOf(product?[{...product,variants:variant?[{id:variantId,name:(variant.name as string),listPrice:variant.listPrice,status:'active',costSourceKind:'manual'}]:[]}]:[]);
  else if(path.endsWith('/pricing/products')&&method==='POST'){status=201;product={id:productId,name:(request.postDataJSON() as {name:string}).name,description:null,archivedAt:null,variants:[]};body=product;}
  else if(path.endsWith(`/pricing/products/${productId}/variants`)&&method==='POST'){
   status=201;const input=request.postDataJSON() as {name:string;listPrice:string;costSource:{kind:'manual';ingredientCost:string;currency:'BRL'};packaging:{id:string;name:string;costPerSale:string}[];otherVariableCost:string};
   packagingId=input.packaging[0]?.id??randomUUID();variant={id:variantId,productId,name:input.name,listPrice:input.listPrice,costSource:input.costSource,packaging:input.packaging,otherVariableCost:input.otherVariableCost,archivedAt:null};body=variant;
  }
  else if(path.endsWith(`/pricing/variants/${variantId}`)&&method==='GET')body={...variant,packagingPaths:(variant?.packaging as {id:string;name:string}[]|undefined)?.map(item=>({componentPath:['app02-packaging',item.id],label:item.name}))??[],packagingPathsAvailable};
  else if(path.endsWith('/pricing/channels')&&method==='GET')body=pageOf(channel?[channel]:[]);
  else if(path.endsWith('/pricing/channels')&&method==='POST'){
   status=201;const input=request.postDataJSON() as {name:string;rates:unknown[]};channel={id:channelId,name:input.name,rates:input.rates,archivedAt:null};body=channel;
  }
  else if(path.endsWith('/pricing/combos')&&method==='GET')body=pageOf(combo?[combo]:[]);
  else if(path.endsWith('/pricing/combos')&&method==='POST'){
   status=201;const input=request.postDataJSON() as {name:string;listPrice:string;components:unknown[];exclusivePackaging:unknown[]};comboInput=input;combo={id:comboId,...input,archivedAt:null};body=combo;
  }
  else if(path.endsWith('/pricing/simulations')&&method==='POST'){
   status=201;const input=request.postDataJSON() as {variantId:null;comboId:string;channelId:string;targetContributionMargin:string;targetCmv:null};
   const selectedVariant=variant as {id:string;name:string;listPrice:string;costSource:{kind:'manual';ingredientCost:string;currency:'BRL';updatedAt:string};packaging:{id:string;name:string;costPerSale:string}[];otherVariableCost:string};
   const selectedCombo=combo as {id:string;name:string;listPrice:string;components:{variantId:string;quantity:string;replacedPackagingPaths:string[][]}[];exclusivePackaging:{id:string;name:string;costPerSale:string}[]};
   const selectedChannel=channel as {id:string;name:string;rates:{id:string;kind:'fee';mode:'percentage';value:string;rateBase:'net_after_discount';fixedBasis:'per_sale'}[]};
   const costSourceSnapshot={...selectedVariant.costSource,updatedAt:'2026-10-16T12:00:00.000Z'};
   simulation={id:randomUUID(),variantId:null,comboId:input.comboId,channelId:input.channelId,inputSnapshot:input,costSourceSnapshot:null,variantSnapshot:null,
    componentCostSnapshots:[{variantSnapshot:{variantId,name:selectedVariant.name,listPrice:selectedVariant.listPrice,costSourceSnapshot,packaging:selectedVariant.packaging,costComponents:[{componentPath:['manual-ingredient'],role:'ingredient',costPerFinalUnitExact:{numerator:'2000000000000',denominator:'1'}},{componentPath:['app02-packaging',packagingId],role:'packaging',costPerFinalUnitExact:{numerator:'1000000000000',denominator:'1'}}],otherVariableCost:selectedVariant.otherVariableCost},quantity:'2',replacedPackagingPaths:[['app02-packaging',packagingId]]}],
    channelSnapshot:selectedChannel,comboSnapshot:selectedCombo,quote:{status:'available',reason:null,suggestedPrice:'7.5',costBuckets:{ingredients:'4',packaging:'0.5',otherVariable:'0'},totalVariableCost:'4.5',currentPriceMetrics:{netRevenue:'1111.1103',contributionMargin:'0.9959',cmv:'0.0041'},suggestedPriceMetrics:{netRevenue:'6.75',contributionMargin:'0.3333',cmv:'0.6667'},rateBreakdown:[]},createdAt:'2026-10-16T12:00:00.000Z'};
   body=simulation;
  }
  else if(path.endsWith('/pricing/simulations')&&method==='GET')body=pageOf(simulation?[simulation]:[]);
  else if(path.startsWith('/v1/auth/'))body={};
  else return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'NOT_FOUND'}})});
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await login(page,'a',5175);
 await page.getByRole('button',{name:'DEV Empresa C',exact:true}).click();
 await page.getByRole('button',{name:'Selecionar DEV C1',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Precificação da unidade ativa',exact:true})).toBeVisible();

 const suffix=randomUUID(),productName=`Combo UI ${suffix}`,variantName=`Item UI ${suffix}`,channelName=`Canal UI ${suffix}`,comboName=`Combo UI ${suffix}`;
 await page.getByLabel('Nome do produto',{exact:true}).fill(productName);
 await page.getByRole('button',{name:'Criar produto',exact:true}).click();
 await page.getByLabel('Nome da variação',{exact:true}).fill(variantName);
 await page.getByLabel('Preço de lista (R$)',{exact:true}).fill('10');
 await page.getByLabel('Custo manual de ingredientes (R$)',{exact:true}).fill('2');
 await page.getByLabel('Embalagem (opcional)',{exact:true}).fill('Saco teste');
 await page.getByLabel('Custo da embalagem por venda (R$)',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Salvar variação manual',exact:true}).click();

 await page.getByLabel('Nome do canal',{exact:true}).fill(channelName);
 await page.getByLabel('Percentual em fração decimal',{exact:true}).fill('0,1');
 await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();

 await page.getByLabel('Nome do combo',{exact:true}).fill(comboName);
 await page.getByLabel('Preço de lista do combo (R$)',{exact:true}).fill('1234,567');
 await page.getByRole('combobox',{name:'Variação do componente 1',exact:true}).selectOption({label:`${variantName} — lista R$ 10,00`});
 await page.getByLabel('Quantidade do componente 1',{exact:true}).fill('2');
 await page.getByLabel(`Substituir embalagem ${variantName} — Saco teste`,{exact:true}).check();
 await page.getByRole('button',{name:'Adicionar embalagem exclusiva',exact:true}).click();
 await page.getByLabel('Nome da embalagem exclusiva 1',{exact:true}).fill('Caixa combo');
 await page.getByLabel('Custo por venda da embalagem exclusiva 1 (R$)',{exact:true}).fill('0,5');
 await page.getByRole('button',{name:'Salvar combo',exact:true}).click();
 expect(comboInput).toMatchObject({listPrice:'1234.567',components:[{variantId,quantity:'2',replacedPackagingPaths:[['app02-packaging',packagingId]]}],exclusivePackaging:[{name:'Caixa combo',costPerSale:'0.5'}]});

 await page.getByLabel('Tipo de simulação',{exact:true}).selectOption('combo');
 await page.getByRole('combobox',{name:'Combo',exact:true}).selectOption({label:`${comboName} — lista R$ 1.234,57`});
 await page.getByRole('combobox',{name:'Perfil de canal',exact:true}).selectOption({label:channelName});
 await page.getByRole('button',{name:'Calcular preço sugerido',exact:true}).click();
 await expect(page.getByRole('article',{name:'Resultado da simulação'})).toContainText('Combo');
 await expect(page.getByRole('article',{name:'Resultado da simulação'})).toContainText('R$ 7,50');
 await expect(page.getByRole('article',{name:'Resultado da simulação'})).toContainText('embalagens R$ 0,50');
 await expect(page.getByRole('article',{name:'Resultado da simulação'})).toContainText('preço de lista congelado R$ 1.234,57');
 await expect(page.getByRole('region',{name:'Histórico de simulações'})).toContainText('componentes congelados');
 await expect(page.getByRole('region',{name:'Histórico de simulações'})).toContainText('R$ 7,50');

 packagingPathsAvailable=false;
 await page.getByLabel('Nome do combo',{exact:true}).fill(`Combo sem caminhos ${suffix}`);
 await page.getByLabel('Preço de lista do combo (R$)',{exact:true}).fill('15');
 await page.getByRole('combobox',{name:'Variação do componente 1',exact:true}).selectOption({label:`${variantName} — lista R$ 10,00`});
 await expect(page.getByRole('status')).toContainText('Detalhes de embalagens da ficha indisponíveis sem inventory_core');
 await expect(page.getByRole('checkbox',{name:`Substituir embalagem ${variantName} — Saco teste`})).toBeDisabled();
});
