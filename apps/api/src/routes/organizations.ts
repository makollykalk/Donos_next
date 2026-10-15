import type { FastifyInstance } from 'fastify';
import { CreateOrganizationSchema,CreateRestaurantSchema,UUIDSchema } from '@donos/contracts';
import { createOrganization,createRestaurant } from '@donos/domain-core';
import { listOwnedOrganizations,listRestaurants } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
export function registerOrganizations(app:FastifyInstance,s:ApiServices) {
  app.get('/v1/organizations',async request=>{
    const actor=await s.actor(request);
    return {items:await s.database().withActorTx(actor,tx=>listOwnedOrganizations(actor,tx))};
  });
  app.post('/v1/organizations',async(request,reply)=>{
    const actor=await s.actor(request),input=validate(CreateOrganizationSchema,request.body),key=validate(UUIDSchema,request.headers['idempotency-key']);
    return reply.code(201).send(await createOrganization(s.database(),actor,input,key));
  });
  app.get<{Params:{organizationId:string}}>('/v1/organizations/:organizationId/restaurants',async request=>{
    const actor=await s.actor(request),id=validate(UUIDSchema,request.params.organizationId);
    return {items:await s.database().withOrganizationTx(actor,id,listRestaurants)};
  });
  app.post<{Params:{organizationId:string}}>('/v1/organizations/:organizationId/restaurants',async(request,reply)=>{
    const actor=await s.actor(request),id=validate(UUIDSchema,request.params.organizationId),input=validate(CreateRestaurantSchema,request.body),key=validate(UUIDSchema,request.headers['idempotency-key']);
    return reply.code(201).send(await createRestaurant(s.database(),actor,id,input,key));
  });
}
