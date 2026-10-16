import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { listCapabilities,requireEntitlement } from '../../packages/domain-billing/src/entitlements.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool),actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
afterAll(()=>pool.end());
it('pricing isolado permitido; Premium sem base negado; sem feature/expirado negados',async()=>{
  await db.withOrganizationTx(actor,f.orgC,async(ctx,tx)=>{
    const caps=await listCapabilities(ctx,tx);
    expect(caps.find(c=>c.feature==='pricing_core')?.allowed).toBe(true);
    expect(caps.find(c=>c.feature==='shopping_premium')?.reason).toBe('BASE_REQUIRED');
    expect(caps.find(c=>c.feature==='ai_photo')?.reason).toBe('EXPIRED');
    await expect(requireEntitlement(ctx,'inventory_core',tx)).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  });
});
it('runtime não concede plano nem muda franquia; sem grant direto',async()=>{
  await db.withOrganizationTx(actor,f.orgA,async(_ctx,tx)=>{
    await expect(tx.query("update core.entitlements set enabled=true where organization_id=$1",[f.orgA])).rejects.toMatchObject({code:'42501'});
  });
  await expect(pool.query('update core.usage_buckets set limit_units=100000')).rejects.toMatchObject({code:'42501'});
});
