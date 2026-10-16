import type { CreateReceiptInput,ReceiptDetail,ReceiptHeader,ReceiptItem,ConversionSnapshot,ReceiptLineInput } from '@donos/contracts';
import type { RestaurantContext,Tx } from './types.js';
import { DomainError } from './types.js';
import { canonicalNumeric } from './inventory-balance-repository.js';
const headerSelect=`h.id,h.supplier_id as "supplierId",h.supplier_name_snapshot as "supplierName",h.location_id as "locationId",to_char(h.document_date,'YYYY-MM-DD') as "documentDate",h.document_reference as "documentReference",case when r.id is not null then 'reversed' else h.status end as status,h.created_at as "createdAt",h.received_at as "receivedAt",r.id as "reversalId"`;
const headerJoin='from core.purchase_receipts h left join core.stock_reversals r on r.organization_id=h.organization_id and r.restaurant_id=h.restaurant_id and r.origin_receipt_id=h.id';
export function receiptHeader(r:Record<string,unknown>):ReceiptHeader{return {...r,createdAt:(r.createdAt as Date).toISOString(),receivedAt:r.receivedAt?(r.receivedAt as Date).toISOString():null} as ReceiptHeader;}
export function conversionFromRow(r:Record<string,unknown>):ConversionSnapshot{
 const unit=r.original_unit==='package'?{kind:'package' as const,conversionId:String(r.conversion_id)}:{kind:'standard' as const,code:r.original_unit as 'kg'|'g'|'L'|'mL'|'un'};
 return {ingredientId:String(r.ingredient_id),baseUnit:r.base_unit as 'kg'|'L'|'un',allowFractionalCount:r.allow_fractional_count as boolean,inputUnit:unit,factorToBase:canonicalNumeric(r.factor_to_base),conversionId:r.conversion_id as string|null,version:r.conversion_version as string|null,label:r.conversion_label as string|null};
}
export async function getReceipt(ctx:RestaurantContext,id:string,tx:Tx,lock=false):Promise<ReceiptDetail>{
 if(lock)await tx.query('select id from core.purchase_receipts where organization_id=$1 and restaurant_id=$2 and id=$3 for update',[ctx.organizationId,ctx.restaurantId,id]);
 const h=(await tx.query(`select ${headerSelect} ${headerJoin} where h.organization_id=$1 and h.restaurant_id=$2 and h.id=$3`,[ctx.organizationId,ctx.restaurantId,id])).rows[0];if(!h)throw new DomainError('RESOURCE_NOT_FOUND',404);
 const rows=(await tx.query('select * from core.purchase_receipt_items where organization_id=$1 and restaurant_id=$2 and receipt_id=$3 order by ingredient_id',[ctx.organizationId,ctx.restaurantId,id])).rows;
 const items:ReceiptItem[]=rows.map(r=>{const conversion=conversionFromRow(r);return {id:r.id as string,ingredientId:r.ingredient_id as string,ingredientName:r.ingredient_name_snapshot as string,quantity:canonicalNumeric(r.original_quantity),unit:conversion.inputUnit,unitPrice:canonicalNumeric(r.unit_price),...(r.zero_cost_reason?{zeroCostReason:r.zero_cost_reason as string}:{}),baseQuantity:canonicalNumeric(r.base_quantity),lineValue:canonicalNumeric(r.line_value),conversion};});
 return {...receiptHeader(h),items:items.map((item,index)=>({...item,...(rows[index]?.commitment_id?{commitmentId:String(rows[index]!.commitment_id)}:{})}))};
}
export type DraftItem={input:ReceiptLineInput;ingredientName:string;conversion:ConversionSnapshot;baseQuantity:string;lineValue:string};
export async function insertDraft(ctx:RestaurantContext,input:CreateReceiptInput,supplierName:string,items:DraftItem[],tx:Tx):Promise<ReceiptDetail>{
 const h=(await tx.query('insert into core.purchase_receipts(organization_id,restaurant_id,location_id,supplier_id,supplier_name_snapshot,document_date,document_reference,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',[ctx.organizationId,ctx.restaurantId,input.locationId,input.supplierId,supplierName,input.documentDate??null,input.documentReference??null,ctx.actor.userId])).rows[0]!;
 for(const item of items){const c=item.conversion;
  await tx.query('insert into core.purchase_receipt_items(organization_id,restaurant_id,receipt_id,ingredient_id,ingredient_name_snapshot,original_quantity,original_unit,unit_price,zero_cost_reason,conversion_id,conversion_label,conversion_version,factor_to_base,base_quantity,line_value,base_unit,allow_fractional_count,location_id,commitment_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',[ctx.organizationId,ctx.restaurantId,h.id,item.input.ingredientId,item.ingredientName,item.input.quantity,item.input.unit.kind==='standard'?item.input.unit.code:'package',item.input.unitPrice,item.input.zeroCostReason??null,c.conversionId,c.label,c.version,c.factorToBase,item.baseQuantity,item.lineValue,c.baseUnit,c.allowFractionalCount,input.locationId,item.input.commitmentId??null]);
 }
 return getReceipt(ctx,h.id as string,tx);
}
export async function markReceived(ctx:RestaurantContext,id:string,tx:Tx){
 const r=await tx.query("update core.purchase_receipts set status='received',received_by=$4,received_at=now() where organization_id=$1 and restaurant_id=$2 and id=$3 and status='draft'",[ctx.organizationId,ctx.restaurantId,id,ctx.actor.userId]);if(r.rowCount!==1)throw new DomainError('RESOURCE_CONFLICT',409);
}
export async function insertPriceHistory(ctx:RestaurantContext,itemId:string,movementId:string,tx:Tx){
 await tx.query(`insert into core.purchase_price_history(organization_id,restaurant_id,ingredient_id,supplier_id,supplier_name_snapshot,receipt_item_id,receipt_movement_id,posted_sequence,original_quantity,original_unit,unit_price,base_quantity,line_value,conversion_id,conversion_label,conversion_version,factor_to_base,base_unit,allow_fractional_count,document_date,location_id)
 select i.organization_id,i.restaurant_id,i.ingredient_id,h.supplier_id,h.supplier_name_snapshot,i.id,m.id,m.sequence,i.original_quantity,i.original_unit,i.unit_price,i.base_quantity,i.line_value,i.conversion_id,i.conversion_label,i.conversion_version,i.factor_to_base,i.base_unit,i.allow_fractional_count,h.document_date,i.location_id from core.purchase_receipt_items i join core.purchase_receipts h on h.organization_id=i.organization_id and h.restaurant_id=i.restaurant_id and h.id=i.receipt_id join core.stock_movements m on m.organization_id=i.organization_id and m.restaurant_id=i.restaurant_id and m.receipt_item_id=i.id where i.organization_id=$1 and i.restaurant_id=$2 and i.id=$3 and m.id=$4`,[ctx.organizationId,ctx.restaurantId,itemId,movementId]);
}
export async function listReceipts(ctx:RestaurantContext,q:{limit?:number|undefined;cursor?:string|undefined;status?:'draft'|'received'|'reversed'|undefined},tx:Tx){
 const rows=(await tx.query(`select ${headerSelect} ${headerJoin} where h.organization_id=$1 and h.restaurant_id=$2 and ($3::uuid is null or h.id>$3) and ($4::text is null or (case when r.id is not null then 'reversed' else h.status end)=$4) order by h.id limit $5`,[ctx.organizationId,ctx.restaurantId,q.cursor??null,q.status??null,(q.limit??50)+1])).rows;
 const items=rows.slice(0,q.limit??50).map(receiptHeader);return {items,nextCursor:rows.length>items.length?items.at(-1)!.id:null};
}
