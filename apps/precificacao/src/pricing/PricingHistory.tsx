import { useEffect, useState } from 'react';
import type { PricingSimulation } from '@donos/contracts';
import type { PricingClient } from './pricing-client.js';
import { formatBrl } from './format-brl.js';

const brl = formatBrl;
const componentVariantId = (component: PricingSimulation['componentCostSnapshots'][number]) =>
  'variantSnapshot' in component ? component.variantSnapshot.variantId : component.variantId;
function percent(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  const digits = whole + fraction;
  const resultScale = fraction.length - 2;
  const raw = resultScale <= 0 ? digits + '0'.repeat(-resultScale)
    : `${digits.padStart(resultScale + 1, '0').slice(0, -resultScale)}.${digits.padStart(resultScale + 1, '0').slice(-resultScale)}`;
  return `${raw.replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '').replace('.', ',')}%`;
}

export function PricingHistory({ client, productId, variantId, refreshKey = 0 }: { client: PricingClient; productId: string; variantId: string; refreshKey?: number }) {
  const [items, setItems] = useState<PricingSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]);
    void client.listSimulations({ productId }).then(result => {
      client.assert(); if (active) setItems(result.filter(item => item.variantId === variantId || item.componentCostSnapshots.some(component => componentVariantId(component) === variantId)));
    }).catch(reason => {
      try { client.assert(); if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico.'); } catch { /* Ignore stale request. */ }
    }).finally(() => { try { client.assert(); if (active) setLoading(false); } catch { /* Ignore stale request. */ } });
    return () => { active = false; };
  }, [client, productId, variantId, refreshKey]);
  return <section aria-label="Histórico de simulações">
    <h3>Histórico imutável</h3>
    {loading && <p role="status">Carregando simulações…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && items.length === 0 && <p>Nenhuma simulação salva para esta variação.</p>}
    <ol>{items.map(item => <li key={item.id}>
      <h4>{new Date(item.createdAt).toLocaleString('pt-BR')}</h4>
      <p>Fonte: {item.costSourceSnapshot?.kind === 'manual'
        ? `custo manual registrado em ${new Date(item.costSourceSnapshot.updatedAt).toLocaleString('pt-BR')}`
        : item.costSourceSnapshot?.kind === 'recipe'
          ? `ficha ${item.costSourceSnapshot.recipeId}, versão ${item.costSourceSnapshot.recipeVersionId}, calculada em ${new Date(item.costSourceSnapshot.calculatedAt).toLocaleString('pt-BR')}`
          : item.componentCostSnapshots.length ? `combo; ${item.componentCostSnapshots.length} componentes congelados` : 'indisponível'}.</p>
      <p>Preço sugerido: {item.quote.suggestedPrice ? brl(item.quote.suggestedPrice) : 'indisponível'}</p>
      <p>Custos — ingredientes: {brl(item.quote.costBuckets.ingredients)}; embalagens: {brl(item.quote.costBuckets.packaging)}; outros variáveis: {brl(item.quote.costBuckets.otherVariable)}.</p>
      {item.comboSnapshot && <><p>Combo congelado: {item.comboSnapshot.name}; preço de lista {item.comboSnapshot.listPrice ? brl(item.comboSnapshot.listPrice) : 'indisponível no snapshot legado'}.</p><ul>{item.componentCostSnapshots.map((component, index) => 'variantSnapshot' in component
        ? <li key={`${item.id}-${index}`}>{component.variantSnapshot.name} × {component.quantity}; preço congelado {brl(component.variantSnapshot.listPrice)}.</li>
        : <li key={`${item.id}-${index}`}>Variação {component.variantId} × {component.quantity}; snapshot legado de custo sem os dados comerciais congelados.</li>)}</ul></>}
      <p>Preço atual: {item.quote.currentPriceMetrics ? `margem ${percent(item.quote.currentPriceMetrics.contributionMargin)}, CMV ${percent(item.quote.currentPriceMetrics.cmv)}` : 'indisponível'}; preço sugerido: {item.quote.suggestedPriceMetrics ? `margem ${percent(item.quote.suggestedPriceMetrics.contributionMargin)}, CMV ${percent(item.quote.suggestedPriceMetrics.cmv)}` : 'indisponível'}.</p>
    </li>)}</ol>
  </section>;
}
