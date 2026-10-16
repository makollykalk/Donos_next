import type { VerifiedActor } from '@donos/db';
import type { ContextSelection,SetStockThresholdInput,StockThreshold,ShoppingList,UpdateShoppingListItemInput,ConfirmShoppingCommitmentInput,CancelShoppingCommitmentInput,ShoppingCommitment,ShoppingListQuery } from '@donos/contracts';
type Args=[actor:VerifiedActor,selection:ContextSelection,contextToken:string];
export interface ShoppingService {
 setThreshold(...args:[...Args,ingredientId:string,input:SetStockThresholdInput,key:string]):Promise<StockThreshold>;
 listThresholds(...args:[...Args,locationId:string]):Promise<{items:unknown[]}>;
 generateList(...args:[...Args,locationId:string,key:string]):Promise<ShoppingList>;
 listLists(...args:[...Args,query:ShoppingListQuery]):Promise<{items:ShoppingList[];nextCursor:string|null}>;
 getList(...args:[...Args,listId:string]):Promise<ShoppingList>;
 updateItem(...args:[...Args,listId:string,itemId:string,input:UpdateShoppingListItemInput,key:string]):Promise<ShoppingList>;
 confirmCommitment(...args:[...Args,listId:string,itemId:string,input:ConfirmShoppingCommitmentInput,key:string]):Promise<ShoppingCommitment>;
 cancelCommitment(...args:[...Args,commitmentId:string,input:CancelShoppingCommitmentInput,key:string]):Promise<ShoppingCommitment>;
 exportList(...args:[...Args,listId:string]):Promise<string>;
}
