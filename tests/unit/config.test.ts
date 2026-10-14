import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../apps/api/src/config.js';

const localEnv = {
  NODE_ENV: 'test', PORT: '3001', SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-local-publishable',
  DATABASE_URL: 'postgresql://donos_api:synthetic@127.0.0.1:54322/postgres',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174,http://localhost:5175',
};

describe('configuração local da API', () => {
  it('aceita somente configuração local completa e porta válida', () => {
    const config = loadConfig(localEnv);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3001);
    expect(config.environment).toBe('test');
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']);
  });
  it.each([
    { DATABASE_URL: 'postgresql://x:secret@example.com/db' },
    { DATABASE_URL: 'postgresql://x:secret@127.0.0.1.example.com/db' },
    { DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1/postgres' },
    { DATABASE_URL: 'postgresql://service_role:secret@localhost/postgres' },
    { DATABASE_URL: 'https://localhost/db' },
    { SUPABASE_URL: 'https://real.supabase.co' },
    { SUPABASE_URL: 'http://127.0.0.1.example.com' },
    { SUPABASE_URL: 'http://user:password@localhost:54321' },
    { SUPABASE_URL: 'http://localhost:54321/path?token=secret' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'http://example.com' },
    { CORS_ORIGINS: 'http://localhost:5173/path' },
    { NODE_ENV: 'production' },
    { PORT: '3001abc' },
    { PORT: '0' },
    { PORT: '65536' },
    { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' },
    { SUPABASE_PUBLISHABLE_KEY: '' },
  ])('nega configuração remota, privilegiada ou inválida (%j)', (override) => {
    expect(() => loadConfig({ ...localEnv, ...override })).toThrow();
  });
  it('não revela credenciais na mensagem de erro', () => {
    let message = '';
    try { loadConfig({ ...localEnv, DATABASE_URL: 'postgres://x:do-not-leak@example.com/db' }); }
    catch (error) { message = (error as Error).message; }
    expect(message).not.toContain('do-not-leak');
    expect(message).not.toContain('example.com');
  });
  it('recusa chave JWT privilegiada apesar de host local', () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const privileged = `${encode({alg:'HS256'})}.${encode({role:'service_role'})}.signature`;
    expect(() => loadConfig({ ...localEnv, SUPABASE_PUBLISHABLE_KEY: privileged })).toThrow();
  });
  it('não aceita valores ausentes por default silencioso', () => {
    expect(() => loadConfig({})).toThrow();
  });
});
