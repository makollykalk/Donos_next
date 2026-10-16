import type { ProtectedContentProps } from '@donos/auth-client';
import { StaleContextError } from '@donos/auth-client';

export function createShoppingClient({ api, store, selection }: ProtectedContentProps) {
  const generation = store.snapshot().generation;
  const base = `/v1/organizations/${selection.organizationId}/restaurants/${selection.restaurantId}/shopping`;
  const assert = () => {
    store.assertCurrent(generation);
    if (store.snapshot().selection?.token !== selection.token) throw new StaleContextError();
  };
  return {
    read: <T,>(path: string) => { assert(); return store.read(() => api<T>(base + path, { contextToken: selection.token })); },
    write: async <T,>(path: string, body: unknown, key: string, method = 'POST') => {
      assert();
      const result = await store.submit(generation, () => api<T>(base + path, { method, body, contextToken: selection.token, idempotencyKey: key }));
      assert();
      return result;
    },
    export: async (path: string) => { assert(); if (!api.text) throw new Error('Exportação textual indisponível neste cliente.'); return store.read(() => api.text!(base + path, { contextToken: selection.token })); },
    assert,
  };
}
export type ShoppingClient = ReturnType<typeof createShoppingClient>;
