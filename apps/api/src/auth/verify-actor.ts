import { UUIDSchema } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { VerifiedActor } from '@donos/db';

type AuthResult<T>={data:T|null;error:{status?:number|undefined}|null};
export type AuthPort={
  getClaims:(token:string)=>Promise<AuthResult<{claims:unknown}>>;
  getUser:(token:string)=>Promise<AuthResult<{user:unknown}>>;
};
function object(value:unknown):Record<string,unknown> {
  return typeof value==='object'&&value!==null ? value as Record<string,unknown> : {};
}
function authError(error:{status?:number|undefined}):never {
  throw new DomainError(error.status && error.status>=400&&error.status<500 ? 'UNAUTHENTICATED':'DEPENDENCY_UNAVAILABLE',error.status && error.status>=400&&error.status<500 ? 401:503);
}
export function createActorVerifier(auth:AuthPort,issuer:string) {
  return async function verifyActor(accessToken:string,requestId:string):Promise<VerifiedActor> {
    try {
      const result=await auth.getClaims(accessToken);
      if(result.error) authError(result.error);
      const c=object(result.data?.claims);
      if(!UUIDSchema.safeParse(c.sub).success||!UUIDSchema.safeParse(c.session_id).success
        ||c.iss!==issuer||c.aud!=='authenticated'||typeof c.exp!=='number'||c.exp<=Date.now()/1000)
        throw new DomainError('UNAUTHENTICATED',401);
      const current=await auth.getUser(accessToken);
      if(current.error) authError(current.error);
      const user=object(current.data?.user);
      if(user.id!==c.sub||user.is_anonymous===true||typeof user.email_confirmed_at!=='string')
        throw new DomainError('UNAUTHENTICATED',401);
      return Object.freeze({userId:c.sub,sessionId:c.session_id,requestId}) as VerifiedActor;
    } catch(error) {
      if(error instanceof DomainError) throw error;
      const name=object(error).name;
      if(typeof name==='string'&&(/Jwt|JWT|AuthInvalid/.test(name))) throw new DomainError('UNAUTHENTICATED',401);
      throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
    }
  };
}
