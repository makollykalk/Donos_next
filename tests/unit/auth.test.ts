import { randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
const userId=randomUUID(),sessionId=randomUUID(),issuer='https://approved.supabase.co/auth/v1';
const claims={sub:userId,session_id:sessionId,aud:'authenticated',iss:issuer,exp:Math.floor(Date.now()/1000)+3600};
const user={id:userId,is_anonymous:false,email_confirmed_at:'2026-10-14T00:00:00Z'};
function adapter(c:Record<string,unknown>=claims,u:Record<string,unknown>=user){
  return {getClaims:vi.fn(async(_token:string)=>({data:{claims:c},error:null})),getUser:vi.fn(async(_token:string)=>({data:{user:u},error:null}))};
}
it('verifica claims e usuário com mesmo bearer, ignorando metadata como permissão',async()=>{
  const auth=adapter(claims,{...user,user_metadata:{admin:true}});
  const actor=await createActorVerifier(auth,issuer)('same-bearer',randomUUID());
  expect(actor.userId).toBe(userId); expect(actor.sessionId).toBe(sessionId);
  expect(auth.getClaims).toHaveBeenCalledWith('same-bearer'); expect(auth.getUser).toHaveBeenCalledWith('same-bearer');
});
it.each([{...claims,exp:1},{...claims,iss:'https://other/auth/v1'},{...claims,aud:'anon'},
  {...claims,sub:'bad'},{...claims,session_id:undefined}])('rejeita claims inválidos %#',async c=>{
  await expect(createActorVerifier(adapter(c),issuer)('token',randomUUID())).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});
it.each([{...user,id:randomUUID()},{...user,is_anonymous:true},{...user,email_confirmed_at:null}])('rejeita identidade inconsistente %#',async u=>{
  await expect(createActorVerifier(adapter(claims,u),issuer)('token',randomUUID())).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});
it('falha fechado quando Auth está indisponível',async()=>{
  const auth=adapter(); auth.getClaims.mockRejectedValueOnce(new Error('network'));
  await expect(createActorVerifier(auth,issuer)('token',randomUUID())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  expect(auth.getUser).not.toHaveBeenCalled();
});
