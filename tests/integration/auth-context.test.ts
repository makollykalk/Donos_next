import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import { createCore } from '../../packages/domain-core/src/context.js';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { config,login,runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool); afterAll(()=>pool.end());
it('JWT real, contexto hash/TTL, rota divergente e outra sessão negados',async()=>{
  const a=await login('a'); const verify=createActorVerifier(a.auth.auth,`${config.supabaseUrl}/auth/v1`);
  const actor=await verify(a.token,randomUUID()); const core=createCore(db);
  const selected=await core.selectContext(actor,{organizationId:f.orgA,restaurantId:f.a1});
  expect(selected.token).toMatch(/^[a-f0-9]{64}$/);
  await db.withActorTx(actor,async tx=>{
    const row=(await tx.query('select token_hash,extract(epoch from (expires_at-created_at))::int as ttl from core.request_contexts order by created_at desc limit 1')).rows[0];
    expect(row.token_hash).not.toBe(selected.token); expect(row.ttl).toBe(1800);
  });
  await db.withRestaurantTx(actor,selected,selected.token,async(_ctx,tx)=>{
    expect((await tx.query('select id from core.restaurants')).rows).toEqual([{id:f.a1}]);
  });
  await expect(db.withRestaurantTx(actor,{organizationId:f.orgA,restaurantId:f.a2},selected.token,async()=>true)).rejects.toMatchObject({code:'CONTEXT_MISMATCH'});
  const other={...actor,sessionId:randomUUID()};
  await expect(db.withRestaurantTx(other,selected,selected.token,async()=>true)).rejects.toMatchObject({code:'CONTEXT_MISMATCH'});
  await expect(core.selectContext(actor,{organizationId:f.orgB,restaurantId:f.b1})).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
  const segments=a.token.split('.'); const payload=JSON.parse(Buffer.from(segments[1]!,'base64url').toString()) as Record<string,unknown>;
  payload.sub=f.b; segments[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');
  await expect(verify(segments.join('.'),randomUUID())).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});
