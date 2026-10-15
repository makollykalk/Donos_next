import type { ValuationState,StockBalance } from '@donos/contracts';
import type { RestaurantContext,Tx } from './types.js';
import { DomainError } from './types.js';
export function canonicalNumeric(value:unknown):string {
 if(typeof value!=='string'||! /^-?[0-9]+(?:\.[0-9]+)?$/u.test(value))throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
 const v=value.includes('.')?value.replace(/0+$/u,'').replace(/\.$/u,''):value;return v==='-0'?'0':v;
}
export function valuationState(row:Record<string,unknown>,prefix='',sequence?:string):ValuationState{
 return {quantity:canonicalNumeric(row[`${prefix}quantity`]),value:canonicalNumeric(row[`${prefix}value`]),referenceQuantity:canonicalNumeric(row[`${prefix}reference_quantity`]),referenceValue:canonicalNumeric(row[`${prefix}reference_value`]),issuedQuantity:canonicalNumeric(row[`${prefix}issued_quantity`]),sequence:sequence??String(row.sequence)};
}
export function balanceDTO(row:Record<string,unknown>):StockBalance{
 const s=valuationState(row);return {...s,ingredientId:String(row.ingredient_id),lastMovementId:row.last_movement_id as string|null,averageCostRatio:s.quantity==='0'?null:{numerator:s.referenceValue,denominator:s.referenceQuantity}};
}
export async function lockBalance(ctx:RestaurantContext,id:string,tx:Tx):Promise<StockBalance>{
 const row=(await tx.query('select * from core.stock_balances where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 for update',[ctx.organizationId,ctx.restaurantId,id])).rows[0];
 if(!row)throw new DomainError('RESOURCE_NOT_FOUND',404);return balanceDTO(row);
}
