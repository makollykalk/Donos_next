import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { createCore } from '../../packages/domain-core/src/context.js';
import { reserveUsage,settleUsage,releaseUsage,markUsageUnknown,markUsageDispatched } from '../../packages/domain-billing/src/usage.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool),actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
afterAll(()=>pool.end());
it('reserve5/settle3, repetição, conflitos, unknown conserva e release após dispatch bloqueado',async()=>{
  const selected=await createCore(db).selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1});
  await expect(db.withRestaurantTx(actor,selected,selected.token,async(ctx,tx)=>{
    const input={feature:'ai_photo' as const,operationKey:randomUUID(),requestHash:'b'.repeat(64),maxUnits:'5'};
    const r=await reserveUsage(ctx,input,tx);
    const settled=await settleUsage(ctx,r.reservation.id,'3',tx);expect(settled.actualUnits).toBe('3');
    expect(await settleUsage(ctx,r.reservation.id,'3',tx)).toEqual(settled);
    await expect(settleUsage(ctx,r.reservation.id,'4',tx)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    await expect(releaseUsage(ctx,r.reservation.id,'NOT_DISPATCHED',tx)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    const counters=(await tx.query('select reserved_units::text,settled_units::text from core.usage_buckets where organization_id=$1 and period_end>now()',[f.orgA])).rows[0];
    expect(counters).toEqual({reserved_units:'0',settled_units:'3'});
    throw new Error('test rollback');
  })).rejects.toThrow('test rollback');
  await expect(db.withRestaurantTx(actor,selected,selected.token,async(ctx,tx)=>{
    const input={feature:'ai_photo' as const,operationKey:randomUUID(),requestHash:'c'.repeat(64),maxUnits:'5'};
    const r=await reserveUsage(ctx,input,tx);
    await markUsageDispatched(ctx,r.reservation.id,tx);
    await expect(releaseUsage(ctx,r.reservation.id,'NOT_DISPATCHED',tx)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    expect((await markUsageUnknown(ctx,r.reservation.id,tx)).status).toBe('pending_reconciliation');
    expect((await reserveUsage(ctx,input,tx)).created).toBe(false);
    await expect(reserveUsage(ctx,{...input,requestHash:'d'.repeat(64)},tx)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    throw new Error('test rollback');
  })).rejects.toThrow('test rollback');
});
