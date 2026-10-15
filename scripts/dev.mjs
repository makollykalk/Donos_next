import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/dist/config.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const settings=JSON.parse(readFileSync(new URL('../.local/dev.json',import.meta.url),'utf8'));
const apiEnv={...process.env,NODE_ENV:'development',SUPABASE_MODE:'cloud-dev',SUPABASE_PROJECT_REF:settings.projectRef,
  SUPABASE_URL:settings.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:settings.publishableKey,DATABASE_URL:settings.databaseUrl,
  DATABASE_CA_FILE:fileURLToPath(new URL('../.local/supabase-ca.crt',import.meta.url)),
  CORS_ORIGINS:'http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175'};
loadConfig(apiEnv); // Fail before any process/network if target differs from approved DEV.
const uiEnv={...process.env,VITE_SUPABASE_URL:settings.supabaseUrl,VITE_SUPABASE_PUBLISHABLE_KEY:settings.publishableKey,VITE_API_URL:'http://127.0.0.1:3001'};
for(const key of Object.keys(uiEnv)) if(/DATABASE|SERVICE_ROLE|SECRET|PASSWORD/.test(key)) delete uiEnv[key];
const children=[];
function start(args,cwd,env){const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});children.push(child);child.on('error',()=>{console.error('Development process failed');stop(1);});child.on('exit',code=>{if(code&&code!==0)stop(code);});}
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
process.once('SIGINT',()=>stop());process.once('SIGTERM',()=>stop());
start(['apps/api/dist/server.js'],root,apiEnv);
for(const app of ['portal','estoque','precificacao']) start([`${root}node_modules/vite/bin/vite.js`],`${root}apps/${app}`,uiEnv);
