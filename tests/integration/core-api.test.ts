import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll,expect,it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { createDatabase } from '../../packages/db/src/transaction.js';
import { config,login,runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool);
let token='';
const app=buildApp({database:db,verifyActor:createActorVerifier((await login('a')).auth.auth,`${config.supabaseUrl}/auth/v1`),corsOrigins:config.corsOrigins});
beforeAll(async()=>{token=(await login('a')).token; await app.ready();});
afterAll(async()=>{await app.close();await pool.end();});
const headers=()=>({authorization:`Bearer ${token}`});
it('sem login e ID forjado não revelam tenant; cabeçalhos seguros',async()=>{
  expect((await app.inject('/v1/organizations')).statusCode).toBe(401);
  const own=await app.inject({url:'/v1/organizations',headers:headers()});
  expect(own.statusCode).toBe(200); expect(own.headers['cache-control']).toBe('no-store');
  expect(own.body).not.toContain(f.orgB); expect(own.body).toContain(f.orgC);
  expect((await app.inject({url:`/v1/organizations/${f.orgB}/restaurants`,headers:headers()})).statusCode).toBe(404);
  expect((await app.inject({method:'POST',url:'/v1/organizations',headers:headers(),payload:{name:'X',firstRestaurant:{name:'X'},owner_user_id:f.b}})).statusCode).toBe(400);
});
it('bootstrap concorrente/idempotente e unidade; payload divergente dá409',async()=>{
  const key=randomUUID(); const options={method:'POST' as const,url:'/v1/organizations',headers:{...headers(),'idempotency-key':key},payload:{name:`Synthetic ${randomUUID()}`,firstRestaurant:{name:'Matriz'}}};
  const [a,b]=await Promise.all([app.inject(options),app.inject(options)]);
  expect(a.statusCode).toBe(201); expect(b.statusCode).toBe(201); expect(a.json()).toEqual(b.json());
  expect((await app.inject({...options,payload:{...options.payload,name:'different'}})).statusCode).toBe(409);
  const result=a.json();
  const units=await app.inject({url:`/v1/organizations/${result.organization.id}/restaurants`,headers:headers()});
  expect(units.json().items).toHaveLength(1);
  const unitOptions={method:'POST' as const,url:`/v1/organizations/${result.organization.id}/restaurants`,headers:{...headers(),'idempotency-key':randomUUID()},payload:{name:'Filial'}};
  const [c,d]=await Promise.all([app.inject(unitOptions),app.inject(unitOptions)]); expect(c.statusCode).toBe(201);expect(c.json()).toEqual(d.json());
  expect((await app.inject({method:'POST',url:'/v1/contexts',headers:headers(),payload:{organizationId:f.orgA,restaurantId:f.a2}})).statusCode).toBe(201);
});
it('T-01 com JWT real de B contra A; entitlements obrigatórios na API direta',async()=>{
  const b=await login('b'), bheaders={authorization:`Bearer ${b.token}`};
  const listed=await app.inject({url:'/v1/organizations',headers:bheaders});
  expect(listed.statusCode).toBe(200); expect(listed.body).toContain(f.orgB);expect(listed.body).not.toContain(f.orgA);
  for(const suffix of ['restaurants','capabilities'])
    expect((await app.inject({url:`/v1/organizations/${f.orgA}/${suffix}`,headers:bheaders})).statusCode).toBe(404);
  expect((await app.inject({method:'POST',url:`/v1/organizations/${f.orgA}/restaurants`,headers:{...bheaders,'idempotency-key':randomUUID()},payload:{name:'forged'}})).statusCode).toBe(404);
  async function context(org:string,unit:string){
    const r=await app.inject({method:'POST',url:'/v1/contexts',headers:headers(),payload:{organizationId:org,restaurantId:unit}});
    expect(r.statusCode).toBe(201);return r.json().token as string;
  }
  const a1=await context(f.orgA,f.a1),c1=await context(f.orgC,f.c1);
  const access=(org:string,unit:string,appName:string,contextToken:string)=>app.inject({url:`/v1/organizations/${org}/restaurants/${unit}/access/${appName}`,headers:{...headers(),'x-donos-context':contextToken}});
  expect((await access(f.orgA,f.a1,'estoque',a1)).statusCode).toBe(200);
  expect((await access(f.orgA,f.a1,'precificacao',a1)).statusCode).toBe(403);
  expect((await access(f.orgC,f.c1,'precificacao',c1)).statusCode).toBe(200);
  expect((await access(f.orgC,f.c1,'estoque',c1)).statusCode).toBe(403);
  expect((await access(f.orgA,f.a2,'estoque',a1)).statusCode).toBe(409);
  expect((await access(f.orgC,f.c1,'precificacao',a1)).statusCode).toBe(409);
});
