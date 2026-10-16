import type { FastifyInstance } from 'fastify';
import type { ApiServices } from '../http/security.js';
import { revokeSession } from '../auth/revocation.js';
export function registerAuth(app:FastifyInstance,services:ApiServices) {
  app.get('/v1/me',async request=>({userId:(await services.actor(request)).userId}));
  app.post('/v1/auth/logout',async(request,reply)=>{
    await revokeSession(services.database(),await services.actor(request,true));
    return reply.code(204).send();
  });
}
