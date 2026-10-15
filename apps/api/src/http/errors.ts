import type { FastifyInstance } from 'fastify';
import { DomainError } from '@donos/db';
export function registerErrors(app:FastifyInstance) {
  app.addHook('onSend',async(_request,reply,payload)=>{reply.header('cache-control','no-store');reply.header('x-content-type-options','nosniff'); return payload;});
  app.setErrorHandler((error,request,reply)=>{
    const known=error instanceof DomainError ? error : new DomainError('DEPENDENCY_UNAVAILABLE',503);
    return reply.code(known.status).send({error:{code:known.code,message:known.code,requestId:request.id}});
  });
  app.setNotFoundHandler((request,reply)=>reply.code(404).send({error:{code:'RESOURCE_NOT_FOUND',message:'RESOURCE_NOT_FOUND',requestId:request.id}}));
}
