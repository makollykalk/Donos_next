import {createClient} from '@supabase/supabase-js';
export function createAuthClient(config:{url:string;publishableKey:string;app:string;storage:Storage}){
  const url=new URL(config.url);
  if(url.protocol!=='https:' && !['127.0.0.1','localhost'].includes(url.hostname))throw Error('Auth inválido.');
  if(!config.publishableKey || config.publishableKey.startsWith('sb_secret_'))throw Error('Chave pública inválida.');
  if(!config.publishableKey.startsWith('sb_publishable_')){
    try{const payload=JSON.parse(globalThis.atob(config.publishableKey.split('.')[1]!.replace(/-/g,'+').replace(/_/g,'/'))) as {role?:string};if(payload.role!=='anon')throw Error();}catch{throw Error('Chave pública inválida.');}
  }
  return createClient(config.url,config.publishableKey,{auth:{storage:config.storage,storageKey:`donos-${config.app}-auth`,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
}
export async function logoutOwner(revoke:()=>Promise<void>,provider:()=>Promise<unknown>,clear:()=>void):Promise<boolean>{
  let revoked=false;
  try{await revoke();revoked=true;}catch{/* UI receives explicit remote failure. */}
  try{await provider();}catch{/* Local cleanup is unconditional. */}finally{clear();}
  return revoked;
}
