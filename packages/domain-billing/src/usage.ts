import { IntegerStringSchema,UUIDSchema } from '@donos/contracts';
import type { FeatureKey } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { RestaurantContext,Tx } from '@donos/db';
import { requireEntitlement } from './entitlements.js';
export type Reservation={id:string;status:'reserved'|'settled'|'released'|'pending_reconciliation';maxUnits:string;actualUnits:string|null};
type Raw={id:string;status:Reservation['status'];max_units:string;actual_units:string|null;restaurant_id:string;meter_key:FeatureKey;period_start:string;request_hash:string;dispatched_at:Date|null};
const columns='id,status,max_units::text,actual_units::text,restaurant_id,meter_key,period_start::text,request_hash,dispatched_at';
function dto(r:Raw):Reservation{return {id:r.id,status:r.status,maxUnits:r.max_units,actualUnits:r.actual_units};}
function units(value:string,positive=false):bigint {
  if(!IntegerStringSchema.safeParse(value).success || (positive&&value==='0')) throw new DomainError('VALIDATION_ERROR',400);
  return BigInt(value);
}
async function lock(ctx:RestaurantContext,tx:Tx):Promise<void> {
  // One lock order for reserve/settle/release across all units and periods of an org.
  await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`donos-usage:${ctx.organizationId}`]);
}
async function load(ctx:RestaurantContext,id:string,tx:Tx):Promise<Raw> {
  const row=(await tx.query<Raw>(`select ${columns} from core.usage_reservations where organization_id=$1 and restaurant_id=$2 and id=$3 for update`,[ctx.organizationId,ctx.restaurantId,id])).rows[0];
  if(!row) throw new DomainError('RESOURCE_NOT_FOUND',404);return row;
}
async function reserveCommand(ctx:RestaurantContext,input:{feature:FeatureKey;operationKey:string;requestHash:string;maxUnits:string},tx:Tx):Promise<{reservation:Reservation;created:boolean}> {
  const max=units(input.maxUnits,true);
  if(!['ai_photo','ai_voice','ai_text_whatsapp'].includes(input.feature)||!UUIDSchema.safeParse(input.operationKey).success||!/^[a-f0-9]{64}$/.test(input.requestHash)) throw new DomainError('VALIDATION_ERROR',400);
  await lock(ctx,tx); await requireEntitlement(ctx,input.feature,tx);
  const existing=(await tx.query<Raw>(`select ${columns} from core.usage_reservations where organization_id=$1 and operation_key=$2`,[ctx.organizationId,input.operationKey])).rows[0];
  if(existing) {
    if(existing.request_hash!==input.requestHash||existing.restaurant_id!==ctx.restaurantId||existing.meter_key!==input.feature||existing.max_units!==input.maxUnits) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
    return {reservation:dto(existing),created:false};
  }
  const buckets=(await tx.query('select period_start::text,limit_units::text,reserved_units::text,settled_units::text from core.usage_buckets where organization_id=$1 and meter_key=$2 and period_start<=now() and now()<period_end for update',[ctx.organizationId,input.feature])).rows;
  if(buckets.length!==1) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
  const b=buckets[0]!;
  const created=(await tx.query<Raw>(`insert into core.usage_reservations(organization_id,restaurant_id,meter_key,period_start,operation_key,request_hash,max_units) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning ${columns}`,[ctx.organizationId,ctx.restaurantId,input.feature,b.period_start,input.operationKey,input.requestHash,input.maxUnits])).rows[0];
  if(!created) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
  if(BigInt(b.reserved_units)+BigInt(b.settled_units)+max>BigInt(b.limit_units)) throw new DomainError('QUOTA_EXCEEDED',429);
  const changed=await tx.query('update core.usage_buckets set reserved_units=reserved_units+$4::bigint where organization_id=$1 and meter_key=$2 and period_start=$3',[ctx.organizationId,input.feature,b.period_start,input.maxUnits]);
  if(changed.rowCount!==1) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
  await ledger(ctx,created.id,'reserve',input.maxUnits,tx);
  return {reservation:dto(created),created:true};
}
async function ledger(ctx:RestaurantContext,id:string,event:string,value:string,tx:Tx):Promise<void> {
  await tx.query('insert into core.usage_ledger(organization_id,reservation_id,event_kind,units) values($1,$2,$3,$4)',[ctx.organizationId,id,event,value]);
}
async function settleCommand(ctx:RestaurantContext,id:string,actualUnits:string,tx:Tx):Promise<Reservation> {
  const actual=units(actualUnits); await lock(ctx,tx);const r=await load(ctx,id,tx);
  if(r.status==='settled'&&r.actual_units===actualUnits) return dto(r);
  if(!['reserved','pending_reconciliation'].includes(r.status)||actual>BigInt(r.max_units)) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
  const changed=await tx.query('update core.usage_buckets set reserved_units=reserved_units-$4::bigint,settled_units=settled_units+$5::bigint where organization_id=$1 and meter_key=$2 and period_start=$3',[ctx.organizationId,r.meter_key,r.period_start,r.max_units,actualUnits]);
  if(changed.rowCount!==1) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
  const row=(await tx.query<Raw>(`update core.usage_reservations set status='settled',actual_units=$3 where organization_id=$1 and id=$2 returning ${columns}`,[ctx.organizationId,id,actualUnits])).rows[0]!;
  await ledger(ctx,id,'settle',actualUnits,tx);return dto(row);
}
async function releaseCommand(ctx:RestaurantContext,id:string,_reason:'NOT_DISPATCHED',tx:Tx):Promise<Reservation> {
  await lock(ctx,tx);const r=await load(ctx,id,tx);
  if(r.status==='released') return dto(r);
  if(r.status!=='reserved'||r.dispatched_at) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
  const changed=await tx.query('update core.usage_buckets set reserved_units=reserved_units-$4::bigint where organization_id=$1 and meter_key=$2 and period_start=$3',[ctx.organizationId,r.meter_key,r.period_start,r.max_units]);
  if(changed.rowCount!==1) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
  const row=(await tx.query<Raw>(`update core.usage_reservations set status='released' where organization_id=$1 and id=$2 returning ${columns}`,[ctx.organizationId,id])).rows[0]!;
  await ledger(ctx,id,'release',r.max_units,tx);return dto(row);
}
async function dispatchCommand(ctx:RestaurantContext,id:string,tx:Tx):Promise<Reservation> {
  await lock(ctx,tx);const r=await load(ctx,id,tx);
  if(r.status!=='reserved'||r.dispatched_at) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
  await requireEntitlement(ctx,r.meter_key,tx);
  const row=(await tx.query<Raw>(`update core.usage_reservations set dispatched_at=now() where organization_id=$1 and id=$2 returning ${columns}`,[ctx.organizationId,id])).rows[0]!; return dto(row);
}
async function unknownCommand(ctx:RestaurantContext,id:string,tx:Tx):Promise<Reservation> {
  await lock(ctx,tx);const r=await load(ctx,id,tx);
  if(r.status==='pending_reconciliation') return dto(r);
  if(r.status!=='reserved'||!r.dispatched_at) throw new DomainError('IDEMPOTENCY_CONFLICT',409);
  const row=(await tx.query<Raw>(`update core.usage_reservations set status='pending_reconciliation' where organization_id=$1 and id=$2 returning ${columns}`,[ctx.organizationId,id])).rows[0]!;return dto(row);
}
async function atomic<T>(tx:Tx,fn:()=>Promise<T>):Promise<T> {
  await tx.query('savepoint usage_command');
  try {const result=await fn();await tx.query('release savepoint usage_command');return result;}
  catch(error){await tx.query('rollback to savepoint usage_command');await tx.query('release savepoint usage_command');throw error;}
}
export const reserveUsage:typeof reserveCommand=(ctx,input,tx)=>atomic(tx,()=>reserveCommand(ctx,input,tx));
export const settleUsage:typeof settleCommand=(ctx,id,actual,tx)=>atomic(tx,()=>settleCommand(ctx,id,actual,tx));
export const releaseUsage:typeof releaseCommand=(ctx,id,reason,tx)=>atomic(tx,()=>releaseCommand(ctx,id,reason,tx));
export const markUsageDispatched:typeof dispatchCommand=(ctx,id,tx)=>atomic(tx,()=>dispatchCommand(ctx,id,tx));
export const markUsageUnknown:typeof unknownCommand=(ctx,id,tx)=>atomic(tx,()=>unknownCommand(ctx,id,tx));
