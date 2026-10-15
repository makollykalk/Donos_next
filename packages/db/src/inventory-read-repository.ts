import type { CatalogQuery,SequenceQuery,PriceHistoryDTO } from '@donos/contracts';
import type { RestaurantContext,Tx } from './types.js';
import { balanceDTO,canonicalNumeric } from './inventory-balance-repository.js';
import { movementDTO } from './inventory-ledger-repository.js';
import { requireIngredient } from './inventory-catalog-repository.js';
import { conversionFromRow } from './purchase-repository.js';
export async function listBalances(ctx:RestaurantContext,q:CatalogQuery,tx:Tx){
 const r=(await tx.query(`with all_balances as(select b.* from core.stock_balances b where b.organization_id=$1 and b.restaurant_id=$2), page as(
 select b.ingredient_id,b.last_movement_id,b.quantity::text,b.value::text,b.reference_quantity::text,b.reference_value::text,b.issued_quantity::text,b.sequence::text
 from all_balances b join core.ingredients i on i.organization_id=b.organization_id and i.restaurant_id=b.restaurant_id and i.id=b.ingredient_id where ($3::uuid is null or b.ingredient_id>$3) and($4 or not i.archived) order by b.ingredient_id limit $5)
 select coalesce((select sum(value) from all_balances),0)::text as total,coalesce((select jsonb_agg(to_jsonb(page) order by ingredient_id) from page),'[]'::jsonb) as items`,[ctx.organizationId,ctx.restaurantId,q.cursor??null,q.includeArchived??false,(q.limit??50)+1])).rows[0]!;
 const rows=r.items as Record<string,unknown>[],items=rows.slice(0,q.limit??50).map(balanceDTO);return {items,totalValue:canonicalNumeric(r.total),nextCursor:rows.length>items.length?items.at(-1)!.ingredientId:null};
}
async function watermark(ctx:RestaurantContext,id:string,q:SequenceQuery,tx:Tx):Promise<string>{
 await requireIngredient(ctx,id,tx,false,false);
 return q.highWatermark??String((await tx.query('select coalesce(max(sequence),0)::text as seq from core.stock_movements where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3',[ctx.organizationId,ctx.restaurantId,id])).rows[0]!.seq);
}
export async function listMovements(ctx:RestaurantContext,id:string,q:SequenceQuery,tx:Tx){
 const highWatermark=await watermark(ctx,id,q,tx);
 const rows=(await tx.query('select * from core.stock_movements where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 and sequence<=$4 and($5::bigint is null or sequence<$5) order by sequence desc limit $6',[ctx.organizationId,ctx.restaurantId,id,highWatermark,q.beforeSequence??null,(q.limit??50)+1])).rows;
 const items=rows.slice(0,q.limit??50).map(movementDTO);return {items,highWatermark,nextCursor:rows.length>items.length?items.at(-1)!.sequence:null};
}
export async function listPriceHistory(ctx:RestaurantContext,id:string,q:SequenceQuery&{supplierId?:string|undefined},tx:Tx){
 const highWatermark=await watermark(ctx,id,q,tx);
 const rows=(await tx.query(`select p.*,to_char(p.document_date,'YYYY-MM-DD') as document_date_text,r.id as reversal_id from core.purchase_price_history p left join core.stock_movements m on m.organization_id=p.organization_id and m.restaurant_id=p.restaurant_id and m.reversal_of_id=p.receipt_movement_id left join core.stock_reversals r on r.organization_id=m.organization_id and r.restaurant_id=m.restaurant_id and r.id=m.reversal_id where p.organization_id=$1 and p.restaurant_id=$2 and p.ingredient_id=$3 and p.posted_sequence<=$4 and($5::bigint is null or p.posted_sequence<$5) and($6::uuid is null or p.supplier_id=$6) order by p.posted_sequence desc limit $7`,[ctx.organizationId,ctx.restaurantId,id,highWatermark,q.beforeSequence??null,q.supplierId??null,(q.limit??50)+1])).rows;
 const items:PriceHistoryDTO[]=rows.slice(0,q.limit??50).map(r=>{const conversion=conversionFromRow(r),lineValue=canonicalNumeric(r.line_value),baseQuantity=canonicalNumeric(r.base_quantity);return {id:r.id as string,ingredientId:id,supplierId:r.supplier_id as string,supplierName:r.supplier_name_snapshot as string,receiptItemId:r.receipt_item_id as string,movementId:r.receipt_movement_id as string,sequence:r.posted_sequence as string,documentDate:r.document_date_text as string|null,postedAt:(r.posted_at as Date).toISOString(),originalQuantity:canonicalNumeric(r.original_quantity),originalUnit:conversion.inputUnit,unitPrice:canonicalNumeric(r.unit_price),baseQuantity,lineValue,conversion,normalizedPrice:{numerator:lineValue,denominator:baseQuantity},reversalId:r.reversal_id as string|null};});
 return {items,highWatermark,nextCursor:rows.length>items.length?items.at(-1)!.sequence:null};
}
