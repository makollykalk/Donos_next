import type { IssueInput } from '@donos/contracts';
import type { RestaurantContext,Tx } from '@donos/db';
import { inventoryCatalog as catalog,lockBalance,postMovement } from '@donos/db';
import { calculateIssue } from './valuation.js';
import { normalizeQuantity } from './units.js';
export async function issueStock(ctx:RestaurantContext,input:IssueInput,key:string,tx:Tx){
 const i=await catalog.requireIngredient(ctx,input.ingredientId,tx,true),c=await catalog.resolveConversion(ctx,i,input.unit,tx);
 const q=normalizeQuantity(input.quantity,input.unit,c),b=await lockBalance(ctx,i.id,input.locationId,tx);
 return postMovement(ctx,i.id,input.locationId,calculateIssue(b,q),{kind:'ISSUE',reason:input.reason,key},tx);
}
