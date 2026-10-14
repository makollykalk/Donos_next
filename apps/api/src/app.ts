import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export type AppDependencies = Readonly<Record<string, never>>;

export function buildApp(_deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 32_768, trustProxy: false });
  app.get('/health', () => ({ status: 'ok' as const }));
  return app;
}
