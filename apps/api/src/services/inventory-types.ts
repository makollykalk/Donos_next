import type { VerifiedActor } from '@donos/db';
import type { ContextSelection,CreateIngredientInput,PatchIngredientInput,CreateSupplierInput,PatchSupplierInput,CreateConversionInput,CreateReceiptInput,IssueInput,ReversalInput,CatalogQuery,SequenceQuery,Ingredient,Supplier,ConversionVersion,ReceiptDetail,ReceiptHeader,ReceiptPosted,MovementResult,StockBalance,MovementDTO,PriceHistoryDTO,Page,SequencePage,StockLocation,CreateStockLocationInput,PatchStockLocationInput } from '@donos/contracts';
type Args=[actor:VerifiedActor,selection:ContextSelection,contextToken:string];
export interface InventoryService {
 listLocations(...args:Args):Promise<{items:StockLocation[]}>;
 createLocation(...args:[...Args,input:CreateStockLocationInput,key:string]):Promise<StockLocation>;
 patchLocation(...args:[...Args,locationId:string,input:PatchStockLocationInput,key:string]):Promise<StockLocation>;
 createIngredient(...args:[...Args,input:CreateIngredientInput,key:string]):Promise<Ingredient>;
 patchIngredient(...args:[...Args,ingredientId:string,input:PatchIngredientInput,key:string]):Promise<Ingredient>;
 createSupplier(...args:[...Args,input:CreateSupplierInput,key:string]):Promise<Supplier>;
 patchSupplier(...args:[...Args,supplierId:string,input:PatchSupplierInput,key:string]):Promise<Supplier>;
 createConversion(...args:[...Args,ingredientId:string,input:CreateConversionInput,key:string]):Promise<ConversionVersion>;
 createReceipt(...args:[...Args,input:CreateReceiptInput,key:string]):Promise<ReceiptDetail>;
 receiveReceipt(...args:[...Args,receiptId:string,input:{receivedConfirmed:true},key:string]):Promise<ReceiptPosted>;
 issue(...args:[...Args,input:IssueInput,key:string]):Promise<MovementResult>;
 reverseIssue(...args:[...Args,movementId:string,input:ReversalInput,key:string]):Promise<MovementResult>;
 reverseReceipt(...args:[...Args,receiptId:string,input:ReversalInput,key:string]):Promise<{reversalId:string;movements:MovementResult[]}>;
 listIngredients(...args:[...Args,query:CatalogQuery]):Promise<Page<Ingredient>>;
 listSuppliers(...args:[...Args,query:CatalogQuery]):Promise<Page<Supplier>>;
 listConversions(...args:[...Args,ingredientId:string]):Promise<{items:ConversionVersion[]}>;
 getReceipt(...args:[...Args,receiptId:string]):Promise<ReceiptDetail>;
 listReceipts(...args:[...Args,query:CatalogQuery&{status?:'draft'|'received'|'reversed'|undefined}]):Promise<Page<ReceiptHeader>>;
 listBalances(...args:[...Args,query:CatalogQuery&{locationId:string}]):Promise<Page<StockBalance>&{totalValue:string}>;
 listMovements(...args:[...Args,ingredientId:string,query:SequenceQuery]):Promise<SequencePage<MovementDTO>>;
 listPriceHistory(...args:[...Args,ingredientId:string,query:SequenceQuery&{supplierId?:string|undefined}]):Promise<SequencePage<PriceHistoryDTO>>;
}
