import { spawnSync } from 'node:child_process';
import { readFileSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function run(script,args,cwd,env=process.env){
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(`../${script}`,import.meta.url)),...args],{cwd,env,stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0)process.exit(result.status??1);
}
console.info(`Build runtime ${process.version}`);
run('node_modules/typescript/bin/tsc',['-b'],root);
const uiEnv={...process.env};
const settingsPath=new URL('../.local/dev.json',import.meta.url);
if(existsSync(settingsPath)){
  const settings=JSON.parse(readFileSync(settingsPath,'utf8'));
  if(settings.projectRef!=='kfthwjrvgslnsjigqnyc'||settings.supabaseUrl!=='https://kfthwjrvgslnsjigqnyc.supabase.co')throw new Error('Unapproved DEV target');
  uiEnv.VITE_SUPABASE_URL=settings.supabaseUrl;uiEnv.VITE_SUPABASE_PUBLISHABLE_KEY=settings.publishableKey;uiEnv.VITE_API_URL='http://127.0.0.1:3001';
}
for(const key of Object.keys(uiEnv))if(/DATABASE|SERVICE_ROLE|SECRET|PASSWORD/.test(key))delete uiEnv[key];
if(!uiEnv.VITE_SUPABASE_URL||!uiEnv.VITE_SUPABASE_PUBLISHABLE_KEY||!uiEnv.VITE_API_URL)throw new Error('Public frontend configuration required');
const {loadConfig}=await import('../apps/api/dist/config.js');
const cloud=uiEnv.VITE_SUPABASE_URL==='https://kfthwjrvgslnsjigqnyc.supabase.co';
// Configuration validation only: this placeholder URL is never connected or bundled.
loadConfig({NODE_ENV:'test',SUPABASE_MODE:cloud?'cloud-dev':'local',SUPABASE_PROJECT_REF:'kfthwjrvgslnsjigqnyc',
  SUPABASE_URL:uiEnv.VITE_SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:uiEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  DATABASE_URL:cloud?'postgresql://donos_api:build-validation@db.kfthwjrvgslnsjigqnyc.supabase.co/postgres?sslmode=verify-full':'postgresql://donos_api:build-validation@127.0.0.1/postgres',
  DATABASE_CA_FILE:'validation-only',CORS_ORIGINS:uiEnv.VITE_API_URL});
for(const app of ['portal','estoque','precificacao'])run('node_modules/vite/bin/vite.js',['build'],`${root}apps/${app}`,uiEnv);
