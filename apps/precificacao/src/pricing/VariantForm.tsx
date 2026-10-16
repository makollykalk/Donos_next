import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreatePricingVariantInput, PricingVariantSummary } from '@donos/contracts';
import { normalizePricingDecimalInput } from './decimal-input.js';
import type { PricingClient } from './pricing-client.js';

export function VariantForm({ client, productId, onCreated }: { client: PricingClient; productId: string; onCreated: (variant: PricingVariantSummary) => void }) {
  const [name, setName] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [ingredientCost, setIngredientCost] = useState('');
  const [otherCost, setOtherCost] = useState('0');
  const [packagingName, setPackagingName] = useState('');
  const [packagingCost, setPackagingCost] = useState('');
  const [packagingId, setPackagingId] = useState(() => crypto.randomUUID());
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = () => { setKey(crypto.randomUUID()); setError(''); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const packageName = packagingName.trim();
      const packageCost = normalizePricingDecimalInput(packagingCost, 12, true);
      if (Boolean(packageName) !== Boolean(packageCost)) throw new Error('Preencha nome e custo da embalagem, ou deixe os dois vazios.');
      const input: CreatePricingVariantInput = {
        name: name.trim(),
        listPrice: normalizePricingDecimalInput(listPrice, 12) as CreatePricingVariantInput['listPrice'],
        costSource: { kind: 'manual', ingredientCost: normalizePricingDecimalInput(ingredientCost, 12), currency: 'BRL' },
        packaging: packageName ? [{ id: packagingId, name: packageName, costPerSale: packageCost }] : [],
        otherVariableCost: normalizePricingDecimalInput(otherCost, 12),
      };
      const result = await client.createVariant(productId, input, key);
      client.assert(); onCreated({ id: result.id, name: result.name, listPrice: result.listPrice, status: 'active', costSourceKind: 'manual' }); setName(''); setListPrice(''); setIngredientCost(''); setOtherCost('0'); setPackagingName(''); setPackagingCost(''); setPackagingId(crypto.randomUUID()); setKey(crypto.randomUUID());
    } catch (reason) {
      try { client.assert(); setError(reason instanceof Error ? reason.message : 'Não foi possível criar a variação.'); } catch { /* The context changed while saving. */ }
    } finally { try { client.assert(); setBusy(false); } catch { /* Ignore stale completion. */ } }
  }
  return <form onSubmit={event => void submit(event)} aria-label="Nova variação manual">
    <h3>Nova variação — custos informados manualmente</h3>
    <p>Os custos desta simulação são informados pelo responsável. A ficha e o estoque não são consultados.</p>
    <label>Nome da variação<input required maxLength={120} value={name} disabled={busy} onChange={event => { setName(event.target.value); changed(); }}/></label>
    <label>Preço de lista (R$)<input inputMode="decimal" required value={listPrice} disabled={busy} onChange={event => { setListPrice(event.target.value); changed(); }}/></label>
    <label>Custo manual de ingredientes (R$)<input inputMode="decimal" required value={ingredientCost} disabled={busy} onChange={event => { setIngredientCost(event.target.value); changed(); }}/></label>
    <label>Embalagem (opcional)<input maxLength={120} value={packagingName} disabled={busy} onChange={event => { setPackagingName(event.target.value); changed(); }}/></label>
    <label>Custo da embalagem por venda (R$)<input inputMode="decimal" value={packagingCost} disabled={busy} onChange={event => { setPackagingCost(event.target.value); changed(); }}/></label>
    <label>Outros custos variáveis por venda (R$)<input inputMode="decimal" required value={otherCost} disabled={busy} onChange={event => { setOtherCost(event.target.value); changed(); }}/></label>
    <button disabled={busy}>Salvar variação manual</button>{error && <p role="alert">{error}</p>}
  </form>;
}
