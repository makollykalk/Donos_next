import type { FastifyInstance,FastifyRequest } from 'fastify';
import { ContextSelectionSchema,UUIDSchema,CreateIngredientSchema,PatchIngredientSchema,CreateSupplierSchema,PatchSupplierSchema,CreateConversionSchema,CreateReceiptSchema,ReceiveReceiptSchema,IssueSchema,ReversalSchema,CatalogQuerySchema,ReceiptQuerySchema,SequenceQuerySchema,PriceHistoryQuerySchema } from '@donos/contracts';
import { DomainError } from '@donos/db';
import { createInventoryService } from '../services/inventory.js';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
export function registerInventory(app:FastifyInstance,s:ApiServices){
 const base='/v1/organizations/:organizationId/restaurants/:restaurantId/inventory';
 async function args(r:FastifyRequest){
  const actor=await s.actor(r),p=r.params as Record<string,string>;
  const selection=validate(ContextSelectionSchema,{organizationId:p.organizationId,restaurantId:p.restaurantId});
  const token=r.headers['x-donos-context'];if(typeof token!=='string')throw new DomainError('CONTEXT_MISMATCH',409);
  return [actor,selection,token] as const;
 }
 const id=(r:FastifyRequest,key:string)=>validate(UUIDSchema,(r.params as Record<string,string>)[key]);
 const key=(r:FastifyRequest)=>validate(UUIDSchema,r.headers['idempotency-key']);
 const service=()=>createInventoryService(s.database());
 app.get(base+'/ingredients',async r=>service().listIngredients(...await args(r),validate(CatalogQuerySchema,r.query)));
 app.post(base+'/ingredients',async(r,p)=>p.code(201).send(await service().createIngredient(...await args(r),validate(CreateIngredientSchema,r.body),key(r))));
 app.patch(base+'/ingredients/:ingredientId',async r=>service().patchIngredient(...await args(r),id(r,'ingredientId'),validate(PatchIngredientSchema,r.body),key(r)));
 app.get(base+'/ingredients/:ingredientId/conversions',async r=>service().listConversions(...await args(r),id(r,'ingredientId')));
 app.post(base+'/ingredients/:ingredientId/conversions',async(r,p)=>p.code(201).send(await service().createConversion(...await args(r),id(r,'ingredientId'),validate(CreateConversionSchema,r.body),key(r))));
 app.get(base+'/suppliers',async r=>service().listSuppliers(...await args(r),validate(CatalogQuerySchema,r.query)));
 app.post(base+'/suppliers',async(r,p)=>p.code(201).send(await service().createSupplier(...await args(r),validate(CreateSupplierSchema,r.body),key(r))));
 app.patch(base+'/suppliers/:supplierId',async r=>service().patchSupplier(...await args(r),id(r,'supplierId'),validate(PatchSupplierSchema,r.body),key(r)));
 app.get(base+'/receipts',async r=>service().listReceipts(...await args(r),validate(ReceiptQuerySchema,r.query)));
 app.get(base+'/receipts/:receiptId',async r=>service().getReceipt(...await args(r),id(r,'receiptId')));
 app.post(base+'/receipts',async(r,p)=>p.code(201).send(await service().createReceipt(...await args(r),validate(CreateReceiptSchema,r.body),key(r))));
 app.post(base+'/receipts/:receiptId/receive',async(r,p)=>p.code(201).send(await service().receiveReceipt(...await args(r),id(r,'receiptId'),validate(ReceiveReceiptSchema,r.body),key(r))));
 app.post(base+'/issues',async(r,p)=>p.code(201).send(await service().issue(...await args(r),validate(IssueSchema,r.body),key(r))));
 app.post(base+'/movements/:movementId/reversal',async(r,p)=>p.code(201).send(await service().reverseIssue(...await args(r),id(r,'movementId'),validate(ReversalSchema,r.body),key(r))));
 app.post(base+'/receipts/:receiptId/reversal',async(r,p)=>p.code(201).send(await service().reverseReceipt(...await args(r),id(r,'receiptId'),validate(ReversalSchema,r.body),key(r))));
 app.get(base+'/balances',async r=>service().listBalances(...await args(r),validate(CatalogQuerySchema,r.query)));
 app.get(base+'/ingredients/:ingredientId/movements',async r=>service().listMovements(...await args(r),id(r,'ingredientId'),validate(SequenceQuerySchema,r.query)));
 app.get(base+'/ingredients/:ingredientId/price-history',async r=>service().listPriceHistory(...await args(r),id(r,'ingredientId'),validate(PriceHistoryQuerySchema,r.query)));
}
