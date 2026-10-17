import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createClient } from '@supabase/supabase-js';
import { createDatabase,createPool } from '@donos/db';
import { createActorVerifier } from './auth/verify-actor.js';
import { extractInventoryText } from '@donos/domain-ai';

let cleanup:()=>Promise<void>=async()=>undefined;
try {
  const config = loadConfig(process.env);
  const pool=createPool(config);
  cleanup=()=>pool.end();
  const role=(await pool.query("select current_user as name,rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0];
  if(role.name!=='donos_api'||role.rolsuper||role.rolbypassrls) {await pool.end();throw new Error('Invalid runtime role');}
  const auth=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const textExtractor=process.env.NODE_ENV==='development'||process.env.NODE_ENV==='test'
    ? async ({text}:{text:string})=>extractInventoryText(text)
    : undefined;
  const app = buildApp({database:createDatabase(pool),verifyActor:createActorVerifier(auth.auth,`${config.supabaseUrl}/auth/v1`),corsOrigins:config.corsOrigins,...(textExtractor?{textExtractor}:{})});
  const shutdown = async () => { await app.close(); await pool.end(); };
  cleanup=shutdown;
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  await app.listen({ host: config.host, port: config.port });
  console.info(`DONOS Next API em http://${config.host}:${String(config.port)}`);
} catch {
  await cleanup().catch(()=>undefined);
  console.error('A API não iniciou. Confira a configuração local e a porta.');
  process.exitCode = 1;
}
