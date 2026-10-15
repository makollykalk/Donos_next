import {useRef,useState} from 'react';
import type {RecipesClient} from './recipes-client.js';

export function useRecipeCommand(client:RecipesClient){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),keys=useRef(new Map<string,{signature:string;key:string}>());
 const changed=()=>{keys.current.clear();setError('');};
 const fail=(message:string)=>setError(message);
 const capture=(error:unknown)=>{
  try{client.assert();}catch{return;}
  const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
  const messages:Record<string,string>={RESOURCE_CONFLICT:'A ficha mudou ou há uma incompatibilidade. Atualize os dados e confira a composição.',RESOURCE_NOT_FOUND:'A ficha ou um componente não está disponível nesta unidade.',VALIDATION_ERROR:'Confira quantidades, unidades e etapas informadas.',CONTEXT_EXPIRED:'A unidade selecionada mudou. Selecione a unidade novamente.',CONTEXT_MISMATCH:'A unidade selecionada mudou. Selecione a unidade novamente.'};
  setError(messages[code]??(error instanceof Error?error.message:'Não foi possível salvar. Tente novamente.'));
 };
 const run=async<T=unknown>(path:string,body:unknown):Promise<T>=>{
  if(pending.current)throw Error('Aguarde a operação em andamento.');pending.current=true;setBusy(true);setError('');
  const signature=JSON.stringify(body),prior=keys.current.get(path),key=prior?.signature===signature?prior.key:crypto.randomUUID();keys.current.set(path,{signature,key});
  try{const result=await client.write<T>(path,body,key);client.assert();keys.current.delete(path);return result;}
  catch(error){capture(error);throw error;}
  finally{pending.current=false;setBusy(false);}
 };
 return {busy,error,changed,fail,capture,run};
}
