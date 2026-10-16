import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { ContextSelection } from '@donos/contracts';
import { DomainError } from './types.js';
import type { Tx, VerifiedActor, OrganizationContext, RestaurantContext } from './types.js';

export function createDatabase(pool:pg.Pool) {
  async function withActorTx<T>(actor:VerifiedActor,fn:(tx:Tx)=>Promise<T>,allowRevoked=false):Promise<T> {
    const client=await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.user_id',$1,true),set_config('app.session_id',$2,true),set_config('app.organization_id','',true),set_config('app.restaurant_id','',true)",[actor.userId,actor.sessionId]);
      const tx:Tx={query:(text,values)=>client.query(text,values ? [...values] : [])};
      if(!allowRevoked && (await tx.query('select 1 from core.session_revocations where user_id=$1 and session_id=$2',[actor.userId,actor.sessionId])).rowCount)
        throw new DomainError('UNAUTHENTICATED',401);
      const result=await fn(tx);
      await client.query('commit'); return result;
    } catch(error) { await client.query('rollback').catch(()=>undefined); throw error; }
    finally {client.release();}
  }
  async function setOrganization(actor:VerifiedActor,id:string,tx:Tx):Promise<OrganizationContext> {
    if(!(await tx.query('select id from core.organizations where id=$1 and owner_user_id=$2',[id,actor.userId])).rowCount)
      throw new DomainError('RESOURCE_NOT_FOUND',404);
    await tx.query("select set_config('app.organization_id',$1,true)",[id]);
    return Object.freeze({actor,organizationId:id});
  }
  async function withOrganizationTx<T>(actor:VerifiedActor,id:string,fn:(ctx:OrganizationContext,tx:Tx)=>Promise<T>):Promise<T> {
    return withActorTx(actor,async tx=>fn(await setOrganization(actor,id,tx),tx));
  }
  async function withRestaurantTx<T>(actor:VerifiedActor,selection:ContextSelection,token:string,fn:(ctx:RestaurantContext,tx:Tx)=>Promise<T>):Promise<T> {
    return withActorTx(actor,async tx=>{
      if(!/^[a-f0-9]{64}$/.test(token)) throw new DomainError('CONTEXT_MISMATCH',409);
      const hash=createHash('sha256').update(token).digest('hex');
      const result=await tx.query('select organization_id,restaurant_id,expires_at>now() as valid from core.request_contexts where token_hash=$1 and user_id=$2 and session_id=$3',[hash,actor.userId,actor.sessionId]);
      const row=result.rows[0];
      if(!row) throw new DomainError('CONTEXT_MISMATCH',409);
      if(!row.valid) throw new DomainError('CONTEXT_EXPIRED',409);
      if(row.organization_id!==selection.organizationId||row.restaurant_id!==selection.restaurantId) throw new DomainError('CONTEXT_MISMATCH',409);
      const org=await setOrganization(actor,selection.organizationId,tx);
      await tx.query("select set_config('app.restaurant_id',$1,true)",[selection.restaurantId]);
      if(!(await tx.query('select id from core.restaurants where organization_id=$1 and id=$2',[selection.organizationId,selection.restaurantId])).rowCount) throw new DomainError('RESOURCE_NOT_FOUND',404);
      return fn(Object.freeze({...org,restaurantId:selection.restaurantId}),tx);
    });
  }
  return {withActorTx,withOrganizationTx,withRestaurantTx,setOrganization};
}
export type Database=ReturnType<typeof createDatabase>;
