import { createHash } from 'node:crypto';
import type { Tx,VerifiedActor,OrganizationContext } from './types.js';
import { DomainError } from './types.js';
export type IdempotencyScope={kind:'actor';actor:VerifiedActor}|{kind:'organization';context:OrganizationContext};
export function canonicalHash(input:unknown):string {
  return createHash('sha256').update(JSON.stringify(input,(_key,value:unknown)=>{
    if(value&&typeof value==='object'&&!Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
    return value;
  })).digest('hex');
}
export async function retryIdempotent<T>(fn:()=>Promise<T>):Promise<T> {
  for(let attempt=0;;attempt++) {
    try {return await fn();} catch(error) {
      const code=typeof error==='object'&&error!==null&&'code' in error ? error.code : undefined;
      if(code!=='40001'&&code!=='40P01') throw error;
      if(attempt>=2) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
    }
  }
}
export async function executeIdempotent<T>(scope:IdempotencyScope,operation:string,key:string,input:unknown,tx:Tx,fn:()=>Promise<T>):Promise<T> {
  const actor=scope.kind==='actor' ? scope.actor : scope.context.actor;
  const org=scope.kind==='actor' ? null : scope.context.organizationId;
  const id=org??actor.userId;
  const hash=canonicalHash({operation,scope:scope.kind,id,input});
  const values=[scope.kind,id,operation,key];
  const inserted=await tx.query('insert into core.idempotency_records(scope_kind,scope_id,operation,key,actor_user_id,organization_id,request_hash) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning key',[...values,actor.userId,org,hash]);
  if(!inserted.rowCount) {
    const row=(await tx.query('select request_hash,response_json from core.idempotency_records where scope_kind=$1 and scope_id=$2 and operation=$3 and key=$4',values)).rows[0];
    if(!row||row.request_hash!==hash||row.response_json===null) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
    return row.response_json as T;
  }
  const result=await fn();
  await tx.query('update core.idempotency_records set response_json=$5 where scope_kind=$1 and scope_id=$2 and operation=$3 and key=$4',[...values,JSON.stringify(result)]);
  return result;
}
