import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreatePricingProductInput, PricingProduct } from '@donos/contracts';
import type { PricingClient } from './pricing-client.js';

export function ProductForm({ client, onCreated }: { client: PricingClient; onCreated: (product: PricingProduct) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const input: CreatePricingProductInput = { name: name.trim(), description: description.trim() || null };
      const result = await client.createProduct(input, key);
      client.assert(); onCreated(result); setName(''); setDescription(''); setKey(crypto.randomUUID());
    } catch (reason) {
      try { client.assert(); setError(reason instanceof Error ? reason.message : 'Não foi possível criar o produto.'); } catch { /* The context changed while saving. */ }
    } finally { try { client.assert(); setBusy(false); } catch { /* Ignore stale completion. */ } }
  }
  return <form onSubmit={event => void submit(event)} aria-label="Novo produto">
    <h3>Novo produto</h3>
    <label>Nome do produto<input required maxLength={120} value={name} disabled={busy} onChange={event => { setName(event.target.value); setKey(crypto.randomUUID()); }}/></label>
    <label>Descrição (opcional)<textarea maxLength={1000} value={description} disabled={busy} onChange={event => { setDescription(event.target.value); setKey(crypto.randomUUID()); }}/></label>
    <button disabled={busy}>Criar produto</button>{error && <p role="alert">{error}</p>}
  </form>;
}
