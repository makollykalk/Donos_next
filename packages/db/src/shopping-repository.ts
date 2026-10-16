import type { RestaurantContext, Tx } from './types.js';
import type { SetStockThresholdInput, StockThreshold, ShoppingList, ShoppingListItem, UpdateShoppingListItemInput,ConfirmShoppingCommitmentInput,CancelShoppingCommitmentInput,ShoppingCommitment } from '@donos/contracts';
import { DomainError } from './types.js';
import { canonicalNumeric } from './inventory-balance-repository.js';

type Row = Record<string, unknown>;
const thresholdColumns = `t.id,t.organization_id as "organizationId",t.restaurant_id as "restaurantId",t.location_id as "locationId",t.ingredient_id as "ingredientId",t.base_unit as "baseUnit",t.minimum_quantity::text as "minimumQuantity",t.target_quantity::text as "targetQuantity",t.updated_at as "updatedAt"`;

export async function setThreshold(ctx: RestaurantContext, ingredientId: string, input: SetStockThresholdInput, tx: Tx): Promise<StockThreshold> {
  const ingredient = (await tx.query<Row>('select base_unit from core.ingredients where organization_id=$1 and restaurant_id=$2 and id=$3 and not archived', [ctx.organizationId, ctx.restaurantId, ingredientId])).rows[0];
  if (!ingredient) throw new DomainError('RESOURCE_NOT_FOUND', 404);
  const result = await tx.query<StockThreshold>(`insert into core.stock_thresholds as t(organization_id,restaurant_id,location_id,ingredient_id,base_unit,minimum_quantity,target_quantity,created_by,updated_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$8) on conflict(organization_id,restaurant_id,location_id,ingredient_id)
    do update set minimum_quantity=excluded.minimum_quantity,target_quantity=excluded.target_quantity,updated_by=excluded.updated_by
    returning ${thresholdColumns}`,
    [ctx.organizationId,ctx.restaurantId,input.locationId,ingredientId,ingredient.base_unit,input.minimumQuantity,input.targetQuantity,ctx.actor.userId]);
  return {...result.rows[0]!,minimumQuantity:canonicalNumeric(result.rows[0]!.minimumQuantity),targetQuantity:canonicalNumeric(result.rows[0]!.targetQuantity),updatedAt:new Date(result.rows[0]!.updatedAt).toISOString()};
}

export async function listThresholds(ctx: RestaurantContext, locationId: string, tx: Tx) {
  const rows=(await tx.query<Row>(`select ${thresholdColumns},i.name as "ingredientName",coalesce(b.quantity,0)::text as "balanceQuantity",coalesce(b.quantity,0)<=t.minimum_quantity as critical,coalesce(b.sequence,0)::text as "ledgerSequence"
    from core.stock_thresholds t join core.ingredients i on i.organization_id=t.organization_id and i.restaurant_id=t.restaurant_id and i.id=t.ingredient_id
    left join core.stock_balances b on b.organization_id=t.organization_id and b.restaurant_id=t.restaurant_id and b.location_id=t.location_id and b.ingredient_id=t.ingredient_id
    where t.organization_id=$1 and t.restaurant_id=$2 and t.location_id=$3 and not i.archived order by i.name,i.id`,[ctx.organizationId,ctx.restaurantId,locationId])).rows;
  return {items:rows.map(r=>({...r,minimumQuantity:canonicalNumeric(r.minimumQuantity),targetQuantity:canonicalNumeric(r.targetQuantity),balanceQuantity:canonicalNumeric(r.balanceQuantity),critical:Boolean(r.critical),ledgerSequence:String(r.ledgerSequence),updatedAt:new Date(r.updatedAt as Date).toISOString()}))};
}

