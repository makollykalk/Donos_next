import { randomUUID } from 'node:crypto';
import { afterAll,expect,it,vi } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { createCore } from '../../packages/domain-core/src/context.js';
import { reserveUsage,releaseUsage,settleUsage } from '../../packages/domain-billing/src/usage.js';
import { runFakeOperation } from '../helpers/fake-provider.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool),core=createCore(db);
const actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
afterAll(()=>pool.end());
it('quota capturada não deixa reserva parcial; microssegundos sobrevivem reserve/release',async()=>{
  const selected=await core.selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1});
  await db.withRestaurantTx(actor,selected,selected.token,async(ctx,tx)=>{
    const input={feature:'ai_voice' as const,maxUnits:'5',requestHash:'e'.repeat(64),operationKey:randomUUID()};
    const a=await reserveUsage(ctx,input,tx), deniedKey=randomUUID();
    await expect(reserveUsage(ctx,{...input,operationKey:deniedKey},tx)).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});
    expect((await tx.query('select id from core.usage_reservations where operation_key=$1',[deniedKey])).rowCount).toBe(0);
    const raw=(await tx.query('select period_start::text from core.usage_reservations where id=$1',[a.reservation.id])).rows[0]!;
    expect(raw.period_start).toContain('.123456');
    const released=await releaseUsage(ctx,a.reservation.id,'NOT_DISPATCHED',tx);
    expect(await releaseUsage(ctx,a.reservation.id,'NOT_DISPATCHED',tx)).toEqual(released);
    const bucket=(await tx.query("select reserved_units::text,settled_units::text from core.usage_buckets where meter_key='ai_voice' and organization_id=$1",[ctx.organizationId])).rows[0];
    expect(bucket).toEqual({reserved_units:'0',settled_units:'0'});
  });
});
it('fake só depois de commit; dup chama uma vez; sem entitlement/overlap chama zero',async()=>{
  const selected=await core.selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1});
  const fake=vi.fn(async()=> '0');
  const input={feature:'ai_voice' as const,maxUnits:'5',requestHash:'f'.repeat(64),operationKey:randomUUID()};
  const results=await Promise.all([1,2].map(()=>runFakeOperation(db,actor,selected,input,fake)));
  expect(fake).toHaveBeenCalledTimes(1);expect(results[0]!.id).toBe(results[1]!.id);
  const denied=vi.fn(async()=> '0');
  const c=await core.selectContext(actor,{organizationId:f.orgC,restaurantId:f.c1});
  await expect(runFakeOperation(db,actor,c,{...input,operationKey:randomUUID()},denied)).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  const overlap=await core.selectContext(actor,{organizationId:'90000000-0000-4000-8000-000000000020',restaurantId:'90000000-0000-4000-8000-000000000021'});
  await expect(runFakeOperation(db,actor,overlap,{...input,feature:'ai_photo',operationKey:randomUUID()},denied)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  expect(denied).not.toHaveBeenCalled();
});
it('timeout mantém reserva, retry não repete fake; reconciliação explícita libera counters',async()=>{
  const selected=await core.selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1}),fake=vi.fn(async():Promise<string>=>{throw new Error('unknown');});
  const input={feature:'ai_voice' as const,maxUnits:'5',requestHash:'d'.repeat(64),operationKey:randomUUID()};
  const r=await runFakeOperation(db,actor,selected,input,fake);
  expect(r.status).toBe('pending_reconciliation');
  expect((await runFakeOperation(db,actor,selected,input,fake)).status).toBe('pending_reconciliation');expect(fake).toHaveBeenCalledTimes(1);
  await db.withRestaurantTx(actor,selected,selected.token,async(ctx,tx)=>{
    expect((await tx.query("select reserved_units::text from core.usage_buckets where organization_id=$1 and meter_key='ai_voice'",[ctx.organizationId])).rows[0]!.reserved_units).toBe('5');
    await settleUsage(ctx,r.id,'0',tx);
  });
});
it('liquida bucket antigo sem entitlement atual e B não liquida reserva A',async()=>{
  const selected=await core.selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1});
  await db.withRestaurantTx(actor,selected,selected.token,async(ctx,tx)=>{
    await expect(reserveUsage(ctx,{feature:'ai_text_whatsapp',maxUnits:'1',requestHash:'a'.repeat(64),operationKey:randomUUID()},tx)).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
    const r=await settleUsage(ctx,'90000000-0000-4000-8000-000000000010','3',tx);expect(r.actualUnits).toBe('3');
    const row=(await tx.query("select reserved_units::text,settled_units::text from core.usage_buckets where organization_id=$1 and meter_key='ai_text_whatsapp'",[ctx.organizationId])).rows[0];
    expect(row).toEqual({reserved_units:'0',settled_units:'3'});
  });
  const b={...actor,userId:f.b,sessionId:randomUUID()}; const b1=await core.selectContext(b,{organizationId:f.orgB,restaurantId:f.b1});
  await expect(db.withRestaurantTx(b,b1,b1.token,(ctx,tx)=>settleUsage(ctx,'90000000-0000-4000-8000-000000000010','3',tx))).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
});
it('assinatura cancelada bloqueia fake e nova reserva, mas liquida uso anterior',async()=>{
  const selected=await core.selectContext(actor,{organizationId:'90000000-0000-4000-8000-000000000030',restaurantId:'90000000-0000-4000-8000-000000000031'});
  const fake=vi.fn(async()=> '0');
  await expect(runFakeOperation(db,actor,selected,{feature:'ai_photo',maxUnits:'1',requestHash:'a'.repeat(64),operationKey:randomUUID()},fake)).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  expect(fake).not.toHaveBeenCalled();
  await db.withRestaurantTx(actor,selected,selected.token,async(ctx,tx)=>{
    expect((await tx.query('select status from core.subscriptions where organization_id=$1',[ctx.organizationId])).rows[0]!.status).toBe('cancelled');
    expect((await settleUsage(ctx,'90000000-0000-4000-8000-000000000032','3',tx)).status).toBe('settled');
  });
});
it('contexto expirado é rejeitado pelo relógio do banco',async()=>{
  const expired={...actor,sessionId:'90000000-0000-4000-8000-000000000001'};
  await expect(db.withRestaurantTx(expired,{organizationId:f.orgA,restaurantId:f.a1},'9'.repeat(64),async()=>true)).rejects.toMatchObject({code:'CONTEXT_EXPIRED'});
});
