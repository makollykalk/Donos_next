import type { MovementDTO,StockBalance } from '@donos/contracts';
import type { RestaurantContext,Tx } from '@donos/db';
import { DomainError,postMovement } from '@donos/db';
import { calculateEligibleReversal } from './valuation.js';
export async function assertReversible(ctx:RestaurantContext,m:MovementDTO,b:StockBalance,tx:Tx){
 if((await tx.query('select 1 from core.stock_movements where organization_id=$1 and restaurant_id=$2 and reversal_of_id=$3',[ctx.organizationId,ctx.restaurantId,m.id])).rowCount)throw new DomainError('REVERSAL_ALREADY_APPLIED',409);
 if(m.kind==='REVERSAL'||b.lastMovementId!==m.id)throw new DomainError('REVERSAL_REQUIRES_REVALUATION',409);
}
export async function compensate(ctx:RestaurantContext,m:MovementDTO,b:StockBalance,reversalId:string,reason:string,key:string,tx:Tx){
 return postMovement(ctx,m.ingredientId,calculateEligibleReversal(b,m),{kind:'REVERSAL',reversalOfId:m.id,reversalId,reason,key},tx);
}