export async function generationSnapshot(ctx: RestaurantContext, locationId: string, tx: Tx) {
  const result=(await tx.query<Row>(`with scope as(select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 and not archived),
    ledger as(select coalesce(max(sequence),0)::text as sequence from core.stock_movements where organization_id=$1 and restaurant_id=$2 and location_id=$3),
    needs as(select t.ingredient_id as "ingredientId",i.name as "ingredientName",i.base_unit as "baseUnit",i.allow_fractional_count as "allowFractionalCount",
      t.minimum_quantity::text as "minimumQuantity",t.target_quantity::text as "targetQuantity",coalesce(b.quantity,0)::text as "balanceQuantity",
      coalesce(c.pending,0)::text as "committedPendingQuantity",ic.id as "conversionId",ic.label as "conversionLabel",ic.version as "conversionVersion",ic.factor_to_base::text as "factorToBase",
      p.supplier_id as "supplierId",p.supplier_name_snapshot as "supplierName",p.line_value::text as "lineValue",p.base_quantity::text as "baseQuantity",p.posted_at as "postedAt",p.document_date as "documentDate"
    from core.stock_thresholds t join core.ingredients i on i.organization_id=t.organization_id and i.restaurant_id=t.restaurant_id and i.id=t.ingredient_id
    left join core.stock_balances b on b.organization_id=t.organization_id and b.restaurant_id=t.restaurant_id and b.location_id=t.location_id and b.ingredient_id=t.ingredient_id
    left join lateral(select sum(remaining_base_quantity) pending from core.shopping_commitments where organization_id=t.organization_id and restaurant_id=t.restaurant_id and location_id=t.location_id and ingredient_id=t.ingredient_id and status='confirmed') c on true
    left join lateral(select v.id,v.label,v.version,v.factor_to_base from core.ingredient_conversions v where v.organization_id=t.organization_id and v.restaurant_id=t.restaurant_id and v.ingredient_id=t.ingredient_id
      and not exists(select 1 from core.ingredient_conversions newer where newer.organization_id=v.organization_id and newer.restaurant_id=v.restaurant_id and newer.ingredient_id=v.ingredient_id and newer.label=v.label and newer.version>v.version)
      order by v.factor_to_base,v.label,v.id limit 1) ic on true
    left join lateral(select h.supplier_id,h.supplier_name_snapshot,ph.line_value,ph.base_quantity,ph.posted_at,h.document_date from core.purchase_price_history ph
      join core.purchase_receipt_items ri on ri.organization_id=ph.organization_id and ri.restaurant_id=ph.restaurant_id and ri.id=ph.receipt_item_id
      join core.purchase_receipts h on h.organization_id=ri.organization_id and h.restaurant_id=ri.restaurant_id and h.id=ri.receipt_id
      join core.stock_movements m on m.organization_id=ph.organization_id and m.restaurant_id=ph.restaurant_id and m.id=ph.receipt_movement_id
      where ph.organization_id=t.organization_id and ph.restaurant_id=t.restaurant_id and ph.location_id=t.location_id and ph.ingredient_id=t.ingredient_id and not exists(select 1 from core.stock_movements rv where rv.organization_id=m.organization_id and rv.restaurant_id=m.restaurant_id and rv.reversal_of_id=m.id) order by m.created_at desc,m.id desc limit 1) p on true
    where t.organization_id=$1 and t.restaurant_id=$2 and t.location_id=$3 and not i.archived order by i.id)
    select ledger.sequence,coalesce((select jsonb_agg(to_jsonb(needs) order by needs."ingredientId") from needs),'[]'::jsonb) as rows from scope cross join ledger`,[ctx.organizationId,ctx.restaurantId,locationId])).rows[0];
  if(!result)throw new DomainError('RESOURCE_NOT_FOUND',404);
  return {sequence:String(result.sequence),rows:result.rows as Row[]};
}

export async function insertShoppingList(ctx:RestaurantContext,locationId:string,sequence:string,tx:Tx):Promise<string>{
  const row=(await tx.query<Row>('insert into core.shopping_lists(organization_id,restaurant_id,location_id,ledger_sequence_at_generation,generated_by) values($1,$2,$3,$4,$5) returning id',[ctx.organizationId,ctx.restaurantId,locationId,sequence,ctx.actor.userId])).rows[0]!;
  return String(row.id);
}

