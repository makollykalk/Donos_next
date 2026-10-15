import type { FastifyInstance } from 'fastify';
import { UUIDSchema } from '@donos/contracts';
import { requireEntitlement } from '@donos/domain-billing';
import { DomainError } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
export function registerModuleAccess(app:FastifyInstance,s:ApiServices) {
  app.get<{Params:{organizationId:string;restaurantId:string;app:string}}>('/v1/organizations/:organizationId/restaurants/:restaurantId/access/:app',async request=>{
    const actor=await s.actor(request),organizationId=validate(UUIDSchema,request.params.organizationId),restaurantId=validate(UUIDSchema,request.params.restaurantId);
    const module=request.params.app;
    if(module!=='estoque'&&module!=='precificacao') throw new DomainError('RESOURCE_NOT_FOUND',404);
    const token=request.headers['x-donos-context'];
    if(typeof token!=='string') throw new DomainError('CONTEXT_MISMATCH',409);
    return s.database().withRestaurantTx(actor,{organizationId,restaurantId},token,async(ctx,tx)=>{
      await requireEntitlement(ctx,module==='estoque'?'inventory_core':'pricing_core',tx);
      return {allowed:true,organizationId,restaurantId,app:module};
    });
  });
}
