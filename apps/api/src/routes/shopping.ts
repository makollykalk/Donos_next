import type { FastifyInstance,FastifyRequest } from 'fastify';
import { ContextSelectionSchema,SetStockThresholdSchema,UUIDSchema,CreateShoppingListSchema,ShoppingListQuerySchema,UpdateShoppingListItemSchema,ConfirmShoppingCommitmentSchema,CancelShoppingCommitmentSchema } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
import { createShoppingService } from '../services/shopping.js';

export function registerShopping(app:FastifyInstance,s:ApiServices){
 const base='/v1/organizations/:organizationId/restaurants/:restaurantId/shopping';
 async function args(r:FastifyRequest){
  const actor=await s.actor(r),p=r.params as Record<string,string>,selection=validate(ContextSelectionSchema,{organizationId:p.organizationId,restaurantId:p.restaurantId});
  const token=r.headers['x-donos-context'];if(typeof token!=='string')throw new DomainError('CONTEXT_MISMATCH',409);
  return [actor,selection,token] as const;
 }
 const id=(r:FastifyRequest,key:string)=>validate(UUIDSchema,(r.params as Record<string,string>)[key]);
 const key=(r:FastifyRequest)=>validate(UUIDSchema,r.headers['idempotency-key']);
 const service=()=>createShoppingService(s.database());
 app.get(base+'/locations/:locationId/thresholds',async r=>service().listThresholds(...await args(r),id(r,'locationId')));
 app.put(base+'/ingredients/:ingredientId/threshold',async r=>service().setThreshold(...await args(r),id(r,'ingredientId'),validate(SetStockThresholdSchema,r.body),key(r)));
 app.post(base+'/lists',async(r,p)=>p.code(201).send(await service().generateList(...await args(r),validate(CreateShoppingListSchema,r.body).locationId,key(r))));
 app.get(base+'/lists',async r=>service().listLists(...await args(r),validate(ShoppingListQuerySchema,r.query)));
 app.get(base+'/lists/:listId',async r=>service().getList(...await args(r),id(r,'listId')));
 app.patch(base+'/lists/:listId/items/:itemId',async r=>service().updateItem(...await args(r),id(r,'listId'),id(r,'itemId'),validate(UpdateShoppingListItemSchema,r.body),key(r)));
 app.post(base+'/lists/:listId/items/:itemId/commitment',async r=>service().confirmCommitment(...await args(r),id(r,'listId'),id(r,'itemId'),validate(ConfirmShoppingCommitmentSchema,r.body),key(r)));
 app.post(base+'/commitments/:commitmentId/cancel',async r=>service().cancelCommitment(...await args(r),id(r,'commitmentId'),validate(CancelShoppingCommitmentSchema,r.body),key(r)));
 app.get(base+'/lists/:listId/export.csv',async(r,p)=>{const csv=await service().exportList(...await args(r),id(r,'listId'));p.type('text/csv; charset=utf-8').header('content-disposition',`attachment; filename="lista-${id(r,'listId')}.csv"`);return csv;});
}
