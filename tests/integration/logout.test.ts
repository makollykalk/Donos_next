import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import { revokeSession } from '../../apps/api/src/auth/revocation.js';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { config,login,runtimePool } from '../helpers/local-db.js';
const pool=runtimePool(),db=createDatabase(pool); afterAll(()=>pool.end());
it('logout repetido, JWT antigo e refresh com mesma sessão permanecem revogados',async()=>{
  const a=await login('a'), verify=createActorVerifier(a.auth.auth,`${config.supabaseUrl}/auth/v1`);
  const actor=await verify(a.token,randomUUID());
  await revokeSession(db,actor); await revokeSession(db,actor);
  await expect(db.withActorTx(actor,async()=>true)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  const {data,error}=await a.auth.auth.refreshSession(); expect(error).toBeNull();
  const refreshed=await verify(data.session!.access_token,randomUUID()); expect(refreshed.sessionId).toBe(actor.sessionId);
  await expect(db.withActorTx(refreshed,async()=>true)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});
