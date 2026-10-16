import type {ProtectedContentProps} from '@donos/auth-client';
import {StaleContextError} from '@donos/auth-client';
import type {ConversionVersion,Ingredient,Page} from '@donos/contracts';

export function createRecipesClient({api,store,selection}:ProtectedContentProps){
 const generation=store.snapshot().generation;
 const base=`/v1/organizations/${selection.organizationId}/restaurants/${selection.restaurantId}`;
 const assert=()=>{store.assertCurrent(generation);if(store.snapshot().selection?.token!==selection.token)throw new StaleContextError();};
 return {
  assert,
  read:<T>(path:string)=>{assert();return store.read(()=>api<T>(base+path,{contextToken:selection.token}));},
  write:async<T>(path:string,body:unknown,key:string)=>{assert();const result=await store.submit(generation,()=>api<T>(base+path,{method:'POST',body,contextToken:selection.token,idempotencyKey:key}));assert();return result;},
  listIngredients:async()=>{const page=await (async()=>{const rows:Ingredient[]=[];let cursor:string|null=null;do{const part=await store.read(()=>api<Page<Ingredient>>(`${base}/inventory/ingredients?includeArchived=false&limit=100${cursor?`&cursor=${cursor}`:''}`,{contextToken:selection.token}));rows.push(...part.items);cursor=part.nextCursor;}while(cursor);return rows;})();assert();return page;},
  listConversions:async(ingredientId:string)=>{assert();const page=await store.read(()=>api<Page<ConversionVersion>>(`${base}/inventory/ingredients/${ingredientId}/conversions`,{contextToken:selection.token}));assert();return page.items;},
 };
}
export type RecipesClient=ReturnType<typeof createRecipesClient>;
