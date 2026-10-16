import type { Database,VerifiedActor } from '@donos/db';
export async function revokeSession(db:Database,actor:VerifiedActor):Promise<void> {
  await db.withActorTx(actor,async tx=>{
    await tx.query('insert into core.session_revocations(user_id,session_id) values($1,$2) on conflict do nothing',[actor.userId,actor.sessionId]);
  },true);
}
