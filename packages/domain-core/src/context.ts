import { randomBytes,createHash } from 'node:crypto';
import type { ContextSelection,SelectedContext } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { Database,VerifiedActor } from '@donos/db';
export function createCore(db:Database) {
  async function selectContext(actor:VerifiedActor,input:ContextSelection):Promise<SelectedContext> {
    return db.withOrganizationTx(actor,input.organizationId,async(_ctx,tx)=>{
      if(!(await tx.query('select id from core.restaurants where organization_id=$1 and id=$2',[input.organizationId,input.restaurantId])).rowCount)
        throw new DomainError('RESOURCE_NOT_FOUND',404);
      const token=randomBytes(32).toString('hex');
      const row=(await tx.query('insert into core.request_contexts(user_id,session_id,organization_id,restaurant_id,token_hash) values($1,$2,$3,$4,$5) returning expires_at',
        [actor.userId,actor.sessionId,input.organizationId,input.restaurantId,createHash('sha256').update(token).digest('hex')])).rows[0];
      if(!row) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
      await tx.query("select set_config('app.restaurant_id',$1,true)",[input.restaurantId]);
      await tx.query("insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id) values($1,$2,$3,'context.selected',$2,$4)",[input.organizationId,input.restaurantId,actor.userId,actor.requestId]);
      return {...input,token,expiresAt:(row.expires_at as Date).toISOString()};
    });
  }
  return {selectContext};
}
