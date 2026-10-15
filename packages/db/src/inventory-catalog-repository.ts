import type { Ingredient,Supplier,ConversionVersion,CreateIngredientInput,PatchIngredientInput,CreateSupplierInput,PatchSupplierInput,CreateConversionInput,CatalogQuery,InputUnit,ConversionSnapshot } from '@donos/contracts';
import type { RestaurantContext,Tx } from './types.js';
import { DomainError } from './types.js';
export const ingredientColumns='id,organization_id as "organizationId",restaurant_id as "restaurantId",name,base_unit as "baseUnit",allow_fractional_count as "allowFractionalCount",archived';
export const supplierColumns='id,organization_id as "organizationId",name,contact,archived';
export async function requireIngredient(ctx:RestaurantContext,id:string,tx:Tx,active=false,lock=true):Promise<Ingredient>{
 const row=(await tx.query<Ingredient>(`select ${ingredientColumns} from core.ingredients where organization_id=$1 and restaurant_id=$2 and id=$3 ${lock?'for update':''}`,[ctx.organizationId,ctx.restaurantId,id])).rows[0];
 if(!row)throw new DomainError('RESOURCE_NOT_FOUND',404);if(active&&row.archived)throw new DomainError('RESOURCE_CONFLICT',409);return row;
}
export async function requireSupplier(ctx:RestaurantContext,id:string,tx:Tx,active=false):Promise<Supplier>{
 const row=(await tx.query<Supplier>(`select ${supplierColumns} from core.suppliers where organization_id=$1 and id=$2 for update`,[ctx.organizationId,id])).rows[0];
 if(!row)throw new DomainError('RESOURCE_NOT_FOUND',404);if(active&&row.archived)throw new DomainError('RESOURCE_CONFLICT',409);return row;
}
export async function createIngredient(ctx:RestaurantContext,input:CreateIngredientInput,tx:Tx):Promise<Ingredient>{
 const row=(await tx.query<Ingredient>(`insert into core.ingredients(organization_id,restaurant_id,name,base_unit,allow_fractional_count) values($1,$2,$3,$4,$5) returning ${ingredientColumns}`,[ctx.organizationId,ctx.restaurantId,input.name,input.baseUnit,input.allowFractionalCount])).rows[0]!;
 await tx.query('insert into core.stock_balances(organization_id,restaurant_id,ingredient_id) values($1,$2,$3)',[ctx.organizationId,ctx.restaurantId,row.id]);return row;
}
export async function patchIngredient(ctx:RestaurantContext,id:string,input:PatchIngredientInput,tx:Tx):Promise<Ingredient>{
 const old=await requireIngredient(ctx,id,tx);
 return (await tx.query<Ingredient>(`update core.ingredients set name=$4,archived=$5 where organization_id=$1 and restaurant_id=$2 and id=$3 returning ${ingredientColumns}`,[ctx.organizationId,ctx.restaurantId,id,input.name??old.name,input.archived??old.archived])).rows[0]!;
}
export async function createSupplier(ctx:RestaurantContext,input:CreateSupplierInput,tx:Tx):Promise<Supplier>{
 return (await tx.query<Supplier>(`insert into core.suppliers(organization_id,name,contact) values($1,$2,$3) returning ${supplierColumns}`,[ctx.organizationId,input.name,input.contact??null])).rows[0]!;
}
export async function patchSupplier(ctx:RestaurantContext,id:string,input:PatchSupplierInput,tx:Tx):Promise<Supplier>{
 const old=await requireSupplier(ctx,id,tx);
 return (await tx.query<Supplier>(`update core.suppliers set name=$3,contact=$4,archived=$5 where organization_id=$1 and id=$2 returning ${supplierColumns}`,[ctx.organizationId,id,input.name??old.name,input.contact===undefined?old.contact:input.contact,input.archived??old.archived])).rows[0]!;
}
export async function createConversion(ctx:RestaurantContext,id:string,input:CreateConversionInput,tx:Tx):Promise<ConversionVersion>{
 await requireIngredient(ctx,id,tx,true);
 return (await tx.query<ConversionVersion>('insert into core.ingredient_conversions(organization_id,restaurant_id,ingredient_id,label,version,factor_to_base) select $1,$2,$3,$4,coalesce(max(version),0)+1,$5 from core.ingredient_conversions where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 and label=$4 returning id,ingredient_id as "ingredientId",label,version::text,factor_to_base::text as "factorToBase"',[ctx.organizationId,ctx.restaurantId,id,input.label,input.factorToBase])).rows[0]!;
}
export async function listConversions(ctx:RestaurantContext,id:string,tx:Tx):Promise<{items:ConversionVersion[]}>{
 await requireIngredient(ctx,id,tx,false,false);
 return {items:(await tx.query<ConversionVersion>('select id,ingredient_id as "ingredientId",label,version::text,factor_to_base::text as "factorToBase" from core.ingredient_conversions where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 order by label,version desc',[ctx.organizationId,ctx.restaurantId,id])).rows};
}
export async function resolveConversion(ctx:RestaurantContext,ingredient:Ingredient,unit:InputUnit,tx:Tx):Promise<ConversionSnapshot>{
 if(unit.kind==='standard')return {ingredientId:ingredient.id,baseUnit:ingredient.baseUnit,allowFractionalCount:ingredient.allowFractionalCount,inputUnit:unit,factorToBase:unit.code==='g'||unit.code==='mL'?'0.001':'1',conversionId:null,version:null,label:null};
 const rows=await listConversions(ctx,ingredient.id,tx),c=rows.items.find(c=>c.id===unit.conversionId);
 if(!c)throw new DomainError('RESOURCE_NOT_FOUND',404);
 if(rows.items.some(v=>v.label===c.label&&BigInt(v.version)>BigInt(c.version)))throw new DomainError('RESOURCE_CONFLICT',409);
 return {ingredientId:ingredient.id,baseUnit:ingredient.baseUnit,allowFractionalCount:ingredient.allowFractionalCount,inputUnit:unit,factorToBase:c.factorToBase,conversionId:c.id,version:c.version,label:c.label};
}
export async function listIngredients(ctx:RestaurantContext,q:CatalogQuery,tx:Tx){
 const rows=(await tx.query<Ingredient>(`select ${ingredientColumns} from core.ingredients where organization_id=$1 and restaurant_id=$2 and ($3::uuid is null or id>$3) and ($4 or not archived) order by id limit $5`,[ctx.organizationId,ctx.restaurantId,q.cursor??null,q.includeArchived??false,(q.limit??50)+1])).rows;
 const items=rows.slice(0,q.limit??50);return {items,nextCursor:rows.length>items.length?items.at(-1)!.id:null};
}
export async function listSuppliers(ctx:RestaurantContext,q:CatalogQuery,tx:Tx){
 const rows=(await tx.query<Supplier>(`select ${supplierColumns} from core.suppliers where organization_id=$1 and ($2::uuid is null or id>$2) and ($3 or not archived) order by id limit $4`,[ctx.organizationId,q.cursor??null,q.includeArchived??false,(q.limit??50)+1])).rows;
 const items=rows.slice(0,q.limit??50);return {items,nextCursor:rows.length>items.length?items.at(-1)!.id:null};
}
