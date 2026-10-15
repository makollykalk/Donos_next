import type { MovementCalculation,MovementKind,MovementResult,MovementDTO } from '@donos/contracts';
import type { RestaurantContext,Tx } from './types.js';
import { DomainError } from './types.js';
import { balanceDTO,valuationState,canonicalNumeric } from './inventory-balance-repository.js';
export function movementDTO(r:Record<string,unknown>):MovementDTO{
 const sequence=String(r.sequence);return {id:String(r.id),ingredientId:String(r.ingredient_id),kind:r.kind as MovementKind,sequence,before:valuationState(r,'before_',(BigInt(sequence)-1n).toString()),after:valuationState(r,'after_',sequence),origin:(r.reversal_of_id??r.receipt_item_id) as string|null,quantityDelta:canonicalNumeric(r.quantity_delta),valueDelta:canonicalNumeric(r.value_delta),reason:String(r.reason),actorUserId:String(r.actor_user_id),createdAt:(r.created_at as Date).toISOString(),receiptItemId:r.receipt_item_id as string|null,reversalId:r.reversal_id as string|null,policyVersion:'moving-average-cumulative-v1'};
}
export async function getMovement(ctx:RestaurantContext,id:string,tx:Tx):Promise<MovementDTO>{
 const row=(await tx.query('select * from core.stock_movements where organization_id=$1 and restaurant_id=$2 and id=$3',[ctx.organizationId,ctx.restaurantId,id])).rows[0];if(!row)throw new DomainError('RESOURCE_NOT_FOUND',404);return movementDTO(row);
}
export async function postMovement(ctx:RestaurantContext,id:string,calc:MovementCalculation,details:{kind:MovementKind;reason:string;key:string;receiptItemId?:string;reversalOfId?:string;reversalId?:string},tx:Tx):Promise<MovementResult>{
 const values=[ctx.organizationId,ctx.restaurantId,id,calc.after.sequence,details.kind,calc.quantityDelta,calc.valueDelta,...[calc.before,calc.after].flatMap(s=>[s.quantity,s.value,s.referenceQuantity,s.referenceValue,s.issuedQuantity]),details.reason,ctx.actor.userId,details.receiptItemId??null,details.reversalOfId??null,details.reversalId??null,details.key];
 const fields=['organization_id','restaurant_id','ingredient_id','sequence','kind','quantity_delta','value_delta',...['before','after'].flatMap(p=>['quantity','value','reference_quantity','reference_value','issued_quantity'].map(f=>`${p}_${f}`)),'reason','actor_user_id','receipt_item_id','reversal_of_id','reversal_id','command_key'];
 const m=(await tx.query(`insert into core.stock_movements(${fields.join(',')}) values(${values.map((_v,i)=>`$${i+1}`).join(',')}) returning id`,values)).rows[0]!;
 const s=calc.after;
 const r=await tx.query('update core.stock_balances set quantity=$4,value=$5,reference_quantity=$6,reference_value=$7,issued_quantity=$8,sequence=$9,last_movement_id=$10 where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 returning *',[ctx.organizationId,ctx.restaurantId,id,s.quantity,s.value,s.referenceQuantity,s.referenceValue,s.issuedQuantity,s.sequence,m.id]);
 if(r.rowCount!==1)throw new DomainError('DEPENDENCY_UNAVAILABLE',503);return {movementId:m.id as string,balance:balanceDTO(r.rows[0]!)};
}
