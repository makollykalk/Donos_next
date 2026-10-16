import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreatePricingChannelInput, PricingChannelProfile, PricingRateInput } from '@donos/contracts';
import { normalizePricingDecimalInput } from './decimal-input.js';
import type { PricingClient } from './pricing-client.js';

type DraftRate = { id: string; kind: 'fee' | 'tax' | 'discount'; mode: 'percentage' | 'fixed'; value: string; rateBase: 'list_price' | 'net_after_discount' };
const newRate = (): DraftRate => ({ id: crypto.randomUUID(), kind: 'fee', mode: 'percentage', value: '', rateBase: 'net_after_discount' });

export function ChannelProfileForm({ client, onCreated }: { client: PricingClient; onCreated: (channel: PricingChannelProfile) => void }) {
  const [name, setName] = useState('');
  const [rates, setRates] = useState<DraftRate[]>([newRate()]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = () => { setKey(crypto.randomUUID()); setError(''); };
  const patchRate = (id: string, patch: Partial<DraftRate>) => { changed(); setRates(items => items.map(item => item.id === id ? { ...item, ...patch } : item)); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const normalizedRates: PricingRateInput[] = rates.map(rate => rate.mode === 'percentage'
        ? { id: rate.id, kind: rate.kind, mode: 'percentage', value: normalizePricingDecimalInput(rate.value, 12) as PricingRateInput['value'], rateBase: rate.kind === 'discount' ? 'list_price' : rate.rateBase, fixedBasis: 'per_sale' }
        : { id: rate.id, kind: rate.kind, mode: 'fixed', value: normalizePricingDecimalInput(rate.value, 12) as PricingRateInput['value'], rateBase: null, fixedBasis: 'per_sale' }) as PricingRateInput[];
      const input: CreatePricingChannelInput = { name: name.trim(), rates: normalizedRates };
      const result = await client.createChannel(input, key);
      client.assert(); onCreated(result); setName(''); setRates([newRate()]); setKey(crypto.randomUUID());
    } catch (reason) {
      try { client.assert(); setError(reason instanceof Error ? reason.message : 'Não foi possível criar o perfil.'); } catch { /* The context changed while saving. */ }
    } finally { try { client.assert(); setBusy(false); } catch { /* Ignore stale completion. */ } }
  }
  return <form onSubmit={event => void submit(event)} aria-label="Novo perfil de canal">
    <h3>Novo perfil de canal</h3>
    <label>Nome do canal<input required maxLength={120} value={name} disabled={busy} onChange={event => { setName(event.target.value); changed(); }}/></label>
    <fieldset><legend>Taxas, tributos e descontos</legend>
      {rates.map((rate, index) => <fieldset key={rate.id}>
        <legend>Incidência {index + 1}</legend>
        <label>Tipo<select value={rate.kind} disabled={busy} onChange={event => patchRate(rate.id, { kind: event.target.value as DraftRate['kind'] })}><option value="fee">Taxa do canal</option><option value="tax">Tributo informado</option><option value="discount">Desconto comercial</option></select></label>
        <label>Forma<select value={rate.mode} disabled={busy} onChange={event => patchRate(rate.id, { mode: event.target.value as DraftRate['mode'], value: '' })}><option value="percentage">Percentual (ex.: 0,1 = 10%)</option><option value="fixed">Valor fixo por venda (R$)</option></select></label>
        <label>{rate.mode === 'percentage' ? 'Percentual em fração decimal' : 'Valor por venda (R$)'}<input required inputMode="decimal" value={rate.value} disabled={busy} onChange={event => patchRate(rate.id, { value: event.target.value })}/></label>
        {rate.mode === 'percentage' && rate.kind !== 'discount' && <label>Base da incidência<select value={rate.rateBase} disabled={busy} onChange={event => patchRate(rate.id, { rateBase: event.target.value as DraftRate['rateBase'] })}><option value="list_price">Preço de lista</option><option value="net_after_discount">Preço após desconto</option></select></label>}
        {rate.kind === 'discount' && rate.mode === 'percentage' && <p>Desconto percentual incide sobre o preço de lista.</p>}
        <p>Valores fixos são aplicados uma vez por venda.</p>
        <button type="button" disabled={busy || rates.length <= 1} onClick={() => { changed(); setRates(items => items.filter(item => item.id !== rate.id)); }}>Remover incidência</button>
      </fieldset>)}
      <button type="button" disabled={busy || rates.length >= 100} onClick={() => { changed(); setRates(items => [...items, newRate()]); }}>Adicionar incidência</button>
    </fieldset>
    <button disabled={busy}>Salvar perfil</button>{error && <p role="alert">{error}</p>}
  </form>;
}