export async function insertShoppingItem(ctx:RestaurantContext,listId:string,item:Row,tx:Tx):Promise<void>{
  const unit=item.originalUnit as string;
  await tx.query(`insert into core.shopping_list_items(organization_id,restaurant_id,location_id,list_id,ingredient_id,ingredient_name_snapshot,base_unit,ledger_sequence_at_generation,balance_quantity,minimum_quantity,target_quantity,committed_pending_quantity,needed_base_quantity,suggested_purchase_quantity,suggested_base_quantity,original_unit,conversion_id,conversion_label,conversion_version,factor_to_base,allow_fractional_count,suggested_supplier_id,suggested_supplier_name,supplier_reference_line_value,supplier_reference_base_quantity,supplier_reference_posted_at,supplier_reference_document_date,purchase_quantity,supplier_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$14,$22)`,
    [ctx.organizationId,ctx.restaurantId,item.locationId,listId,item.ingredientId,item.ingredientName,item.baseUnit,item.ledgerSequence,item.balanceQuantity,item.minimumQuantity,item.targetQuantity,item.committedPendingQuantity,item.neededBaseQuantity,item.suggestedPurchaseQuantity,item.suggestedBaseQuantity,unit,item.conversionId,item.conversionLabel,item.conversionVersion,item.factorToBase,item.allowFractionalCount,item.supplierId,item.supplierName,item.lineValue,item.baseQuantity,item.postedAt,item.documentDate]);
}

export async function getShoppingList(ctx:RestaurantContext,id:string,tx:Tx):Promise<ShoppingList>{
 const l=(await tx.query<Row>(`select id,organization_id as "organizationId",restaurant_id as "restaurantId",location_id as "locationId",status,created_at as "createdAt",generated_at as "generatedAt",ledger_sequence_at_generation::text as "ledgerSequenceAtGeneration" from core.shopping_lists where organization_id=$1 and restaurant_id=$2 and id=$3`,[ctx.organizationId,ctx.restaurantId,id])).rows[0];
 if(!l)throw new DomainError('RESOURCE_NOT_FOUND',404);
 const rows=(await tx.query<Row>(`select id,list_id as "listId",ingredient_id as "ingredientId",ingredient_name_snapshot as "ingredientName",location_id as "locationId",base_unit as "baseUnit",balance_quantity::text as "balanceQuantity",minimum_quantity::text as "minimumQuantity",balance_quantity<=minimum_quantity as critical,target_quantity::text as "targetQuantity",committed_pending_quantity::text as "committedPendingQuantity",needed_base_quantity::text as "neededBaseQuantity",suggested_purchase_quantity::text as "suggestedPurchaseQuantity",suggested_base_quantity::text as "suggestedBaseQuantity",original_unit as "originalUnit",conversion_id as "conversionId",conversion_label as "conversionLabel",conversion_version::text as "conversionVersion",factor_to_base::text as "factorToBase",allow_fractional_count as "allowFractionalCount",suggested_supplier_id as "suggestedSupplierId",suggested_supplier_name as "suggestedSupplierName",supplier_reference_line_value::text as "lineValue",supplier_reference_base_quantity::text as "baseQuantity",supplier_reference_posted_at as "postedAt",supplier_reference_document_date as "documentDate",purchase_quantity::text as "purchaseQuantity",supplier_id as "supplierId",removed,note from core.shopping_list_items where organization_id=$1 and restaurant_id=$2 and list_id=$3 order by ingredient_name_snapshot,id`,[ctx.organizationId,ctx.restaurantId,id])).rows;
 const items:ShoppingListItem[]=rows.map(r=>{const packageUnit=r.originalUnit==='package',conversion={ingredientId:String(r.ingredientId),baseUnit:r.baseUnit,inputUnit:packageUnit?{kind:'package',conversionId:r.conversionId}:{kind:'standard',code:r.originalUnit},factorToBase:canonicalNumeric(r.factorToBase),conversionId:r.conversionId,version:r.conversionVersion,label:r.conversionLabel,allowFractionalCount:r.allowFractionalCount};const needSnapshot={ingredientId:r.ingredientId,ingredientName:r.ingredientName,locationId:r.locationId,baseUnit:r.baseUnit,balanceQuantity:canonicalNumeric(r.balanceQuantity),minimumQuantity:canonicalNumeric(r.minimumQuantity),targetQuantity:canonicalNumeric(r.targetQuantity),committedPendingQuantity:canonicalNumeric(r.committedPendingQuantity),neededBaseQuantity:canonicalNumeric(r.neededBaseQuantity),suggestedBaseQuantity:canonicalNumeric(r.suggestedBaseQuantity),suggestedPurchaseQuantity:canonicalNumeric(r.suggestedPurchaseQuantity),conversion,critical:Boolean(r.critical),supplierSuggestion:r.suggestedSupplierId?{supplierId:r.suggestedSupplierId,name:r.suggestedSupplierName,normalizedPrice:{numerator:canonicalNumeric(r.lineValue),denominator:canonicalNumeric(r.baseQuantity)},postedAt:new Date(r.postedAt as Date).toISOString(),documentDate:r.documentDate?String(r.documentDate).slice(0,10):null}:null};return {id:String(r.id),listId:String(r.listId),needSnapshot,purchaseQuantity:canonicalNumeric(r.purchaseQuantity),supplierId:r.supplierId as string|null,removed:r.removed as boolean,note:r.note as string|null} as ShoppingListItem;});
 return {...l,createdAt:new Date(l.createdAt as Date).toISOString(),generatedAt:new Date(l.generatedAt as Date).toISOString(),items} as ShoppingList;
}
export async function listShoppingLists(ctx:RestaurantContext,q:{locationId:string;limit?:number|undefined;cursor?:string|undefined;status?:'draft'|'archived'|undefined},tx:Tx){
 const rows=(await tx.query<Row>('select id from core.shopping_lists where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ($4::uuid is null or id>$4) and ($5::text is null or status=$5) order by id limit $6',[ctx.organizationId,ctx.restaurantId,q.locationId,q.cursor??null,q.status??null,(q.limit??50)+1])).rows;
 const ids=rows.slice(0,q.limit??50).map(row=>String(row.id));
 const items=[];for(const id of ids)items.push(await getShoppingList(ctx,id,tx));
 return {items,nextCursor:rows.length>items.length?ids.at(-1)??null:null};
}

