import type { FastifyInstance } from 'fastify';
import { ContextSelectionSchema } from '@donos/contracts';
import { createCore } from '@donos/domain-core';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
export function registerContexts(app:FastifyInstance,services:ApiServices) {
  app.post('/v1/contexts',async(request,reply)=>{
    const actor=await services.actor(request);
    return reply.code(201).send(await createCore(services.database()).selectContext(actor,validate(ContextSelectionSchema,request.body)));
  });
}
