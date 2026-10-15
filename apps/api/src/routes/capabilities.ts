import type { FastifyInstance } from 'fastify';
import { UUIDSchema } from '@donos/contracts';
import { listCapabilities } from '@donos/domain-billing';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
export function registerCapabilities(app:FastifyInstance,s:ApiServices) {
  app.get<{Params:{organizationId:string}}>('/v1/organizations/:organizationId/capabilities',async request=>{
    const actor=await s.actor(request),id=validate(UUIDSchema,request.params.organizationId);
    return {items:await s.database().withOrganizationTx(actor,id,listCapabilities)};
  });
}
