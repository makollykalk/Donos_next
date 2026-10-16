import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreatePricingComboInput, PricingCombo, PricingVariantComboDetails, PricingVariantSummary } from '@donos/contracts';
import { normalizePricingDecimalInput } from './decimal-input.js';
import { formatBrl } from './format-brl.js';
import type { PricingClient } from './pricing-client.js';

type ComponentDraft = { key: string; variantId: string; quantity: string; variant: PricingVariantComboDetails | null; replacedPackagingPaths: string[][]; loading: boolean; error: string };
const newComponent = (): ComponentDraft => ({ key: crypto.randomUUID(), variantId: '', quantity: '1', variant: null, replacedPackagingPaths: [], loading: false, error: '' });
type PackagingDraft = { id: string; name: string; costPerSale: string };

export function ComboForm({ client, variants, onCreated }: { client: PricingClient; variants: PricingVariantSummary[]; onCreated: (combo: PricingCombo) => void }) {
  const [name, setName] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>([newComponent()]);
  const [exclusivePackaging, setExclusivePackaging] = useState<PackagingDraft[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = () => { setKey(crypto.randomUUID()); setError(''); };

  async function chooseVariant(componentKey: string, variantId: string) {
    changed();
    setComponents(items => items.map(item => item.key === componentKey ? { ...item, variantId, variant: null, replacedPackagingPaths: [], loading: Boolean(variantId), error: '' } : item));
    if (!variantId) return;
    try {
      const variant = await client.getVariant(variantId);
      client.assert();
      setComponents(items => items.map(item => item.key === componentKey && item.variantId === variantId ? { ...item, variant, loading: false } : item));
    } catch (reason) {
      try {
        client.assert();
        setComponents(items => items.map(item => item.key === componentKey && item.variantId === variantId ? { ...item, loading: false, error: reason instanceof Error ? reason.message : 'Não foi possível carregar a variação.' } : item));
      } catch { /* Ignore a response from a previous context. */ }
    }
  }

  function togglePackaging(componentKey: string, path: string[], checked: boolean) {
    setComponents(items => items.map(item => {
      if (item.key !== componentKey) return item;
      const current = item.replacedPackagingPaths;
      const next = checked ? [...current, path] : current.filter(candidate => JSON.stringify(candidate) !== JSON.stringify(path));
      return { ...item, replacedPackagingPaths: next };
    }));
    changed();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!components.length || components.some(item => !item.variantId || !item.variant || item.loading)) throw new Error('Selecione uma variação ativa para cada componente.');
      const input: CreatePricingComboInput = {
        name: name.trim(),
        listPrice: normalizePricingDecimalInput(listPrice, 12) as CreatePricingComboInput['listPrice'],
        components: components.map(item => ({
          variantId: item.variantId,
          quantity: normalizePricingDecimalInput(item.quantity, 12),
          replacedPackagingPaths: item.replacedPackagingPaths,
        })),
        exclusivePackaging: exclusivePackaging.map(item => ({ id: item.id, name: item.name.trim(), costPerSale: normalizePricingDecimalInput(item.costPerSale, 12) })),
      };
      if (components.some(item => normalizePricingDecimalInput(item.quantity, 12) === '0')) throw new Error('A quantidade dos componentes deve ser maior que zero.');
      const result = await client.createCombo(input, key);
      client.assert(); onCreated(result); setName(''); setListPrice(''); setComponents([newComponent()]); setExclusivePackaging([]); setKey(crypto.randomUUID());
    } catch (reason) {
      try { client.assert(); setError(reason instanceof Error ? reason.message : 'Não foi possível criar o combo.'); } catch { /* The context changed while saving. */ }
    } finally { try { client.assert(); setBusy(false); } catch { /* Ignore stale completion. */ } }
  }

  function addExclusivePackaging() { changed(); setExclusivePackaging(items => [...items, { id: crypto.randomUUID(), name: '', costPerSale: '' }]); }
  function patchExclusivePackaging(id: string, patch: Partial<PackagingDraft>) { changed(); setExclusivePackaging(items => items.map(item => item.id === id ? { ...item, ...patch } : item)); }
  const selectedIds = new Set(components.map(item => item.variantId).filter(Boolean));

  return <form onSubmit={event => void submit(event)} aria-label="Novo combo">
    <h3>Novo combo</h3>
    <label>Nome do combo<input required maxLength={120} value={name} disabled={busy} onChange={event => { setName(event.target.value); changed(); }}/></label>
    <label>Preço de lista do combo (R$)<input inputMode="decimal" required value={listPrice} disabled={busy} onChange={event => { setListPrice(event.target.value); changed(); }}/></label>
    <fieldset><legend>Componentes</legend>
      {components.map((item, index) => {
        const choices = variants.filter(candidate => candidate.status === 'active' && (!selectedIds.has(candidate.id) || candidate.id === item.variantId));
        const variantDetails = item.variant;
        const packagingPaths = variantDetails?.packagingPaths ?? [];
        return <fieldset key={item.key}>
          <legend>Componente {index + 1}</legend>
          <label>Variação do componente {index + 1}<select required value={item.variantId} disabled={busy} onChange={event => void chooseVariant(item.key, event.target.value)}><option value="">Selecione</option>{choices.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} — lista {formatBrl(candidate.listPrice)}</option>)}</select></label>
          <label>Quantidade do componente {index + 1}<input required inputMode="decimal" value={item.quantity} disabled={busy} onChange={event => { changed(); setComponents(rows => rows.map(row => row.key === item.key ? { ...row, quantity: event.target.value } : row)); }}/></label>
          {item.loading && <p role="status">Carregando custos e embalagens da variação…</p>}
          {item.error && <p role="alert">{item.error}</p>}
          {variantDetails?.packagingPathsAvailable === false && <p role="status">Detalhes de embalagens da ficha indisponíveis sem inventory_core. Não é possível configurar substituições para esta variação agora.</p>}
          {variantDetails?.packagingPathsAvailable === true && packagingPaths.length === 0 && <p>Nenhum caminho de embalagem substituível disponível para esta variação.</p>}
          {variantDetails && packagingPaths.length > 0 && <fieldset disabled={busy || !variantDetails.packagingPathsAvailable}>
            <legend>Substituir embalagens desta variação</legend>
            {packagingPaths.map(packaging => <label key={JSON.stringify(packaging.componentPath)}>
              <input type="checkbox" checked={item.replacedPackagingPaths.some(path => JSON.stringify(path) === JSON.stringify(packaging.componentPath))} onChange={event => togglePackaging(item.key, packaging.componentPath, event.target.checked)}/>
              Substituir embalagem {variantDetails.name} — {packaging.label}
            </label>)}
          </fieldset>}
          {components.length > 1 && <button type="button" disabled={busy} onClick={() => { changed(); setComponents(rows => rows.filter(row => row.key !== item.key)); }}>Remover componente {index + 1}</button>}
        </fieldset>;
      })}
      <button type="button" disabled={busy || components.length >= 100} onClick={() => { changed(); setComponents(items => [...items, newComponent()]); }}>Adicionar componente</button>
    </fieldset>
    <fieldset><legend>Embalagens exclusivas do combo</legend>
      {!exclusivePackaging.length && <p>Nenhuma embalagem exclusiva adicionada.</p>}
      {exclusivePackaging.map((item, index) => <fieldset key={item.id}>
        <legend>Embalagem exclusiva {index + 1}</legend>
        <label>Nome da embalagem exclusiva {index + 1}<input required maxLength={120} value={item.name} disabled={busy} onChange={event => patchExclusivePackaging(item.id, { name: event.target.value })}/></label>
        <label>Custo por venda da embalagem exclusiva {index + 1} (R$)<input required inputMode="decimal" value={item.costPerSale} disabled={busy} onChange={event => patchExclusivePackaging(item.id, { costPerSale: event.target.value })}/></label>
        <button type="button" disabled={busy} onClick={() => { changed(); setExclusivePackaging(rows => rows.filter(row => row.id !== item.id)); }}>Remover embalagem exclusiva {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={busy || exclusivePackaging.length >= 100} onClick={addExclusivePackaging}>Adicionar embalagem exclusiva</button>
    </fieldset>
    <button disabled={busy || variants.filter(item => item.status === 'active').length === 0}>Salvar combo</button>{error && <p role="alert">{error}</p>}
  </form>;
}
