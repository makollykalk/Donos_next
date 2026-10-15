import type {ApiClient,ProtectedContentProps} from '@donos/auth-client';
import {StaleContextError} from '@donos/auth-client';
export function createInventoryClient({api,store,selection}:ProtectedContentProps){
 const generation=store.snapshot().generation;
 const base=`/v1/organizations/${selection.organizationId}/restaurants/${selection.restaurantId}/inventory`;
 const assert=()=>{store.assertCurrent(generation);if(store.snapshot().selection?.token!==selection.token)throw new StaleContextError();};
 return {
  read:<T>(path:string)=>{assert();return store.read(()=>api<T>(base+path,{contextToken:selection.token}));},
  write:async<T>(path:string,body:unknown,key:string,method='POST')=>{assert();const result=await store.submit(generation,()=>api<T>(base+path,{method,body,contextToken:selection.token,idempotencyKey:key}));assert();return result;},
  assert,
 };
}
export type InventoryClient=ReturnType<typeof createInventoryClient>;
export type RequestOptions=Parameters<ApiClient>[1];
