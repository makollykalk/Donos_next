import { useState } from 'react';
import type { Ingredient, StockThreshold } from '@donos/contracts';
import type { ShoppingClient } from './shopping-client.js';

type Props = { client: ShoppingClient; ingredient: Ingredient; locationId: string; threshold?: StockThreshold; quantity: string; onSaved: () => void };
export function ThresholdForm({ client, ingredient, locationId, threshold, quantity, onSaved }: Props) {
  const [minimum, setMinimum] = useState(threshold?.minimumQuantity ?? '0');
  const [target, setTarget] = useState(threshold?.targetQuantity ?? '0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void client.write<StockThreshold>(`/ingredients/${ingredient.id}/threshold`, { locationId, minimumQuantity: minimum, targetQuantity: target }, crypto.randomUUID(), 'PUT').then(() => onSaved()).catch(e => setError(e instanceof Error ? e.message : 'Falha ao salvar limite.')).finally(() => setBusy(false)); }}>
    <span>{quantity} {ingredient.baseUnit}</span>
    <label>Mínimo — {ingredient.name}<input aria-label={`Mínimo ${ingredient.name}`} inputMode="decimal" value={minimum} disabled={busy} onChange={e => setMinimum(e.target.value)} /></label>
    <label>Alvo — {ingredient.name}<input aria-label={`Alvo ${ingredient.name}`} inputMode="decimal" value={target} disabled={busy} onChange={e => setTarget(e.target.value)} /></label>
    <button type="submit" disabled={busy}>Salvar mínimo e alvo de {ingredient.name}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
