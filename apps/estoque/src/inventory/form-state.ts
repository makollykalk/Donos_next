import {useRef,useState} from 'react';
import type {InventoryClient} from './inventory-client.js';
export function useCommand(client:InventoryClient,onSuccess:()=>void){
 const[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false),keys=useRef(new Map<string,string>());
 const changed=()=>{keys.current.clear();setError('');};
 const run=async(operation:(key:string)=>Promise<unknown>,identity='form')=>{if(pending.current)return false;pending.current=true;setBusy(true);setError('');let key=keys.current.get(identity);if(!key){key=crypto.randomUUID();keys.current.set(identity,key);}try{await operation(key);client.assert();keys.current.delete(identity);onSuccess();return true;}catch(error){try{client.assert();setError(error instanceof Error?error.message:'Falha na operação.');}catch{/* Discard results after a context change. */}return false;}finally{pending.current=false;setBusy(false);}};
 return {busy,error,changed,run};
}
