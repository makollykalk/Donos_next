import { expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';

it('publica saúde mínima sem revelar configuração e fecha recursos', async () => {
  const app = buildApp({});
  try {
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.body).not.toContain('DATABASE_URL');
  } finally { await app.close(); }
});

it('não oferece CRUD ou concessão comercial em rotas ainda inexistentes', async () => {
  const app = buildApp({});
  try {
    expect((await app.inject({method:'POST',url:'/v1/entitlements',payload:{enabled:true}})).statusCode).toBe(404);
    expect((await app.inject('/v1/organizations')).statusCode).toBe(401);
  } finally { await app.close(); }
});
