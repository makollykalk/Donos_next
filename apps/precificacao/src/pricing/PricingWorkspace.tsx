import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProtectedContentProps } from '@donos/auth-client';
import type { PricingChannelProfile, PricingCombo, PricingProduct, PricingSimulation, PricingVariantSummary } from '@donos/contracts';
import { createPricingClient } from './pricing-client.js';
import { ProductForm } from './ProductForm.js';
import { VariantForm } from './VariantForm.js';
import { ChannelProfileForm } from './ChannelProfileForm.js';
import { PricingQuotePanel } from './PricingQuotePanel.js';
import { PricingHistory } from './PricingHistory.js';
import { ComboForm } from './ComboForm.js';
import { formatBrl } from './format-brl.js';

type ProductWithVariants = { product: PricingProduct; variant: PricingVariantSummary };
export function PricingWorkspace(props: ProtectedContentProps) {
  const client = useMemo(() => createPricingClient(props), [props.api, props.store, props.selection.token]);
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [channels, setChannels] = useState<PricingChannelProfile[]>([]);
  const [combos, setCombos] = useState<PricingCombo[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const variants: ProductWithVariants[] = products.flatMap(product => product.variants.map(variant => ({ product, variant })));
  const selectedProduct = products.find(product => product.id === selectedProductId) ?? null;
  const selectedVariant = variants.find(item => item.variant.id === selectedVariantId)?.variant ?? null;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextProducts, nextChannels, nextCombos] = await Promise.all([client.listProducts(), client.listChannels(), client.listCombos()]);
      client.assert(); setProducts(nextProducts); setChannels(nextChannels); setCombos(nextCombos);
      setSelectedProductId(current => nextProducts.some(item => item.id === current) ? current : nextProducts[0]?.id ?? '');
      setSelectedVariantId(current => nextProducts.some(product => product.variants.some(variant => variant.id === current)) ? current : nextProducts.flatMap(product => product.variants)[0]?.id ?? '');
    } catch (reason) {
      try { client.assert(); setError(reason instanceof Error ? reason.message : 'Não foi possível carregar preços.'); } catch { /* Ignore a previous context response. */ }
    } finally { try { client.assert(); setLoading(false); } catch { /* Ignore stale completion. */ } }
  }, [client]);
  useEffect(() => { void load(); }, [load, refresh]);
  const productCreated = (product: PricingProduct) => {
    setProducts(items => [product, ...items.filter(item => item.id !== product.id)]);
    setSelectedProductId(product.id); setSelectedVariantId(''); setRefresh(value => value + 1);
  };
  const variantCreated = (variant: PricingVariantSummary) => { setSelectedVariantId(variant.id); setRefresh(value => value + 1); setHistoryRevision(value => value + 1); };
  const channelCreated = (channel: PricingChannelProfile) => { setChannels(items => [channel, ...items.filter(item => item.id !== channel.id)]); };
  const comboCreated = (combo: PricingCombo) => { setCombos(items => [combo, ...items.filter(item => item.id !== combo.id)]); };
  const simulationSaved = (simulation: PricingSimulation) => {
    const firstComboVariantId = simulation.comboSnapshot?.components[0]?.variantId;
    const focusVariantId = simulation.variantId ?? firstComboVariantId;
    if (focusVariantId) {
      setSelectedVariantId(focusVariantId);
      const ownerProduct = variants.find(item => item.variant.id === focusVariantId)?.product;
      if (ownerProduct) setSelectedProductId(ownerProduct.id);
    }
    setHistoryRevision(value => value + 1);
  };
  return <section aria-label="Precificação da unidade ativa" data-restaurant-id={props.selection.restaurantId}>
    <h2>Precificação da unidade ativa</h2>
    <p>Produtos, variações, combos, canais e simulações pertencem à unidade selecionada no cabeçalho.</p>
    <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Atualizar preços</button>
    {loading && <p role="status">Carregando catálogo de preços e histórico…</p>}
    {error && <p role="alert">{error}</p>}
    <ProductForm client={client} onCreated={productCreated}/>
    <section aria-label="Produtos e variações">
      <h3>Produtos e variações</h3>
      {!products.length && !loading && <p>Nenhum produto cadastrado nesta unidade.</p>}
      {products.length > 0 && <>
        <label>Produto<select value={selectedProductId} onChange={event => { setSelectedProductId(event.target.value); setSelectedVariantId(''); }}><option value="">Selecione</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        {selectedProduct && <>
          <ul>{selectedProduct.variants.map(variant => <li key={variant.id}><button type="button" aria-pressed={selectedVariantId === variant.id} onClick={() => setSelectedVariantId(variant.id)}>{variant.name} — {variant.status === 'archived' ? 'arquivada' : 'ativa'} — preço de lista {formatBrl(variant.listPrice)}</button></li>)}</ul>
          <VariantForm key={selectedProduct.id} client={client} productId={selectedProduct.id} onCreated={variantCreated}/>
        </>}
        {variants.some(item => item.variant.status === 'active') && <ComboForm client={client} variants={variants.map(item => item.variant)} onCreated={comboCreated}/>}
      </>}
    </section>
    <ChannelProfileForm client={client} onCreated={channelCreated}/>
    {!channels.length && <p>Cadastre um perfil de canal para simular taxas, descontos e tributos informados.</p>}
    {channels.length > 0 && <PricingQuotePanel client={client} variants={variants.map(item => item.variant).filter(item => item.status === 'active')} combos={combos} channels={channels.filter(item => !item.archivedAt)} onSimulated={simulationSaved}/>}
    {selectedVariant && <PricingHistory key={selectedVariant.id} client={client} productId={selectedProductId} variantId={selectedVariant.id} refreshKey={historyRevision}/>}
  </section>;
}
