import { describe, expect, it, vi } from 'vitest';
import { ContextStore, StaleContextError } from '../../packages/auth-client/src/context-store.js';
import { logoutOwner } from '../../packages/auth-client/src/client.js';
import {createApiClient} from '../../packages/auth-client/src/api-client.js';
import type {SupabaseClient} from '@supabase/supabase-js';
const a = {organizationId:'10000000-0000-4000-8000-000000000010',restaurantId:'10000000-0000-4000-8000-000000000011'};
const b = {...a,restaurantId:'10000000-0000-4000-8000-000000000012'};
describe('per-tab memory context', () => {
  it('invalidates delayed reads and forms when switching units', async () => {
    const store = new ContextStore(async input => ({...input,token:'x'.repeat(64),expiresAt:'2099-01-01T00:00:00Z'}));
    await store.select(a);
    const generation = store.snapshot().generation;
    let resolve!: (value:string)=>void;
    const late = store.read(() => new Promise<string>(done => {resolve=done;}));
    await store.select(b);
    resolve('A1');
    await expect(late).rejects.toBeInstanceOf(StaleContextError);
    const send = vi.fn();
    await expect(store.submit(generation,send)).rejects.toBeInstanceOf(StaleContextError);
    expect(send).not.toHaveBeenCalled();
    expect(store.snapshot().selection?.restaurantId).toBe(b.restaurantId);
  });
  it('does not restore a context after a slower selection resolves', async () => {
    let resolve!: (value:typeof a & {token:string;expiresAt:string})=>void;
    const store = new ContextStore(input => input.restaurantId===a.restaurantId ? new Promise(done=>{resolve=done;}) : Promise.resolve({...input,token:'b',expiresAt:'2099-01-01T00:00:00Z'}));
    const first = store.select(a);
    await store.select(b);
    resolve({...a,token:'a',expiresAt:'2099-01-01T00:00:00Z'});
    await expect(first).rejects.toBeInstanceOf(StaleContextError);
    expect(store.snapshot().selection?.restaurantId).toBe(b.restaurantId);
    store.clear();
    expect(store.snapshot().selection).toBeNull();
  });
  it('revoke API precedes provider local signout and always clears state', async () => {
    const calls:string[]=[];
    await logoutOwner(async()=>{calls.push('api');},async()=>{calls.push('provider');throw Error('offline');},()=>{calls.push('clear');});
    expect(calls).toEqual(['api','provider','clear']);
    const provider=vi.fn(); const clear=vi.fn();
    expect(await logoutOwner(async()=>{throw Error('offline');},provider,clear)).toBe(false);
    expect(provider).toHaveBeenCalledOnce(); expect(clear).toHaveBeenCalledOnce();
  });
  it('keeps bearer and context in request headers, never the URL',async()=>{
    const auth={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-access'}},error:null})}} as unknown as SupabaseClient;
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({allowed:true}),{status:200}));
    vi.stubGlobal('fetch',fetcher);
    try{
      const api=createApiClient(auth,'http://127.0.0.1:3001');
      await api('/v1/organizations',{contextToken:'synthetic-context'});
      expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:3001/v1/organizations',expect.objectContaining({cache:'no-store',headers:{Authorization:'Bearer synthetic-access','X-Donos-Context':'synthetic-context'}}));
    }finally{vi.unstubAllGlobals();}
  });
});