export async function updateShoppingItem(ctx:RestaurantContext,listId:string,itemId:string,input:UpdateShoppingListItemInput,tx:Tx):Promise<ShoppingList>{
 const current=(await tx.query<Row>('select id from core.shopping_list_items where organization_id=$1 and restaurant_id=$2 and list_id=$3 and id=$4 for update',[ctx.organizationId,ctx.restaurantId,listId,itemId])).rows[0];
 if(!current)throw new DomainError('RESOURCE_NOT_FOUND',404);
 await tx.query('update core.shopping_list_items set purchase_quantity=coalesce($5,purchase_quantity),supplier_id=case when $6 then $7::uuid else supplier_id end,removed=coalesce($8,removed),note=case when $9 then $10::text else note end where organization_id=$1 and restaurant_id=$2 and list_id=$3 and id=$4',[ctx.organizationId,ctx.restaurantId,listId,itemId,input.purchaseQuantity??null,input.supplierId!==undefined,input.supplierId??null,input.removed??null,input.note!==undefined,input.note??null]);
 return getShoppingList(ctx,listId,tx);
}

const commitmentColumns=`id,organization_id as "organizationId",restaurant_id as "restaurantId",location_id as "locationId",ingredient_id as "ingredientId",list_id as "listId",list_item_id as "listItemId",supplier_id as "supplierId",base_unit as "baseUnit",original_unit as "originalUnit",conversion_id as "conversionId",conversion_label as "conversionLabel",conversion_version::text as "conversionVersion",factor_to_base::text as "factorToBase",allow_fractional_count as "allowFractionalCount",confirmed_quantity::text as "confirmedQuantity",committed_base_quantity::text as "committedBaseQuantity",received_base_quantity::text as "receivedBaseQuantity",remaining_base_quantity::text as "remainingBaseQuantity",status,confirmed_at as "confirmedAt",confirmed_by as "confirmedBy"`;
function commitmentDTO(r:Row):ShoppingCommitment{
 const unit=r.originalUnit==='package'?{kind:'package' as const,conversionId:String(r.conversionId)}:{kind:'standard' as const,code:r.originalUnit as 'kg'|'g'|'L'|'mL'|'un'};
 const conversion={ingredientId:String(r.ingredientId),baseUnit:r.baseUnit as 'kg'|'L'|'un',allowFractionalCount:Boolean(r.allowFractionalCount),inputUnit:unit,factorToBase:canonicalNumeric(r.factorToBase),conversionId:r.conversionId as string|null,version:r.conversionVersion as string|null,label:r.conversionLabel as string|null};
 return {id:String(r.id),organizationId:String(r.organizationId),restaurantId:String(r.restaurantId),locationId:String(r.locationId),ingredientId:String(r.ingredientId),listId:String(r.listId),listItemId:String(r.listItemId),supplierId:r.supplierId as string|null,baseUnit:r.baseUnit as 'kg'|'L'|'un',unit,conversion,confirmedQuantity:canonicalNumeric(r.confirmedQuantity),committedBaseQuantity:canonicalNumeric(r.committedBaseQuantity),receivedBaseQuantity:canonicalNumeric(r.receivedBaseQuantity),remainingBaseQuantity:canonicalNumeric(r.remainingBaseQuantity),status:r.status as ShoppingCommitment['status'],confirmedAt:new Date(r.confirmedAt as Date).toISOString(),confirmedBy:String(r.confirmedBy)};
}
export async function confirmShoppingCommitment(ctx:RestaurantContext,listId:string,itemId:string,input:ConfirmShoppingCommitmentInput,committedBaseQuantity:string,tx:Tx):Promise<ShoppingCommitment>{
 const item=(await tx.query<Row>(`select i.*,l.status list_status,i.purchase_quantity=$5::numeric quantity_matches,i.supplier_id is not distinct from coalesce($6::uuid,i.supplier_id) supplier_matches from core.shopping_list_items i join core.shopping_lists l on l.organization_id=i.organization_id and l.restaurant_id=i.restaurant_id and l.location_id=i.location_id and l.id=i.list_id where i.organization_id=$1 and i.restaurant_id=$2 and i.list_id=$3 and i.id=$4 for update of i,l`,[ctx.organizationId,ctx.restaurantId,listId,itemId,input.purchaseQuantity,input.supplierId??null])).rows[0];
 if(!item)throw new DomainError('RESOURCE_NOT_FOUND',404);
 if(item.list_status!=='draft'||item.removed)throw new DomainError('RESOURCE_CONFLICT',409);
 const quantity=input.purchaseQuantity;
 if(item.quantity_matches!==true||item.supplier_matches!==true)throw new DomainError('RESOURCE_CONFLICT',409);
 const inserted=(await tx.query<Row>(`insert into core.shopping_commitments(organization_id,restaurant_id,location_id,list_id,list_item_id,ingredient_id,supplier_id,base_unit,confirmed_quantity,original_unit,conversion_id,conversion_label,conversion_version,factor_to_base,allow_fractional_count,committed_base_quantity,received_base_quantity,remaining_base_quantity,confirmed_by)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,$16,$17) returning ${commitmentColumns}`,[ctx.organizationId,ctx.restaurantId,item.location_id,listId,itemId,item.ingredient_id,item.supplier_id,item.base_unit,quantity,item.original_unit,item.conversion_id,item.conversion_label,item.conversion_version,item.factor_to_base,item.allow_fractional_count,committedBaseQuantity,ctx.actor.userId])).rows[0]!;
 return commitmentDTO(inserted);
}
export async function cancelShoppingCommitment(ctx:RestaurantContext,id:string,input:CancelShoppingCommitmentInput,tx:Tx):Promise<ShoppingCommitment>{
 const current=(await tx.query<Row>("select id from core.shopping_commitments where organization_id=$1 and restaurant_id=$2 and id=$3 and status='confirmed' for update",[ctx.organizationId,ctx.restaurantId,id])).rows[0];
 if(!current)throw new DomainError('RESOURCE_CONFLICT',409);
 const pendingReceipt=await tx.query('select 1 from core.purchase_receipt_items i join core.purchase_receipts h on h.organization_id=i.organization_id and h.restaurant_id=i.restaurant_id and h.id=i.receipt_id where i.organization_id=$1 and i.restaurant_id=$2 and i.commitment_id=$3 and h.status=\'draft\' limit 1',[ctx.organizationId,ctx.restaurantId,id]);
 if(pendingReceipt.rowCount)throw new DomainError('RESOURCE_CONFLICT',409);
 const updated=(await tx.query<Row>(`update core.shopping_commitments set status='cancelled',cancelled_by=$4,cancelled_at=now(),cancel_reason=$5 where organization_id=$1 and restaurant_id=$2 and id=$3 and status='confirmed' returning ${commitmentColumns}`,[ctx.organizationId,ctx.restaurantId,id,ctx.actor.userId,input.reason])).rows[0];
 if(!updated)throw new DomainError('RESOURCE_CONFLICT',409);
 return commitmentDTO(updated);
}

