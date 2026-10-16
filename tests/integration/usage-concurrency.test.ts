import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { createCore } from '../../packages/domain-core/src/context.js';
import { reserveUsage,releaseUsage } from '../../packages/domain-billing/src/usage.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool),actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
afterAll(()=>pool.end());
it('última quota concorrente: um vencedor; duplicata criada uma vez; ledger reconcilia',async()=>{
  const selected=await createCore(db).selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1});
  const run=<T>(fn:Parameters<typeof db.withRestaurantTx<T>>[3])=>db.withRestaurantTx(actor,selected,selected.token,fn);
  const input={feature:'ai_photo' as const,requestHash:'a'.repeat(64),maxUnits:'5'};
  const results=await Promise.allSettled([1,2].map(()=>run((ctx,tx)=>reserveUsage(ctx,{...input,operationKey:randomUUID()},tx))));
  const winners=results.filter(r=>r.status==='fulfilled'); expect(winners).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected').map(r=>r.reason.code)).toEqual(['QUOTA_EXCEEDED']);
  await run((ctx,tx)=>releaseUsage(ctx,winners[0]!.value.reservation.id,'NOT_DISPATCHED',tx));
  const key=randomUUID();
  const duplicates=await Promise.all([1,2].map(()=>run((ctx,tx)=>reserveUsage(ctx,{...input,operationKey:key},tx))));
  expect(duplicates.filter(d=>d.created)).toHaveLength(1);
  expect(duplicates[0]!.reservation.id).toBe(duplicates[1]!.reservation.id);
  await run((ctx,tx)=>releaseUsage(ctx,duplicates[0]!.reservation.id,'NOT_DISPATCHED',tx));
  await run(async(ctx,tx)=>{
    const row=(await tx.query('select reserved_units::text from core.usage_buckets where organization_id=$1 and period_end>now()',[ctx.organizationId])).rows[0];
    expect(row!.reserved_units).toBe('0');
  });
});
