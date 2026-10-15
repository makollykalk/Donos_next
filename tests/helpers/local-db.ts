import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadConfig } from '../../apps/api/src/config.js';

// Deliberately fail if DEV secrets are absent. No fallback, admin key or silent skip.
const settings = JSON.parse(readFileSync('.local/dev.json','utf8')) as {
  projectRef:string; supabaseUrl:string; publishableKey:string; databaseUrl:string;
};
export const config = loadConfig({NODE_ENV:'test', SUPABASE_MODE:'cloud-dev',
  SUPABASE_PROJECT_REF:settings.projectRef, SUPABASE_URL:settings.supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY:settings.publishableKey, DATABASE_URL:settings.databaseUrl,
  DATABASE_CA_FILE:'.local/supabase-ca.crt', CORS_ORIGINS:'http://localhost:5173,http://localhost:5174,http://localhost:5175'});
export function runtimePool(max=4): pg.Pool {
  const url=new URL(config.databaseUrl); url.search='';
  return new pg.Pool({connectionString:url.toString(),max,connectionTimeoutMillis:10000,
    ssl:{rejectUnauthorized:true,ca:readFileSync('.local/supabase-ca.crt','utf8')}});
}
export async function login(name:'a'|'b') {
  const fixtures=JSON.parse(readFileSync('.local/fixtures.json','utf8')) as {actors:{name:string;id:string;email:string;password:string}[]};
  const actor=fixtures.actors.find(a=>a.name===name);
  if(!actor) throw new Error('Missing synthetic actor');
  const auth=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});
  if(error||!data.session||data.user.id!==actor.id) throw new Error('Synthetic Auth login failed');
  return {auth,token:data.session.access_token,userId:actor.id};
}
