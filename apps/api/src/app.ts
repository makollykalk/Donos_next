import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import { createServices } from './http/security.js';
import type { AppDependencies } from './http/security.js';
import { registerErrors } from './http/errors.js';
import { registerAuth } from './routes/auth.js';
import { registerContexts } from './routes/contexts.js';
import { registerOrganizations } from './routes/organizations.js';
import { registerCapabilities } from './routes/capabilities.js';
import { registerModuleAccess } from './routes/module-access.js';
import { registerInventory } from './routes/inventory.js';
import { registerInventoryCounts } from './routes/inventory-counts.js';
import { registerRecipes } from './routes/recipes.js';
import { registerPricing } from './routes/pricing.js';

export type { AppDependencies } from './http/security.js';

export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 32_768, trustProxy: false,genReqId:()=>randomUUID() });
  void app.register(cors,{origin:[...(deps.corsOrigins??[])],methods:['GET','POST','PATCH'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key','X-Donos-Context']});
  registerErrors(app);
  const services=createServices(deps);
  registerAuth(app,services); registerContexts(app,services);
  registerOrganizations(app,services);
  registerCapabilities(app,services);registerModuleAccess(app,services);
  registerInventory(app,services); registerInventoryCounts(app,services); registerRecipes(app,services); registerPricing(app,services);
  app.get('/health', () => ({ status: 'ok' as const }));
  return app;
}
