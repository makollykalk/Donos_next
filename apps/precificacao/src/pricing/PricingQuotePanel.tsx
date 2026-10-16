import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreatePricingSimulationInput, PricingChannelProfile, PricingCombo, PricingSimulation, PricingVariantSummary } from '@donos/contracts';
import { normalizePricingDecimalInput } from './decimal-input.js';
import { formatBrl } from './format-brl.js';
import type { PricingClient } from './pricing-client.js';

const money = formatBrl;
function percent(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  const digits = whole + fraction;
  const resultScale = fraction.length - 2;
  const raw = resultScale <= 0
    ? digits + '0'.repeat(-resultScale)
    : `${digits.padStart(resultScale + 1, '0').slice(0, -resultScale)}.${digits.padStart(resultScale + 1, '0').slice(-resultScale)}`;
  return `${raw.replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '').replace('.', ',')}%`;
}
const metric = (label: string, values: { netRevenue: string; contributionMargin: string; cmv: string } | null) => <p>{label}: {values ? `receita líquida ${money(values.netRevenue)}; margem ${percent(values.contributionMargin)}; CMV ${percent(values.cmv)}` : 'indisponível'}</p>;

export function PricingQuotePanel({ client, variants, combos, channels, onSimulated }: { client: PricingClient; variants: PricingVariantSummary[]; combos: PricingCombo[]; channels: PricingChannelProfile[]; onSimulated: (simulation: PricingSimulation) => void }) {
  const [targetKind, setTargetKind] = useState<'variant' | 'combo'>('variant');
  const [targetId, setTargetId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [margin, setMargin] = useState('0,3');
  const [cmv, setCmv] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [simulation, setSimulation] = useState<PricingSimulation | null>(null);
  const changed = () => { setKey(crypto.randomUUID()); setError(''); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!margin.trim() && !cmv.trim()) throw new Error('Informe uma meta de margem ou CMV.');
      const input: CreatePricingSimulationInput = {
        variantId: targetKind === 'variant' ? targetId : null,
        comboId: targetKind === 'combo' ? targetId : null,
        channelId,
        targetContributionMargin: margin.trim() ? normalizePricingDecimalInput(margin, 12) : null,
        targetCmv: cmv.trim() ? normalizePricingDecimalInput(cmv, 12) : null,
      };
      const result = await client.simulate(input, key);
      client.assert(); setSimulation(result); onSimulated(result); setKey(crypto.randomUUID());
    } catch (reason) {
      try { client.assert(); setError(reason instanceof Error ? reason.message : 'Não foi possível simular.'); } catch { /* The context changed while saving. */ }
    } finally { try { client.assert(); setBusy(false); } catch { /* Ignore stale completion. */ } }
  }
  const chosenChannel = channels.find(channel => channel.id === simulation?.channelId);
  return <section aria-label="Simulação de preço">
    <h3>Simular preço</h3>
    <form onSubmit={event => void submit(event)}>
      <label>Tipo de simulação<select aria-label="Tipo de simulação" value={targetKind} disabled={busy} onChange={event => { setTargetKind(event.target.value as 'variant' | 'combo'); setTargetId(''); changed(); }}><option value="variant">Variação</option><option value="combo" disabled={combos.filter(item => !item.archivedAt && item.listPrice !== null).length === 0}>Combo</option></select></label>
      {targetKind === 'variant'
        ? <label>Variação<select required value={targetId} disabled={busy || variants.length === 0} onChange={event => { setTargetId(event.target.value); changed(); }}><option value="">Selecione</option>{variants.map(item => <option key={item.id} value={item.id}>{item.name} — lista {money(item.listPrice)}</option>)}</select></label>
        : <label>Combo<select required value={targetId} disabled={busy || combos.length === 0} onChange={event => { setTargetId(event.target.value); changed(); }}><option value="">Selecione</option>{combos.filter(item => !item.archivedAt && item.listPrice !== null).map(item => <option key={item.id} value={item.id}>{item.name} — lista {money(item.listPrice!)}</option>)}</select></label>}
      <label>Perfil de canal<select required value={channelId} disabled={busy || channels.length === 0} onChange={event => { setChannelId(event.target.value); changed(); }}><option value="">Selecione</option>{channels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Meta de margem de contribuição (fração; 0,3 = 30%)<input inputMode="decimal" value={margin} disabled={busy} onChange={event => { setMargin(event.target.value); changed(); }}/></label>
      <label>Meta de CMV (opcional; fração)<input inputMode="decimal" value={cmv} disabled={busy} onChange={event => { setCmv(event.target.value); changed(); }}/></label>
      <button disabled={busy || (targetKind === 'variant' ? variants.length === 0 : combos.filter(item => !item.archivedAt && item.listPrice !== null).length === 0) || channels.length === 0}>Calcular preço sugerido</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {simulation && <article aria-label="Resultado da simulação">
      <h4>Resultado — {simulation.createdAt}</h4>
      {simulation.comboSnapshot
        ? <><p>Combo: {simulation.comboSnapshot.name}; preço de lista congelado {simulation.comboSnapshot.listPrice ? money(simulation.comboSnapshot.listPrice) : 'indisponível'}.</p><p>Componentes congelados: {simulation.componentCostSnapshots.map(component => 'variantSnapshot' in component ? `${component.variantSnapshot.name} × ${component.quantity}` : `variação ${component.variantId} × ${component.quantity} (snapshot legado)`).join('; ')}.</p></>
        : <p>Fonte do custo: {simulation.costSourceSnapshot?.kind === 'manual' ? `informado manualmente pelo responsável; ingrediente ${money(simulation.costSourceSnapshot.ingredientCost)}` : simulation.costSourceSnapshot?.kind === 'recipe' ? `ficha ${simulation.costSourceSnapshot.recipeId}, versão ${simulation.costSourceSnapshot.recipeVersionId}` : 'indisponível'}.</p>}
      <p>Preço sugerido: {simulation.quote.suggestedPrice ? money(simulation.quote.suggestedPrice) : 'indisponível'}{simulation.quote.reason ? ` — ${simulation.quote.reason}` : ''}</p>
      <p>Custos: ingredientes {money(simulation.quote.costBuckets.ingredients)}, embalagens {money(simulation.quote.costBuckets.packaging)}, outros variáveis {money(simulation.quote.costBuckets.otherVariable)}; total {money(simulation.quote.totalVariableCost)}.</p>
      {metric('Preço atual', simulation.quote.currentPriceMetrics)}
      {metric('Preço sugerido', simulation.quote.suggestedPriceMetrics)}
      <h5>Incidências do canal por venda</h5>
      {simulation.quote.rateBreakdown.length ? <ul>{simulation.quote.rateBreakdown.map(item => {
        const rate = chosenChannel?.rates.find(candidate => candidate.id === item.rateId);
        return <li key={item.rateId}>{rate?.kind === 'tax' ? 'Tributo' : rate?.kind === 'discount' ? 'Desconto' : 'Taxa'}: base {item.base === null ? 'valor fixo por venda' : money(item.base)}, valor {money(item.amount)}.</li>;
      })}</ul> : <p>Este perfil não possui incidências.</p>}
    </article>}
  </section>;
}
