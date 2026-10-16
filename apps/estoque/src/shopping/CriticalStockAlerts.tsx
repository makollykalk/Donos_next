import type { Ingredient, StockBalance, StockThreshold } from '@donos/contracts';
import { ThresholdForm } from './ThresholdForm.js';
import type { ShoppingClient } from './shopping-client.js';

function compareQuantity(left: string, right: string) {
  const units = (value: string) => { const [whole = '0', fraction = ''] = value.split('.'); return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')); };
  const a = units(left), b = units(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

type Props = { client: ShoppingClient; ingredients: Ingredient[]; balances: StockBalance[]; thresholds: StockThreshold[]; locationId: string; onChanged: () => void };
export function CriticalStockAlerts({ client, ingredients, balances, thresholds, locationId, onChanged }: Props) {
  const active = ingredients.filter(item => !item.archived);
  const critical = active.filter(item => {
    const limit = thresholds.find(t => t.ingredientId === item.id);
    const balance = balances.find(b => b.ingredientId === item.id)?.quantity ?? '0';
    return !!limit && compareQuantity(balance, limit.minimumQuantity) <= 0;
  });
  return <section aria-label="Alertas de estoque crítico"><h3>Estoque mínimo e alertas — Base</h3>
    {critical.length ? <ul>{critical.map(item => <li key={item.id}><strong>{item.name}</strong>: saldo {balances.find(b => b.ingredientId === item.id)?.quantity ?? '0'} {item.baseUnit}, no mínimo ou abaixo.</li>)}</ul> : <p>Nenhum insumo está no mínimo configurado.</p>}
    <details><summary>Configurar mínimos e alvos</summary>{active.map(item => { const threshold = thresholds.find(t => t.ingredientId === item.id); return <ThresholdForm key={`${locationId}:${item.id}:${threshold?.updatedAt ?? 'new'}`} client={client} ingredient={item} locationId={locationId} {...(threshold ? { threshold } : {})} quantity={balances.find(b => b.ingredientId === item.id)?.quantity ?? '0'} onSaved={onChanged} />; })}</details>
  </section>;
}
