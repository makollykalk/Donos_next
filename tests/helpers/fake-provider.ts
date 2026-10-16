import { markUsageDispatched,markUsageUnknown,reserveUsage,settleUsage } from '../../packages/domain-billing/src/usage.js';
import type { Reservation } from '../../packages/domain-billing/src/usage.js';
import type { Database,VerifiedActor } from '../../packages/db/src/index.js';
import type { SelectedContext } from '@donos/contracts';
// Tests only. No provider SDK, paid call or product endpoint.
export async function runFakeOperation(db:Database,actor:VerifiedActor,selection:SelectedContext,input:Parameters<typeof reserveUsage>[1],fake:()=>Promise<string>):Promise<Reservation> {
  const run=<T>(fn:Parameters<typeof db.withRestaurantTx<T>>[3])=>db.withRestaurantTx(actor,selection,selection.token,fn);
  const result=await run((ctx,tx)=>reserveUsage(ctx,input,tx));
  if(!result.created)return result.reservation;
  // Persist dispatch marker and revalidate entitlement before calling fake.
  await run((ctx,tx)=>markUsageDispatched(ctx,result.reservation.id,tx));
  let actual:string;
  try{actual=await fake();}catch{return run((ctx,tx)=>markUsageUnknown(ctx,result.reservation.id,tx));}
  return run((ctx,tx)=>settleUsage(ctx,result.reservation.id,actual,tx));
}
