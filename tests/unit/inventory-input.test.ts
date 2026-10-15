import {describe,it,expect} from 'vitest';
import {normalizeDecimalInput,formatRatio} from '../../apps/estoque/src/inventory/decimal-input.js';
import {ContextStore,StaleContextError} from '@donos/auth-client';
import type {ApiClient} from '@donos/auth-client';
import type {SelectedContext} from '@donos/contracts';
import {createInventoryClient} from '../../apps/estoque/src/inventory/inventory-client.js';
import {ReadGeneration} from '../../apps/estoque/src/inventory/read-generation.js';
describe('inventory UI decimal strings',()=>{
 it('normalizes decimal comma without rounding or binary floats',()=>{
  expect(normalizeDecimalInput('0002,500000',6)).toBe('2.5');
  expect(normalizeDecimalInput('999999999999999999,123456',6)).toBe('999999999999999999.123456');
  expect(normalizeDecimalInput('0,000000000001',12)).toBe('0.000000000001');
 });
 it('rejects groups, exponent, signs, excess precision and blanks',()=>{
  for(const value of ['1.234,56','1e3','-1','+1','','0.0000001'])expect(()=>normalizeDecimalInput(value,6)).toThrow();
 });
 it('formats ratios half even while preserving authoritative ratio separately',()=>{
  expect(formatRatio({numerator:'335',denominator:'15'})).toBe('22,33');
  expect(formatRatio({numerator:'1.005',denominator:'1'})).toBe('1,00');
  expect(formatRatio({numerator:'1.015',denominator:'1'})).toBe('1,02');
  expect(formatRatio(null)).toBe('—');
 });
});
it('discards pages from an older filter and serializes pagination per query',()=>{
 const reads=new ReadGeneration();const first=reads.reset();expect(reads.page()).toBe(first);expect(reads.page()).toBeNull();const next=reads.reset();expect(reads.current(first)).toBe(false);expect(reads.page()).toBe(next);reads.finish(first);expect(reads.page()).toBeNull();reads.finish(next);expect(reads.page()).toBe(next);
});
describe('inventory UI context client',()=>{
 const selection={organizationId:'31000000-0000-4000-8000-000000000010',restaurantId:'31000000-0000-4000-8000-000000000011',token:'a'.repeat(64),expiresAt:'2026-10-16T00:00:00.000Z'} satisfies SelectedContext;
 it('rejects a captured form after the store changes without sending a request',async()=>{
  const store=new ContextStore(async()=>selection);await store.select(selection);let calls=0;const api=(async()=>{calls++;return {};}) as ApiClient;const client=createInventoryClient({api,store,selection});store.clear();await expect(client.write('/issues',{},'key')).rejects.toBeInstanceOf(StaleContextError);expect(calls).toBe(0);
 });
 it('discards a delayed response and retains original route and opaque token',async()=>{
  const store=new ContextStore(async()=>selection);await store.select(selection);let resolve:(value:unknown)=>void=()=>{};const pending=new Promise(resolvePromise=>{resolve=resolvePromise;});let route='',token='';const api=(async(path,options)=>{route=path;token=options?.contextToken??'';return pending;}) as ApiClient;const client=createInventoryClient({api,store,selection});const result=client.read('/ingredients');store.clear();resolve({items:[{name:'A1'}]});await expect(result).rejects.toBeInstanceOf(StaleContextError);expect(route).toContain(selection.restaurantId);expect(token).toBe(selection.token);
 });
});
