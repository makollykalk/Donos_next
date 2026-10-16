import type { ProtectedContentProps } from '@donos/auth-client';
import { StaleContextError } from '@donos/auth-client';
import type {
  CreatePricingChannelInput, CreatePricingComboInput, CreatePricingProductInput,
  CreatePricingSimulationInput, CreatePricingVariantInput, Page, PricingChannelProfile, PricingVariant, PricingVariantComboDetails,
  PricingCombo, PricingProduct, PricingSimulation,
} from '@donos/contracts';

export function createPricingClient({ api, store, selection }: ProtectedContentProps) {
  const generation = store.snapshot().generation;
  const base = `/v1/organizations/${selection.organizationId}/restaurants/${selection.restaurantId}/pricing`;
  const assert = () => {
    store.assertCurrent(generation);
    if (store.snapshot().selection?.token !== selection.token) throw new StaleContextError();
  };
  const read = <T,>(path: string) => {
    assert();
    return store.read(() => api<T>(base + path, { contextToken: selection.token }));
  };
  const write = <T,>(path: string, body: unknown, key: string, method: 'POST' | 'PATCH' = 'POST') => {
    assert();
    return store.submit(generation, async () => {
      const result = await api<T>(base + path, { method, body, contextToken: selection.token, idempotencyKey: key });
      assert();
      return result;
    });
  };
  const all = async <T,>(path: string) => {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<T> = await read<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    assert();
    return items;
  };
  return {
    assert,
    listProducts: () => all<PricingProduct>('/products'),
    createProduct: (input: CreatePricingProductInput, key: string) => write<PricingProduct>('/products', input, key),
    updateProduct: (id: string, input: object, key: string) => write<PricingProduct>(`/products/${encodeURIComponent(id)}`, input, key, 'PATCH'),
    createVariant: (productId: string, input: CreatePricingVariantInput, key: string) => write<PricingVariant>(`/products/${encodeURIComponent(productId)}/variants`, input, key),
    getVariant: (id: string) => read<PricingVariantComboDetails>(`/variants/${encodeURIComponent(id)}`),
    updateVariant: (id: string, input: object, key: string) => write(`/variants/${encodeURIComponent(id)}`, input, key, 'PATCH'),
    listChannels: () => all<PricingChannelProfile>('/channels'),
    createChannel: (input: CreatePricingChannelInput, key: string) => write<PricingChannelProfile>('/channels', input, key),
    updateChannel: (id: string, input: object, key: string) => write<PricingChannelProfile>(`/channels/${encodeURIComponent(id)}`, input, key, 'PATCH'),
    listCombos: () => all<PricingCombo>('/combos'),
    createCombo: (input: CreatePricingComboInput, key: string) => write<PricingCombo>('/combos', input, key),
    updateCombo: (id: string, input: object, key: string) => write<PricingCombo>(`/combos/${encodeURIComponent(id)}`, input, key, 'PATCH'),
    simulate: (input: CreatePricingSimulationInput, key: string) => write<PricingSimulation>('/simulations', input, key),
    listSimulations: (filter: { productId: string }) => {
      const query = new URLSearchParams();
      query.set('productId', filter.productId);
      return all<PricingSimulation>(`/simulations?${query.toString()}`);
    },
  };
}

export type PricingClient = ReturnType<typeof createPricingClient>;
