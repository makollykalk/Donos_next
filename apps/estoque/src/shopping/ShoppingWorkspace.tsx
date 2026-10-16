import { useEffect, useMemo, useState } from 'react';
import type { ProtectedContentProps } from '@donos/auth-client';
import type { Ingredient, StockBalance, StockThreshold, Supplier } from '@donos/contracts';
import { createInventoryClient } from '../inventory/inventory-client.js';
import { createShoppingClient } from './shopping-client.js';
import { CriticalStockAlerts } from './CriticalStockAlerts.js';
import { ShoppingListView } from './ShoppingListView.js';

type Props = ProtectedContentProps & { locationId: string; ingredients: Ingredient[]; balances: StockBalance[]; suppliers: Supplier[]; onChanged: () => void };
export function ShoppingWorkspace({ locationId, ingredients, balances, suppliers, onChanged, ...props }: Props) {
  const client = useMemo(() => createShoppingClient(props), [props.api, props.store, props.selection.token]);
  const inventory = useMemo(() => createInventoryClient(props), [props.api, props.store, props.selection.token]);
  const [thresholds, setThresholds] = useState<StockThreshold[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!locationId) { setThresholds([]); return; }
    let active = true;
    setError('');
    void client.read<{ items: StockThreshold[] }>(`/locations/${encodeURIComponent(locationId)}/thresholds`).then(result => { if (active) setThresholds(result.items); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Falha ao carregar mínimos e alvos.'); });
    return () => { active = false; };
  }, [client, locationId, revision]);
  const refresh = () => { setRevision(value => value + 1); onChanged(); };
  return <section aria-label="Compras e reposição" data-location-id={locationId}>
    {error && <p role="alert">{error}</p>}
    <CriticalStockAlerts client={client} ingredients={ingredients} balances={balances} thresholds={thresholds} locationId={locationId} onChanged={refresh} />
    <ShoppingListView key={`${props.selection.restaurantId}:${locationId}`} client={client} inventory={inventory} locationId={locationId} ingredients={ingredients} thresholds={thresholds} suppliers={suppliers} />
  </section>;
}
